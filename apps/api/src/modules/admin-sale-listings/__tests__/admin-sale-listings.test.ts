import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin } from "../../../test/helpers.js";
import { SALE_CHECKLIST } from "../service.js";
import {
  bearer,
  idem,
  insertFleetVehicle,
  insertLiveListing,
  newMerchantSeller,
  newPrivateSeller,
  submittedListing,
} from "../../sale-listings/__tests__/fixtures.js";

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

async function passAll(token: string, listingId: string) {
  for (const item of SALE_CHECKLIST) {
    const res = await request(app)
      .post(`/admin/sale-listings/${listingId}/checklist`)
      .set(bearer(token))
      .send({ item_id: item.id, result: "pass" });
    expect(res.status).toBe(200);
  }
}

describe("admin: car-sale review", () => {
  it("is on the sales queue", async () => {
    const drivers = await newAdmin("admin_reviewer", ["drivers"]);
    expect((await request(app).get("/admin/sale-listings").set(bearer(drivers.token))).status).toBe(403);
    const sales = await newAdmin("admin_reviewer", ["sales"]);
    expect((await request(app).get("/admin/sale-listings").set(bearer(sales.token))).status).toBe(200);
  });

  it("lists a submitted listing as open, and answering a check claims it", async () => {
    const admin = await newAdmin();
    const seller = await newPrivateSeller(userIds);
    const id = await submittedListing(app, seller);

    const queue = await request(app).get("/admin/sale-listings").set(bearer(admin.token)).query({ filter: "open", limit: 100 });
    const row = queue.body.data.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({ status: "pending", seller_type: "private", seller_name: "Wanjiru Kamau" });
    expect(row.registration).toMatch(/^KS/);

    const kase = await request(app).get(`/admin/sale-listings/${id}`).set(bearer(admin.token));
    expect(kase.status).toBe(200);
    expect(kase.body.photos).toHaveLength(8);
    expect(kase.body.checklist).toMatchObject({ outstanding: SALE_CHECKLIST.length, complete: false });
    expect(kase.body.seller).toMatchObject({ type: "private", cleared: true, legal_name: "Wanjiru Kamau" });

    const after = await request(app)
      .post(`/admin/sale-listings/${id}/checklist`)
      .set(bearer(admin.token))
      .send({ item_id: "lb_name", result: "pass" });
    expect(after.body.status).toBe("review");
    expect(after.body.review_assignee).toBe(admin.adminId);
  });

  it("approves only once every check passes, then lists it with a dated ref", async () => {
    const admin = await newAdmin();
    const seller = await newPrivateSeller(userIds);
    const id = await submittedListing(app, seller);

    const early = await request(app)
      .post(`/admin/sale-listings/${id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe("checklist_incomplete");

    await passAll(admin.token, id);
    await request(app)
      .post(`/admin/sale-listings/${id}/checklist`)
      .set(bearer(admin.token))
      .send({ item_id: "ph_odometer", result: "flag", note: "Odometer reads 210,000, not 96,000." });
    const flagged = await request(app)
      .post(`/admin/sale-listings/${id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(flagged.status).toBe(422);
    expect(flagged.body.error.code).toBe("checklist_flagged");
    const kase = await request(app).get(`/admin/sale-listings/${id}`).set(bearer(admin.token));
    expect(kase.body.checklist.suggested_note).toContain("Odometer reads 210,000");

    await request(app).post(`/admin/sale-listings/${id}/checklist`).set(bearer(admin.token)).send({ item_id: "ph_odometer", result: "pass" });
    const approved = await request(app)
      .post(`/admin/sale-listings/${id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("live");
    expect(approved.body.ref).toMatch(/^S\d{9}$/);
    const days = (new Date(approved.body.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(60);
    expect(approved.body.photos.every((p: { doc: { state: string } }) => p.doc.state === "ok")).toBe(true);

    const note = await db("notifications").where({ user_id: seller.userId, subject_id: id }).orderBy("created_at", "desc").first();
    expect(note.title).toContain("is listed for sale");
    expect((await request(app).get(`/sales/${approved.body.ref}`)).status).toBe(200);
  });

  it("won't list a private seller whose ID isn't accepted, or a merchant not yet approved", async () => {
    const admin = await newAdmin();
    const privateSeller = await newPrivateSeller(userIds, { idState: "pending" });
    const a = await submittedListing(app, privateSeller);
    await passAll(admin.token, a);
    const res = await request(app).post(`/admin/sale-listings/${a}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("seller_not_verified");

    const merchant = await newMerchantSeller(userIds, false);
    const b = await submittedListing(app, merchant);
    await passAll(admin.token, b);
    const res2 = await request(app).post(`/admin/sale-listings/${b}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(res2.status).toBe(422);
    expect(res2.body.error.code).toBe("merchant_not_approved");
  });

  it("asks for a new photo, and the seller's resubmission is read afresh", async () => {
    const admin = await newAdmin();
    const seller = await newPrivateSeller(userIds);
    const id = await submittedListing(app, seller);
    await passAll(admin.token, id);
    const photo = await db("documents").where({ sale_listing_id: id, slot: "engine_bay" }).first();

    const reject = await request(app)
      .post(`/admin/sale-listings/${id}/documents/${photo.id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reject", note: "Chassis plate is out of focus." });
    expect(reject.status).toBe(200);
    const changes = await request(app)
      .post(`/admin/sale-listings/${id}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes", note: "Retake the chassis plate photo." });
    expect(changes.status).toBe(200);
    expect(changes.body.status).toBe("action");

    const mine = await request(app).get(`/me/sale-listings/${id}`).set(bearer(seller.accessToken));
    expect(mine.body.reviewer_note).toBe("Retake the chassis plate photo.");
    expect(mine.body.missing_for_submit).toEqual(["photos: engine bay with the chassis plate"]);

    const resubmitted = await request(app).post(`/me/sale-listings/${id}/submit`).set(bearer(seller.accessToken));
    expect(resubmitted.status).toBe(422);
  });

  it("needs a note to reject or request changes", async () => {
    const admin = await newAdmin();
    const seller = await newMerchantSeller(userIds);
    const id = await submittedListing(app, seller);
    const res = await request(app).post(`/admin/sale-listings/${id}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "reject" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("reason_required");
  });

  it("takes a reported listing down, gives the fleet car its hires back, and can reinstate it", async () => {
    const admin = await newAdmin();
    const seller = await newMerchantSeller(userIds);
    const vehicleId = await insertFleetVehicle(seller.merchantId!, { status: "paused" });
    const { id, ref } = await insertLiveListing(seller, { status: "under_offer", vehicle_id: vehicleId, paused_hire: true });
    const buyer = await newPrivateSeller(userIds);
    await request(app).post(`/sales/${ref}/reports`).set(bearer(buyer.accessToken)).send({ reason: "scam", note: "Asked for a deposit." });

    const reported = await request(app).get("/admin/sale-listings").set(bearer(admin.token)).query({ filter: "reported", limit: 100 });
    expect(reported.body.data.find((r: { id: string }) => r.id === id)?.open_reports).toBe(1);

    const down = await request(app)
      .post(`/admin/sale-listings/${id}/remove`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ note: "Asking buyers for deposits is against the rules." });
    expect(down.status).toBe(200);
    expect(down.body.status).toBe("removed");
    expect(down.body.reports[0].status).toBe("actioned");
    expect((await db("vehicles").where({ id: vehicleId }).first()).status).toBe("live");
    expect((await request(app).get(`/sales/${ref}`)).status).toBe(404);

    const back = await request(app).post(`/admin/sale-listings/${id}/reinstate`).set(bearer(admin.token)).set(idem()).send({});
    expect(back.status).toBe(200);
    expect(back.body.status).toBe("live");
  });

  it("dismisses a report without touching the listing", async () => {
    const admin = await newAdmin();
    const seller = await newMerchantSeller(userIds);
    const { id, ref } = await insertLiveListing(seller);
    const buyer = await newPrivateSeller(userIds);
    await request(app).post(`/sales/${ref}/reports`).set(bearer(buyer.accessToken)).send({ reason: "not_available" });
    const report = await db("sale_listing_reports").where({ sale_listing_id: id }).first();

    const res = await request(app).post(`/admin/sale-reports/${report.id}/resolve`).set(bearer(admin.token)).send({ outcome: "dismissed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("live");
    expect(res.body.reports[0].status).toBe("dismissed");
  });
});
