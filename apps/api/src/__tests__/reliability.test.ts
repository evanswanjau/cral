import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db } from "../db/client.js";
import { createVerifiedTestUser, testJpeg } from "../test/helpers.js";
import { generateId } from "../lib/ids.js";
import { MAX_UPLOAD_BYTES } from "../lib/uploads.js";

/**
 * Findings 7, 8 and 9 from docs/plans/merchant-review-2026-09-03.md.
 */

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map(
      (m) => m.id,
    );
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

// --- Finding 7: multer errors came back as a 500 ----------------------

describe("an oversized upload", () => {
  it("is a 413 about the file, not a 500 about our end", async () => {
    const { accessToken } = await newMerchant();

    // A real JPEG, just far too big. This used to miss every branch in the
    // error handler and surface as "Something went wrong on our end" —
    // wrong status, and a lie about whose fault it was.
    const tooBig = Buffer.concat([
      testJpeg(),
      Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0x20),
    ]);

    const res = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "national_id")
      .attach("file", tooBig, { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("file_too_large");
    expect(res.body.error.type).toBe("validation_error");
    expect(res.body.error.message).toContain("10MB");
  });
});

// --- Finding 8: a revoked session kept working for up to 15 minutes ---

describe("session revocation takes effect immediately", () => {
  it("stops accepting an access token whose session was revoked", async () => {
    const { userId, accessToken } = await newMerchant();

    // Still valid to begin with.
    const before = await request(app).get("/merchant/dashboard").set(auth(accessToken));
    expect(before.status).toBe(200);

    // What "Sign out everywhere else" does. The access token itself is
    // untouched and unexpired — only the session behind it is gone.
    await db("sessions")
      .where({ user_id: userId })
      .update({ revoked_at: new Date(), revoked_reason: "signed_out_everywhere" });

    const after = await request(app).get("/merchant/dashboard").set(auth(accessToken));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("session_revoked");
  });

  it("stops accepting a token whose session has expired", async () => {
    const { userId, accessToken } = await newMerchant();

    await db("sessions")
      .where({ user_id: userId })
      .update({ expires_at: new Date(Date.now() - 1000) });

    const res = await request(app).get("/merchant/dashboard").set(auth(accessToken));
    expect(res.status).toBe(401);
  });

  it("rejects a token whose session never existed", async () => {
    const { accessToken, userId } = await newMerchant();
    await db("sessions").where({ user_id: userId }).delete();

    const res = await request(app).get("/merchant/dashboard").set(auth(accessToken));
    expect(res.status).toBe(401);
  });
});

// --- Finding 9: append-only was claimed but not enforced --------------

describe("audit_log is append-only in the database", () => {
  it("refuses UPDATE and DELETE from the application's own connection", async () => {
    // The REVOKE in the create migration was a no-op here: the API connects
    // as the role that owns the table, and owners bypass a REVOKE from
    // PUBLIC. Both of these used to succeed.
    const id = generateId("auditLog");
    await db("audit_log").insert({
      id,
      actor_type: "system",
      action: "test.append_only_probe",
      entity_type: "test",
      entity_id: id,
    });

    await expect(db("audit_log").where({ id }).update({ action: "tampered" })).rejects.toThrow(
      /append-only/,
    );
    await expect(db("audit_log").where({ id }).delete()).rejects.toThrow(/append-only/);

    // The row is still there, unchanged — which is the whole point.
    const row = await db("audit_log").where({ id }).first();
    expect(row.action).toBe("test.append_only_probe");
  });
});
