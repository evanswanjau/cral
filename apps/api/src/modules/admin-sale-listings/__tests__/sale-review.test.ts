import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";

/**
 * Ops sale-listing review and report-a-listing (Phase 6 CS2). The gates:
 * every check answered before any decision; approve needs no flags and an
 * approved account; a note for anything but approve; a moved case is 409;
 * each decision audited and the merchant notified. Reports: live only, one
 * open per buyer, pause sends the listing back through review, take down
 * is final, and both close every open report.
 */

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `sal-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

async function newMerchant(approved = true): Promise<{ token: string; merchantId: string }> {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Car",
    surname: "Seller",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: approved ? new Date() : null,
  });
  return { token: owner.accessToken, merchantId };
}

let plateSeq = 0;
const plate = () => `KC${String.fromCharCode(65 + (Date.now() % 26))} ${String(100 + (plateSeq++ % 900))}${String.fromCharCode(65 + ((Date.now() >> 7) % 26))}`;

async function submitted(token: string): Promise<string> {
  const res = await request(app)
    .post("/merchant/sale-listings")
    .set(bearer(token))
    .send({
      body_type: "sedan",
      make: "Mazda",
      model: "Axela",
      year: 2015,
      registration: plate(),
      mileage_km: 120000,
      transmission: "automatic",
      fuel: "petrol",
      import_status: "foreign_used",
      accident_history: "none",
      known_faults: "None known",
      encumbered: false,
      asking_price: { amount: 1_350_000_00, currency: "KES" },
      county: "Nairobi",
      viewing_area: "Kilimani",
    });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  for (let i = 0; i < 4; i++) {
    await request(app)
      .post(`/merchant/sale-listings/${id}/files`)
      .set(bearer(token))
      .field("kind", "photo")
      .attach("file", testJpeg(`p${i}`), { filename: "car.jpg", contentType: "image/jpeg" });
  }
  await request(app)
    .post(`/merchant/sale-listings/${id}/files`)
    .set(bearer(token))
    .field("kind", "logbook")
    .attach("file", testPdf("logbook"), { filename: "logbook.pdf", contentType: "application/pdf" });
  expect((await request(app).post(`/merchant/sale-listings/${id}/submit`).set(bearer(token))).status).toBe(200);
  return id;
}

const ITEMS = ["logbook_owner", "logbook_vehicle", "logbook_encumbrance", "photos_this_car", "photos_clear"];

async function answerAll(adminToken: string, id: string, flag?: string) {
  for (const item of ITEMS) {
    const res = await request(app)
      .post(`/admin/sale-listings/${id}/checklist`)
      .set(bearer(adminToken))
      .send(item === flag ? { item_id: item, result: "flag", note: "No plate in any photo" } : { item_id: item, result: "pass" });
    expect(res.status).toBe(200);
  }
}

const decide = (adminToken: string, id: string, body: Record<string, unknown>) =>
  request(app).post(`/admin/sale-listings/${id}/decision`).set(bearer(adminToken)).set(idem()).send(body);

async function liveListing(): Promise<{ id: string; token: string; merchantId: string; adminToken: string }> {
  const { token, merchantId } = await newMerchant();
  const admin = await newAdmin();
  const id = await submitted(token);
  await answerAll(admin.token, id);
  expect((await decide(admin.token, id, { action: "approve" })).status).toBe(200);
  return { id, token, merchantId, adminToken: admin.token };
}

async function buyer(): Promise<string> {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u.accessToken;
}

const report = (token: string, id: string, body: Record<string, unknown> = { reason: "scam", details: "Asked for a deposit" }) =>
  request(app).post(`/sale-listings/${id}/reports`).set(bearer(token)).send(body);

describe("Ops sale review", () => {
  it("needs the sales queue for a reviewer", async () => {
    const { token } = await newMerchant();
    const id = await submitted(token);
    const outsider = await newAdmin("admin_reviewer", ["vehicles"]);
    expect((await request(app).get(`/admin/sale-listings/${id}`).set(bearer(outsider.token))).status).toBe(403);
    const reviewer = await newAdmin("admin_reviewer", ["sales"]);
    const res = await request(app).get(`/admin/sale-listings/${id}`).set(bearer(reviewer.token));
    expect(res.status).toBe(200);
    expect(res.body.logbook.content_type).toBe("application/pdf");
    expect(res.body.checklist.total).toBe(5);
    expect(res.body.merchant.name).toContain("Seller");
  });

  it("shows the listing in the open queue, and answering a check claims it", async () => {
    const { token } = await newMerchant();
    const admin = await newAdmin();
    const id = await submitted(token);
    const q = await request(app).get("/admin/sale-listings?filter=open&limit=100").set(bearer(admin.token));
    expect(q.status).toBe(200);
    expect(q.body.data.some((r: { id: string }) => r.id === id)).toBe(true);
    await request(app).post(`/admin/sale-listings/${id}/checklist`).set(bearer(admin.token)).send({ item_id: "logbook_owner", result: "pass" });
    const row = await db("sale_listings").where({ id }).first();
    expect(row.status).toBe("review");
    expect(row.review_assignee).toBe(admin.adminId);
  });

  it("blocks every decision until all checks are answered, and approve while flagged", async () => {
    const { token } = await newMerchant();
    const admin = await newAdmin();
    const id = await submitted(token);
    expect((await decide(admin.token, id, { action: "approve" })).body.error.code).toBe("checklist_incomplete");
    expect((await decide(admin.token, id, { action: "reject", note: "No" })).body.error.code).toBe("checklist_incomplete");
    await answerAll(admin.token, id, "photos_this_car");
    expect((await decide(admin.token, id, { action: "approve" })).body.error.code).toBe("checklist_flagged");
    expect((await decide(admin.token, id, { action: "request_changes" })).body.error.code).toBe("reason_required");
    const res = await decide(admin.token, id, { action: "request_changes", note: "Add a photo with the plate." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("action");
    const n = await db("notifications").where({ subject_type: "sale_listing", subject_id: id });
    expect(n).toHaveLength(1);
    expect(n[0].body).toBe("Add a photo with the plate.");
  });

  it("won't approve while the merchant's account isn't approved", async () => {
    const { token } = await newMerchant(false);
    const admin = await newAdmin();
    const id = await submitted(token);
    await answerAll(admin.token, id);
    expect((await decide(admin.token, id, { action: "approve" })).body.error.code).toBe("merchant_not_approved");
  });

  it("approves to live with live_at, an audit row in the same write and a notification; then 409", async () => {
    const { id, adminToken } = await liveListing();
    const row = await db("sale_listings").where({ id }).first();
    expect(row.status).toBe("live");
    expect(row.live_at).not.toBeNull();
    const audit = await db("audit_log").where({ entity_type: "sale_listing", entity_id: id, action: "sale_listing.approved" });
    expect(audit).toHaveLength(1);
    expect(await db("notifications").where({ subject_type: "sale_listing", subject_id: id })).toHaveLength(1);
    expect((await decide(adminToken, id, { action: "reject", note: "late" })).body.error.code).toBe("sale_listing_not_in_review");
  });

  it("re-opens every answer when the merchant resubmits", async () => {
    const { token } = await newMerchant();
    const admin = await newAdmin();
    const id = await submitted(token);
    await answerAll(admin.token, id);
    await decide(admin.token, id, { action: "request_changes", note: "Fix the year." });
    await new Promise((r) => setTimeout(r, 5));
    expect((await request(app).post(`/merchant/sale-listings/${id}/submit`).set(bearer(token))).status).toBe(200);
    const res = await request(app).get(`/admin/sale-listings/${id}`).set(bearer(admin.token));
    expect(res.body.status).toBe("review");
    expect(res.body.checklist.checked).toBe(0);
  });
});

describe("report a listing", () => {
  it("files a report on a live listing only, once per buyer, and audits it", async () => {
    const { token } = await newMerchant();
    const pending = await submitted(token);
    const b = await buyer();
    expect((await report(b, pending)).status).toBe(404);

    const { id } = await liveListing();
    expect((await report(b, id, { reason: "nonsense" })).status).toBe(422);
    const res = await report(b, id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect((await report(b, id)).body.error.code).toBe("already_reported");
    const audit = await db("audit_log").where({ entity_type: "sale_listing", entity_id: id, action: "sale_listing.reported" });
    expect(audit).toHaveLength(1);
  });

  it("rate-limits a buyer to 5 reports an hour", async () => {
    const b = await buyer();
    const codes: number[] = [];
    const previous = process.env.RATE_LIMIT_IN_TEST;
    process.env.RATE_LIMIT_IN_TEST = "1";
    try {
      for (let i = 0; i < 6; i++) codes.push((await report(b, `sal_${ulid()}`)).status);
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMIT_IN_TEST;
      else process.env.RATE_LIMIT_IN_TEST = previous;
    }
    expect(codes.slice(0, 5).every((c) => c === 404)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("dismiss leaves the listing live", async () => {
    const { id, adminToken } = await liveListing();
    const r = await report(await buyer(), id);
    const res = await request(app)
      .post(`/admin/sale-reports/${r.body.id}/resolve`)
      .set(bearer(adminToken))
      .set(idem())
      .send({ action: "dismiss" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dismissed");
    expect((await db("sale_listings").where({ id }).first()).status).toBe("live");
  });

  it("pause sends the listing back through review, closes every open report and tells the merchant", async () => {
    const { id, token, adminToken } = await liveListing();
    const r1 = await report(await buyer(), id);
    const r2 = await report(await buyer(), id);
    const listed = await request(app).get("/admin/sale-reports?filter=open&limit=100").set(bearer(adminToken));
    expect(listed.body.data.filter((r: { listing: { id: string } }) => r.listing.id === id)).toHaveLength(2);

    const noNote = await request(app).post(`/admin/sale-reports/${r1.body.id}/resolve`).set(bearer(adminToken)).set(idem()).send({ action: "pause" });
    expect(noNote.body.error.code).toBe("reason_required");
    const res = await request(app)
      .post(`/admin/sale-reports/${r1.body.id}/resolve`)
      .set(bearer(adminToken))
      .set(idem())
      .send({ action: "pause", note: "Buyers say the mileage is wrong." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("actioned");
    expect((await db("sale_listing_reports").where({ id: r2.body.id }).first()).status).toBe("actioned");
    const row = await db("sale_listings").where({ id }).first();
    expect(row.status).toBe("action");
    expect(row.reviewer_note).toBe("Buyers say the mileage is wrong.");
    // The merchant can't switch it back on; only a resubmission does.
    expect((await request(app).post(`/merchant/sale-listings/${id}/status`).set(bearer(token)).send({ to: "live" })).status).toBe(409);
    const n = await db("notifications").where({ subject_type: "sale_listing", subject_id: id }).orderBy("created_at", "desc").first();
    expect(n.title).toContain("paused by CRAL");
    const again = await request(app)
      .post(`/admin/sale-reports/${r2.body.id}/resolve`)
      .set(bearer(adminToken))
      .set(idem())
      .send({ action: "dismiss" });
    expect(again.body.error.code).toBe("report_already_handled");
  });

  it("take down withdraws the listing for good", async () => {
    const { id, adminToken } = await liveListing();
    const r = await report(await buyer(), id);
    const res = await request(app)
      .post(`/admin/sale-reports/${r.body.id}/resolve`)
      .set(bearer(adminToken))
      .set(idem())
      .send({ action: "take_down", note: "The seller asked a buyer for a deposit." });
    expect(res.status).toBe(200);
    expect((await db("sale_listings").where({ id }).first()).status).toBe("withdrawn");
    const audit = await db("audit_log").where({ entity_type: "sale_listing", entity_id: id, action: "sale_listing.taken_down" });
    expect(audit).toHaveLength(1);
  });
});
