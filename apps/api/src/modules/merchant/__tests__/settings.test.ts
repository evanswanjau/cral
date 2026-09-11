import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { requestAccountDeletion, runAccountDeletionSweep } from "../../auth/service.js";
import { reviewProfileChange } from "../service.js";

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
    // Nothing rates a merchant yet (no customer portal), so this is null,
    // not an all-zero object.
    expect(before.body.merchant_rating).toBeNull();

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

describe("Settings → Business — locked after submission", () => {
  async function submittedMerchant() {
    const m = await newMerchant();
    await request(app).get("/merchant/profile").set(auth(m.accessToken)); // materialise the row
    await db("merchants").where({ user_id: m.userId }).update({ onboarding_submitted: true });
    return m;
  }

  it("PATCH is refused once onboarding is submitted", async () => {
    const { accessToken } = await submittedMerchant();
    const res = await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ surname: "Newname" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("profile_locked");
  });

  it("captures a change request, shows it on the profile, and withdraws it", async () => {
    const { userId, accessToken } = await submittedMerchant();

    const create = await request(app)
      .post("/merchant/profile/change-request")
      .set(auth(accessToken))
      .send({ surname: "Otieno", national_id: "12345678" });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("pending");
    expect(Object.keys(create.body.changes).sort()).toEqual(["national_id", "surname"]);

    // Nothing on the merchant row moved.
    const merchant = await db("merchants").where({ user_id: userId }).first();
    expect(merchant.surname).not.toBe("Otieno");

    const profile = await request(app).get("/merchant/profile").set(auth(accessToken));
    expect(profile.body.profile_locked).toBe(true);
    expect(profile.body.pending_change.id).toBe(create.body.id);

    // A second submission replaces the first.
    const replace = await request(app)
      .post("/merchant/profile/change-request")
      .set(auth(accessToken))
      .send({ surname: "Kamau" });
    expect(replace.status).toBe(201);
    const openCount = await db("profile_change_requests")
      .where({ merchant_id: merchant.id, status: "pending" })
      .count<{ n: string }[]>("id as n");
    expect(Number(openCount[0]!.n)).toBe(1);

    const withdraw = await request(app)
      .delete("/merchant/profile/change-request")
      .set(auth(accessToken));
    expect(withdraw.status).toBe(204);
    const after = await request(app).get("/merchant/profile").set(auth(accessToken));
    expect(after.body.pending_change).toBeNull();
  });

  it("approving a change applies the diff and sends the account back to review", async () => {
    const { userId, accessToken } = await submittedMerchant();
    await db("merchants").where({ user_id: userId }).update({ approved_at: new Date() });

    const create = await request(app)
      .post("/merchant/profile/change-request")
      .set(auth(accessToken))
      .send({ surname: "Approved-Name" });

    await reviewProfileChange(create.body.id, "approve", "test-reviewer", null);

    const merchant = await db("merchants").where({ user_id: userId }).first();
    expect(merchant.surname).toBe("Approved-Name");
    expect(merchant.approved_at).toBeNull();
    const req = await db("profile_change_requests").where({ id: create.body.id }).first();
    expect(req.status).toBe("approved");
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

describe("Settings → Payouts — PUT /merchant/payout-settings", () => {
  it("round-trips an M-Pesa payout block for an individual and audit-logs it", async () => {
    const { userId, accessToken } = await newMerchant();
    await db("users").where({ id: userId }).update({ phone: "+254712300001", phone_verified: true });

    const res = await request(app)
      .put("/merchant/payout-settings")
      .set(auth(accessToken))
      .send({ method: "mpesa", schedule: "monthly", mpesa_name: "Jane Doe" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      method: "mpesa",
      schedule: "monthly",
      // The M-Pesa number is always the account phone, and its verified
      // flag mirrors users.phone_verified. Only the name is editable.
      mpesa_number: "+254712300001",
      mpesa_number_verified: true,
      mpesa_name: "Jane Doe",
    });

    // Reflected in the profile payload the tab reads.
    const profile = await request(app).get("/merchant/profile").set(auth(accessToken));
    expect(profile.body.payout).toMatchObject({ method: "mpesa", schedule: "monthly" });

    const merchant = await db("merchants").where({ user_id: userId }).first();
    const entry = await latestAudit("merchant.payout_settings_updated", merchant.id);
    expect(entry).toBeTruthy();
    expect(entry.after).toMatchObject({ payout_method: "mpesa", payout_schedule: "monthly" });
  });

  it("coerces a bank payout to a monthly schedule regardless of what's sent", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app)
      .put("/merchant/payout-settings")
      .set(auth(accessToken))
      .send({
        method: "bank",
        schedule: "weekly",
        bank_name: "Equity Bank Kenya",
        bank_branch: "Westlands",
        bank_account_name: "Jane Doe",
        bank_account_number: "0170 1984 56321",
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      method: "bank",
      schedule: "monthly",
      bank_name: "Equity Bank Kenya",
      bank_account_number: "0170198456321",
    });
  });

  it("rejects M-Pesa for a company merchant (422)", async () => {
    const { accessToken } = await newMerchant();
    await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ owner_type: "company", company_name: "Fleet Ltd" });

    const res = await request(app)
      .put("/merchant/payout-settings")
      .set(auth(accessToken))
      .send({ method: "mpesa", schedule: "weekly", same_as_phone: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("mpesa_not_allowed_for_company");

    // Bank is accepted for the same company.
    const ok = await request(app)
      .put("/merchant/payout-settings")
      .set(auth(accessToken))
      .send({
        method: "bank",
        schedule: "weekly",
        bank_name: "KCB Bank Kenya",
        bank_branch: "Moi Ave",
        bank_account_name: "Fleet Ltd",
        bank_account_number: "1234567890",
      });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ method: "bank", bank_name: "KCB Bank Kenya", bank_account_number: "1234567890" });
  });

  it("forces bank payout when the profile switches to a company", async () => {
    const { userId, accessToken } = await newMerchant();
    await request(app)
      .put("/merchant/payout-settings")
      .set(auth(accessToken))
      .send({ method: "mpesa", schedule: "weekly" });

    await request(app)
      .patch("/merchant/profile")
      .set(auth(accessToken))
      .send({ owner_type: "company", company_name: "Karanja Fleet Ltd" });

    const merchant = await db("merchants").where({ user_id: userId }).first();
    expect(merchant.payout_method).toBe("bank");
  });
});

