import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";
import { emailAdapter } from "../../../lib/adapters.js";

/**
 * The renter document review queue - the real decision path
 * customer-bookings' documents_required gate, completeHandover's pickup
 * gate, and getHirerHistory's id_verified all key off.
 */

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    await db("documents").whereIn("user_id", userIds).delete();
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `ar-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

async function renterWithDocs(kinds: Array<"national_id" | "driving_licence">) {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  for (const kind of kinds) {
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: null,
      user_id: u.userId,
      vehicle_id: null,
      kind,
      storage_key: `test/renter/${u.userId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 1024,
      content_type: "application/pdf",
      review_state: "pending",
    });
  }
  return u;
}

describe("the renters queue is ops-only, on the renters queue", () => {
  it("refuses a renter token, and an admin without the renters queue", async () => {
    const renter = await createVerifiedTestUser();
    userIds.push(renter.userId);
    expect((await request(app).get("/admin/renters").set(bearer(renter.accessToken))).status).toBe(401);

    const reviewerNoRenters = await newAdmin("admin_reviewer", ["vehicles"]);
    expect((await request(app).get("/admin/renters").set(bearer(reviewerNoRenters.token))).status).toBe(403);

    const reviewer = await newAdmin("admin_reviewer", ["renters"]);
    expect((await request(app).get("/admin/renters").set(bearer(reviewer.token))).status).toBe(200);
  });
});

describe("the queue", () => {
  it("lists a renter with an upload, filterable by status", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id", "driving_licence"]);

    const all = await request(app).get("/admin/renters").set(bearer(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.data.map((r: { user_id: string }) => r.user_id)).toContain(renter.userId);
    const row = all.body.data.find((r: { user_id: string }) => r.user_id === renter.userId);
    expect(row.status).toBe("pending");

    const verifiedOnly = await request(app)
      .get("/admin/renters")
      .query({ filter: "verified" })
      .set(bearer(admin.token));
    expect(verifiedOnly.body.data.map((r: { user_id: string }) => r.user_id)).not.toContain(renter.userId);
  });
});

describe("the renter file", () => {
  it("shows both documents and an honest missing state for the one not uploaded", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id"]);

    const res = await request(app).get(`/admin/renters/${renter.userId}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
    const byKind = Object.fromEntries(res.body.documents.map((d: { kind: string; state: string }) => [d.kind, d.state]));
    expect(byKind.national_id).toBe("pending");
    expect(byKind.driving_licence).toBe("missing");
  });

  it("404s a user with nothing uploaded", async () => {
    const admin = await newAdmin();
    const nobody = await createVerifiedTestUser();
    userIds.push(nobody.userId);

    const res = await request(app).get(`/admin/renters/${nobody.userId}`).set(bearer(admin.token));
    expect(res.status).toBe(404);
  });
});

describe("deciding a document", () => {
  it("accepts a document, and the file reflects it immediately", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id", "driving_licence"]);

    const emailSpy = vi.spyOn(emailAdapter, "send");
    const res = await request(app)
      .post(`/admin/renters/${renter.userId}/documents/national_id/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "accept" });

    expect(res.status).toBe(200);
    const byKind = Object.fromEntries(res.body.documents.map((d: { kind: string; state: string }) => [d.kind, d.state]));
    expect(byKind.national_id).toBe("ok");
    expect(byKind.driving_licence).toBe("pending");
    expect(res.body.verified).toBe(false); // one still pending

    expect(emailSpy).toHaveBeenCalled();
    emailSpy.mockRestore();

    const audit = await db("audit_log")
      .where({ entity_type: "document", action: "renter.document_accepted" })
      .orderBy("created_at", "desc")
      .first();
    expect(audit).toBeTruthy();
  });

  it("becomes verified once both documents clear", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id", "driving_licence"]);

    for (const kind of ["national_id", "driving_licence"]) {
      await request(app)
        .post(`/admin/renters/${renter.userId}/documents/${kind}/decision`)
        .set(bearer(admin.token))
        .set(idem())
        .send({ decision: "accept" });
    }

    const file = await request(app).get(`/admin/renters/${renter.userId}`).set(bearer(admin.token));
    expect(file.body.verified).toBe(true);
  });

  it("requires a note to reject, and stores it", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id"]);

    const noNote = await request(app)
      .post(`/admin/renters/${renter.userId}/documents/national_id/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reject" });
    expect(noNote.status).toBe(422);

    const withNote = await request(app)
      .post(`/admin/renters/${renter.userId}/documents/national_id/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reject", note: "Photo is blurry, retake it." });
    expect(withNote.status).toBe(200);
    const doc = withNote.body.documents.find((d: { kind: string }) => d.kind === "national_id");
    expect(doc.state).toBe("rejected");
    expect(doc.review_note).toBe("Photo is blurry, retake it.");
  });

  it("404s a decision on a document never uploaded", async () => {
    const admin = await newAdmin();
    const renter = await renterWithDocs(["national_id"]);

    const res = await request(app)
      .post(`/admin/renters/${renter.userId}/documents/driving_licence/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "accept" });
    expect(res.status).toBe(404);
  });
});
