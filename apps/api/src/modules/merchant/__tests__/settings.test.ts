import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** A second, unrelated session row for the same user — for revoke tests. */
async function addSession(userId: string): Promise<string> {
  const [row] = await db("sessions")
    .insert({
      id: generateId("session"),
      user_id: userId,
      device_id: `dev-${ulid().slice(-6)}`,
      token_hash: `unused-${ulid()}`,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      last_seen_at: new Date(),
    })
    .returning("*");
  return row.id;
}

async function latestAudit(action: string, entityId: string) {
  return db("audit_log")
    .where({ action, entity_id: entityId })
    .orderBy("created_at", "desc")
    .first();
}

describe("Settings → Business — GET/PATCH /merchant/profile", () => {
  it("round-trips a profile edit and stays merchant-scoped", async () => {
    const a = await newMerchant();
    const b = await newMerchant();

    const before = await request(app).get("/merchant/profile").set(auth(a.accessToken));
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      owner_type: "individual",
      email: a.email,
      phone: null,
      phone_verified: false,
      approved_at: null,
    });
    expect(before.body.member_since).toBeTruthy();
    expect(Array.isArray(before.body.documents)).toBe(true);

    const patched = await request(app)
      .patch("/merchant/profile")
      .set(auth(a.accessToken))
      .send({ owner_type: "company", company_name: "Karanja Fleet Limited", trading_name: "Karanja Fleet" });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      owner_type: "company",
      company_name: "Karanja Fleet Limited",
      trading_name: "Karanja Fleet",
    });

    // b is untouched by a's write.
    const other = await request(app).get("/merchant/profile").set(auth(b.accessToken));
    expect(other.body.owner_type).toBe("individual");
    expect(other.body.company_name).toBeNull();
  });

  it("rejects an unknown field with a 422 rather than silently ignoring it", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ county: "Nairobi" });
    expect(res.status).toBe(422);
  });

  it("routes a phone change through setUserPhone — normalised to E.164, phone_verified cleared", async () => {
    const { userId, accessToken } = await newMerchant();
    await db("users").where({ id: userId }).update({ phone: "+254700000001", phone_verified: true });

    const res = await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ phone: "0733 376 061" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("+254733376061");
    expect(res.body.phone_verified).toBe(false);

    const user = await db("users").where({ id: userId }).first();
    expect(user.phone).toBe("+254733376061");
    expect(user.phone_verified).toBe(false);
  });

  it("returns phone_taken (409) when the number belongs to another account", async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    await db("users").where({ id: b.userId }).update({ phone: "+254711111222" });

    const res = await request(app)
      .patch("/merchant/profile")
      .set(auth(a.accessToken))
      .send({ phone: "0711111222" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("phone_taken");
  });

  it("writes an audit_log row in the same transaction as the change", async () => {
    const { userId, accessToken } = await newMerchant();
    // getProfile lazily creates the merchant row; hit it first.
    await request(app).get("/merchant/profile").set(auth(accessToken));
    const row = await db("merchants").where({ user_id: userId }).first();

    await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ trading_name: "Audited Co" });

    const entry = await latestAudit("merchant.profile_updated", row.id);
    expect(entry).toBeTruthy();
    expect(entry.actor_id).toBe(userId);
    expect(entry.after).toMatchObject({ trading_name: "Audited Co" });
  });
});

describe("Settings → Security — sessions", () => {
  it("revoke-all kills every session except the caller's and returns the count", async () => {
    const { userId, accessToken } = await newMerchant();
    const other1 = await addSession(userId);
    const other2 = await addSession(userId);

    const res = await request(app).post("/auth/sessions/revoke-all").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(2);

    const rows = await db("sessions").where({ user_id: userId }).select("id", "revoked_at");
    const byId = new Map(rows.map((r) => [r.id, r.revoked_at]));
    expect(byId.get(other1)).not.toBeNull();
    expect(byId.get(other2)).not.toBeNull();
    // The caller's own session (the one the token was signed for) is still live.
    const live = rows.filter((r) => r.revoked_at === null);
    expect(live).toHaveLength(1);

    const entry = await latestAudit("user.sessions_revoked_all", userId);
    expect(entry).toBeTruthy();
    expect(entry.after).toMatchObject({ revoked: 2 });
  });

  it("password change revokes the other sessions but keeps the current one", async () => {
    const { userId, accessToken } = await newMerchant();
    const other = await addSession(userId);

    const res = await request(app)
      .post("/auth/password/change")
      .set(auth(accessToken))
      .send({
        current_password: "correct horse battery staple",
        new_password: "velvet-orbit-clover-marmalade-92",
      });
    expect(res.status).toBe(200);
    expect(res.body.sessions_revoked).toBeGreaterThanOrEqual(1);

    const otherRow = await db("sessions").where({ id: other }).first();
    expect(otherRow.revoked_at).not.toBeNull();
    const live = await db("sessions").where({ user_id: userId, revoked_at: null });
    expect(live).toHaveLength(1);
  });
});

describe("Settings → Payouts — GET /merchant/payouts/statements", () => {
  it("returns an empty list for a merchant with no runs", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app).get("/merchant/payouts/statements").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });
});