describe("Settings → Security — account deletion", () => {
  const ctx = { ip: null, requestId: null };

  it("schedules deletion 30 days out, revokes other sessions, and audit-logs it", async () => {
    const { userId, accessToken } = await newMerchant();
    const other = await addSession(userId);

    const res = await request(app).post("/auth/account/deletion").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_deletion");
    const days = (new Date(res.body.deletion_scheduled_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);

    const user = await db("users").where({ id: userId }).first();
    expect(user.status).toBe("pending_deletion");
    expect(user.erasure_requested).toBe(true);

    const otherRow = await db("sessions").where({ id: other }).first();
    expect(otherRow.revoked_at).not.toBeNull();

    // The profile payload the Settings screen reads carries the state.
    const profile = await request(app).get("/merchant/profile").set(auth(accessToken));
    expect(profile.body.account_status).toBe("pending_deletion");
    expect(profile.body.deletion_scheduled_at).toBeTruthy();

    const entry = await latestAudit("user.deletion_requested", userId);
    expect(entry).toBeTruthy();
  });

  it("is idempotent — a second request keeps the original schedule", async () => {
    const { userId } = await newMerchant();
    const first = await requestAccountDeletion(userId, "sid", ctx);
    const second = await requestAccountDeletion(userId, "sid", ctx);
    expect(second.deletion_scheduled_at).toBe(first.deletion_scheduled_at);
  });

  it('"Keep my account" reactivates', async () => {
    const { userId, accessToken } = await newMerchant();
    await request(app).post("/auth/account/deletion").set(auth(accessToken));

    const res = await request(app).delete("/auth/account/deletion").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");

    const user = await db("users").where({ id: userId }).first();
    expect(user.status).toBe("active");
    expect(user.erasure_cooling_off_until).toBeNull();
  });

  it("blocks sign-in for a suspended account", async () => {
    const { userId, email } = await newMerchant();
    await db("users").where({ id: userId }).update({ status: "suspended" });

    const res = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password: "correct horse battery staple", device_id: "d" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_suspended");
  });

  it("kills a live session at the next refresh once the account is suspended", async () => {
    const { userId, email } = await newMerchant();
    const login = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password: "correct horse battery staple", device_id: "d-refresh" });
    const refresh = login.body.refresh_token as string;
    expect(refresh).toBeTruthy();

    await db("users").where({ id: userId }).update({ status: "suspended" });

    const res = await request(app).post("/auth/token/refresh").send({ refresh_token: refresh });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_suspended");

    // That session is now revoked and a second refresh with the same token fails too.
    const again = await request(app).post("/auth/token/refresh").send({ refresh_token: refresh });
    expect(again.status).toBe(401);
    const revoked = await db("sessions")
      .where({ user_id: userId, revoked_reason: "account_suspended" })
      .first();
    expect(revoked).toBeTruthy();
  });

  it("the sweep scrubs PII and marks deleted once the grace period elapses, keeping records untouched", async () => {
    const { userId, accessToken } = await newMerchant();
    // Materialise the merchant row (lazily created) so we can assert it survives.
    await request(app).get("/merchant/profile").set(auth(accessToken));
    await requestAccountDeletion(userId, "sid", ctx);
    // Fast-forward the timer.
    await db("users")
      .where({ id: userId })
      .update({ erasure_cooling_off_until: new Date(Date.now() - 1000) });

    const { purged } = await runAccountDeletionSweep();
    expect(purged).toBeGreaterThanOrEqual(1);

    const user = await db("users").where({ id: userId }).first();
    expect(user.status).toBe("deleted");
    expect(user.email).toBe(`deleted-${userId}@cral.invalid`);
    expect(user.phone).toBeNull();
    expect(user.two_factor_enabled).toBe(false);

    // The merchant row (the business record) is still there.
    const merchant = await db("merchants").where({ user_id: userId }).first();
    expect(merchant).toBeTruthy();
  });
});
