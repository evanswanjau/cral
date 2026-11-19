import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";

/**
 * Outlets (Phase 4 GS1): the merchant's "Your premises" API and the Ops
 * outlet queue. The state rules: drafts need photos and a service to be
 * sent; details lock while Ops has them; every check answered before any
 * decision; the visit is a record (date + who) behind a pass; approve
 * needs the account approved and no flags; a moved case is 409.
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
const idem = () => ({ "Idempotency-Key": `out-${ulid()}` });

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
    first_name: "Garage",
    surname: "Owner",
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

const GARAGE = {
  kind: "garage",
  name: "Mwangi Motors",
  address: "Enterprise Road, next to the Total station",
  county: "Nairobi",
  phone: "0712 345 678",
  opening_hours: "Mon to Sat, 8am to 6pm",
  service_types: ["service", "diagnostics"],
};

async function draft(token: string, body: Record<string, unknown> = GARAGE): Promise<string> {
  const res = await request(app).post("/merchant/outlets").set(bearer(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function addPhoto(token: string, outletId: string) {
  return request(app)
    .post(`/merchant/outlets/${outletId}/photos`)
    .set(bearer(token))
    .attach("file", testJpeg("front"), { filename: "front.jpg", contentType: "image/jpeg" });
}

async function submitted(token: string): Promise<string> {
  const id = await draft(token);
  await addPhoto(token, id);
  await addPhoto(token, id);
  const res = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
  expect(res.status).toBe(200);
  return id;
}

const VISIT = { item_id: "visit_done", result: "pass", visited_on: "2026-11-01", visited_by: "Jane Wambui" };

async function passAll(adminToken: string, outletId: string) {
  const items = (await request(app).get(`/admin/outlets/${outletId}`).set(bearer(adminToken))).body.checklist.items as Array<{ id: string }>;
  for (const it of items) {
    const body = it.id === "visit_done" ? VISIT : { item_id: it.id, result: "pass" };
    const res = await request(app).post(`/admin/outlets/${outletId}/checklist`).set(bearer(adminToken)).send(body);
    expect(res.status).toBe(200);
  }
}

describe("merchant premises", () => {
  it("creates a draft that isn't visited and isn't in the Ops queue", async () => {
    const { token } = await newMerchant();
    const id = await draft(token);
    const one = await request(app).get(`/merchant/outlets/${id}`).set(bearer(token));
    expect(one.body).toMatchObject({ status: "draft", kind: "garage", visited: false, visited_on: null, photos: [] });

    const admin = await newAdmin();
    expect((await request(app).get(`/admin/outlets/${id}`).set(bearer(admin.token))).status).toBe(404);
    const audit = await db("audit_log").where({ entity_type: "outlet", entity_id: id, action: "outlet.created" }).first();
    expect(audit).toBeTruthy();
  });

  it("takes garage and parts outlets (PT1) in real counties only", async () => {
    const { token } = await newMerchant();
    expect((await request(app).post("/merchant/outlets").set(bearer(token)).send({ ...GARAGE, kind: "tyres" })).status).toBe(422);
    expect((await request(app).post("/merchant/outlets").set(bearer(token)).send({ ...GARAGE, county: "Atlantis" })).status).toBe(422);
  });

  it("won't send without two photos and a service, and takes images only", async () => {
    const { token } = await newMerchant();
    const id = await draft(token, { ...GARAGE, service_types: [] });

    const pdf = await request(app)
      .post(`/merchant/outlets/${id}/photos`)
      .set(bearer(token))
      .attach("file", testPdf("x"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(pdf.status).toBe(422);
    expect(pdf.body.error.code).toBe("photo_must_be_image");

    await addPhoto(token, id);
    const onePhoto = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
    expect(onePhoto.body.error.code).toBe("service_types_required");

    await request(app).patch(`/merchant/outlets/${id}`).set(bearer(token)).send({ service_types: ["tyres"] });
    const stillOne = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
    expect(stillOne.status).toBe(422);
    expect(stillOne.body.error.code).toBe("photos_required");

    await addPhoto(token, id);
    const ok = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("pending");
    const again = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
    expect(again.status).toBe(409);

    const notif = await db("notifications").where({ subject_type: "outlet", subject_id: id }).first();
    expect(notif?.title).toMatch(/with CRAL for a visit/);
  });

  it("locks the name and address while Ops has them, but not the hours", async () => {
    const { token } = await newMerchant();
    const id = await submitted(token);
    const locked = await request(app).patch(`/merchant/outlets/${id}`).set(bearer(token)).send({ address: "Somewhere else entirely" });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("outlet_locked");
    const hours = await request(app).patch(`/merchant/outlets/${id}`).set(bearer(token)).send({ opening_hours: "Every day, 7am to 7pm" });
    expect(hours.status).toBe(200);
    expect(hours.body.opening_hours).toBe("Every day, 7am to 7pm");

    const keepPhotos = await request(app)
      .delete(`/merchant/outlets/${id}/photos/${hours.body.photos[0].id}`)
      .set(bearer(token));
    expect(keepPhotos.status).toBe(422);
  });

  it("keeps one merchant out of another's premises", async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const id = await draft(a.token);
    expect((await request(app).get(`/merchant/outlets/${id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).delete(`/merchant/outlets/${id}`).set(bearer(b.token))).status).toBe(404);
  });
});

describe("Ops outlet review", () => {
  it("is on the outlets queue", async () => {
    const vehiclesOnly = await newAdmin("admin_reviewer", ["vehicles"]);
    expect((await request(app).get("/admin/outlets").set(bearer(vehiclesOnly.token))).status).toBe(403);
    const reviewer = await newAdmin("admin_reviewer", ["outlets"]);
    expect((await request(app).get("/admin/outlets").set(bearer(reviewer.token))).status).toBe(200);
  });

  it("claims the case on the first answer and needs every check before any decision", async () => {
    const admin = await newAdmin();
    const { token } = await newMerchant();
    const id = await submitted(token);

    const queue = await request(app).get("/admin/outlets").set(bearer(admin.token));
    expect(queue.body.data.map((o: { id: string }) => o.id)).toContain(id);

    const first = await request(app)
      .post(`/admin/outlets/${id}/checklist`)
      .set(bearer(admin.token))
      .send({ item_id: "visit_address", result: "pass" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("review");
    expect(first.body.assignee.id).toBe(admin.adminId);

    for (const action of ["approve", "request_changes", "reject"]) {
      const res = await request(app)
        .post(`/admin/outlets/${id}/decision`)
        .set(bearer(admin.token))
        .set(idem())
        .send({ action, note: "x" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("checklist_incomplete");
    }
  });

  it("records a visit only with a date and who went, and clears it on any other answer", async () => {
    const admin = await newAdmin();
    const { token } = await newMerchant();
    const id = await submitted(token);

    const bare = await request(app).post(`/admin/outlets/${id}/checklist`).set(bearer(admin.token)).send({ item_id: "visit_done", result: "pass" });
    expect(bare.status).toBe(422);
    expect(bare.body.error.code).toBe("visit_details_required");

    const future = await request(app)
      .post(`/admin/outlets/${id}/checklist`)
      .set(bearer(admin.token))
      .send({ ...VISIT, visited_on: "2999-01-01" });
    expect(future.body.error.code).toBe("visit_in_future");

    const ok = await request(app).post(`/admin/outlets/${id}/checklist`).set(bearer(admin.token)).send(VISIT);
    expect(ok.body.visit).toMatchObject({ visited_on: "2026-11-01", visited_by: "Jane Wambui" });
    expect(await db("audit_log").where({ entity_id: id, action: "outlet.visit_recorded" }).first()).toBeTruthy();

    const flagged = await request(app)
      .post(`/admin/outlets/${id}/checklist`)
      .set(bearer(admin.token))
      .send({ item_id: "visit_done", result: "flag", note: "Gate was locked" });
    expect(flagged.body.visit).toBeNull();
    const row = await db("outlets").where({ id }).first();
    expect(row.visited_on).toBeNull();
    expect(row.visited_by).toBeNull();
    const merchantView = await request(app).get(`/merchant/outlets/${id}`).set(bearer(token));
    expect(merchantView.body.visited).toBe(false);
  });

  it("won't approve with a flag or before the account is approved, then approves and notifies", async () => {
    const admin = await newAdmin();
    const unapproved = await newMerchant(false);
    const blockedId = await submitted(unapproved.token);
    await passAll(admin.token, blockedId);
    const blocked = await request(app).post(`/admin/outlets/${blockedId}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("merchant_not_approved");

    const { token } = await newMerchant();
    const id = await submitted(token);
    await passAll(admin.token, id);
    await request(app).post(`/admin/outlets/${id}/checklist`).set(bearer(admin.token)).send({ item_id: "visit_name", result: "flag" });
    const flagged = await request(app).post(`/admin/outlets/${id}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(flagged.body.error.code).toBe("checklist_flagged");

    await request(app).post(`/admin/outlets/${id}/checklist`).set(bearer(admin.token)).send({ item_id: "visit_name", result: "pass" });
    const ok = await request(app).post(`/admin/outlets/${id}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("live");

    const merchantView = await request(app).get(`/merchant/outlets/${id}`).set(bearer(token));
    expect(merchantView.body).toMatchObject({ status: "live", visited: true, visited_on: "2026-11-01" });
    expect(await db("audit_log").where({ entity_id: id, action: "outlet.approved" }).first()).toBeTruthy();
    const notif = await db("notifications").where({ subject_type: "outlet", subject_id: id }).orderBy("occurred_at", "desc").first();
    expect(notif?.title).toMatch(/is approved/);

    // Decided: a second decision and further answers are 409.
    const again = await request(app).post(`/admin/outlets/${id}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "reject", note: "x" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("outlet_not_in_review");

    // Live: locked details, can pause, can't delete.
    expect((await request(app).patch(`/merchant/outlets/${id}`).set(bearer(token)).send({ name: "New name" })).status).toBe(409);
    expect((await request(app).post(`/merchant/outlets/${id}/pause`).set(bearer(token))).body.status).toBe("paused");
    expect((await request(app).delete(`/merchant/outlets/${id}`).set(bearer(token))).status).toBe(409);
  });

  it("sends back with a note, and an address change makes the visit stale", async () => {
    const admin = await newAdmin();
    const { token } = await newMerchant();
    const id = await submitted(token);
    await passAll(admin.token, id);

    const noNote = await request(app).post(`/admin/outlets/${id}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "request_changes" });
    expect(noNote.body.error.code).toBe("reason_required");
    const sent = await request(app)
      .post(`/admin/outlets/${id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes", note: "Untick bodywork." });
    expect(sent.body.status).toBe("action");

    const merchantView = await request(app).get(`/merchant/outlets/${id}`).set(bearer(token));
    expect(merchantView.body.reviewer_note).toBe("Untick bodywork.");

    const moved = await request(app).patch(`/merchant/outlets/${id}`).set(bearer(token)).send({ address: "Mombasa Road, opposite the Capital Centre" });
    expect(moved.status).toBe(200);
    const back = await request(app).post(`/merchant/outlets/${id}/submit`).set(bearer(token));
    expect(back.body.status).toBe("review"); // the same reviewer still has it

    const afterMove = await request(app).get(`/admin/outlets/${id}`).set(bearer(admin.token));
    const items = afterMove.body.checklist.items as Array<{ id: string; result: string }>;
    expect(items.find((i) => i.id === "visit_done")?.result).toBe("pending");
    expect(items.find((i) => i.id === "photos_real")?.result).toBe("pass");
    expect(afterMove.body.visit).toBeNull();
  });
});
