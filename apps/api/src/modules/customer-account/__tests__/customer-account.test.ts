import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";
import { renterVerificationOf } from "../service.js";
import type { DocumentRow } from "../../merchant/db-types.js";

/**
 * Renter documents (docs/plans/customer-portal.md, PR 4). The load-bearing
 * behaviour: one `documents` table shared with the merchant side (via the
 * nullable `user_id` from migration 20260910100000), single slot per kind,
 * the same byte-check on upload, and a `verified` flag that only trips when
 * Ops has accepted both documents.
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    await db("documents").whereIn("user_id", userIds).delete();
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

async function renter() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}

describe("renter documents", () => {
  it("uploads, lists, and streams a document; slot replaces on re-upload", async () => {
    const { accessToken } = await renter();

    const up = await request(app)
      .post("/me/documents")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("kind", "national_id")
      .attach("file", testJpeg("id-1"), { filename: "id.jpg", contentType: "image/jpeg" });
    expect(up.status).toBe(201);
    expect(up.body.kind).toBe("national_id");
    expect(up.body.review_state).toBe("pending");

    const list1 = await request(app)
      .get("/me/documents")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(list1.status).toBe(200);
    expect(list1.body.data).toHaveLength(1);
    expect(list1.body.verification.verified).toBe(false);
    expect(list1.body.verification.outstanding).toEqual(["national_id", "driving_licence"]);

    // Re-upload the same kind -> still one row, new id.
    const up2 = await request(app)
      .post("/me/documents")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("kind", "national_id")
      .attach("file", testJpeg("id-2"), { filename: "id2.jpg", contentType: "image/jpeg" });
    expect(up2.status).toBe(201);
    expect(up2.body.id).not.toBe(up.body.id);

    const list2 = await request(app)
      .get("/me/documents")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(list2.body.data).toHaveLength(1);

    const stream = await request(app)
      .get(`/me/documents/${up2.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(stream.status).toBe(200);
    expect(stream.headers["x-content-type-options"]).toBe("nosniff");
    expect(stream.headers["content-type"]).toContain("image/jpeg");
  });

  it("rejects a file whose bytes don't match the declared type", async () => {
    const { accessToken } = await renter();
    const res = await request(app)
      .post("/me/documents")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("kind", "driving_licence")
      .attach("file", Buffer.from("not a real pdf"), {
        filename: "x.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("file_content_mismatch");
  });

  it("another user's document id is a 404, not a 403", async () => {
    const a = await renter();
    const b = await renter();
    const up = await request(app)
      .post("/me/documents")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .field("kind", "driving_licence")
      .attach("file", testPdf("dl"), { filename: "dl.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);

    const res = await request(app)
      .get(`/me/documents/${up.body.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("verified only when both documents are review_state = ok", async () => {
    const { userId, accessToken } = await renter();
    for (const kind of ["national_id", "driving_licence"] as const) {
      await request(app)
        .post("/me/documents")
        .set("Authorization", `Bearer ${accessToken}`)
        .field("kind", kind)
        .attach("file", testPdf(kind), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    }

    let me = await request(app).get("/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.body.renter_verification.verified).toBe(false);

    // Ops accepts one - still not verified.
    await db<DocumentRow>("documents")
      .where({ user_id: userId, kind: "national_id" })
      .update({ review_state: "ok" });
    me = await request(app).get("/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.body.renter_verification.verified).toBe(false);
    expect(me.body.renter_verification.outstanding).toEqual(["driving_licence"]);

    // Both accepted - verified.
    await db<DocumentRow>("documents")
      .where({ user_id: userId, kind: "driving_licence" })
      .update({ review_state: "ok" });
    me = await request(app).get("/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.body.renter_verification.verified).toBe(true);
    expect(me.body.renter_verification.outstanding).toEqual([]);

    const regState = await request(app)
      .get("/auth/registration-state")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(regState.body.renter_verification.verified).toBe(true);
  });

  it("the DB rejects a document row with both owner columns set", async () => {
    const { userId } = await renter();
    await expect(
      db("documents").insert({
        id: generateId("document"),
        merchant_id: generateId("merchant"),
        user_id: userId,
        vehicle_id: null,
        kind: "national_id",
        storage_key: "x",
        original_name: "x",
        size_bytes: 1,
        content_type: "image/jpeg",
        review_state: "pending",
      }),
    ).rejects.toThrow(/documents_one_owner_chk|violates check constraint/);
  });

  it("renterVerificationOf is pure and maps missing rows", () => {
    expect(renterVerificationOf([]).outstanding).toEqual(["national_id", "driving_licence"]);
    const rows = [
      { kind: "national_id", review_state: "ok", review_note: null },
      { kind: "driving_licence", review_state: "rejected", review_note: "blurry" },
    ] as DocumentRow[];
    const v = renterVerificationOf(rows);
    expect(v.verified).toBe(false);
    expect(v.documents.find((d) => d.kind === "driving_licence")?.review_note).toBe("blurry");
  });
});
