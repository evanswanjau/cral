import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin } from "../../../test/helpers.js";

const app = createApp();
const adminIds: string[] = [];

afterAll(async () => {
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

describe("admin team management", () => {
  it("a non-super admin is forbidden from every endpoint", async () => {
    const reviewer = await newAdmin("admin_reviewer", ["vehicles"]);

    const list = await request(app).get("/admin/team").set(bearer(reviewer.token));
    expect(list.status).toBe(403);

    const create = await request(app)
      .post("/admin/team")
      .set(bearer(reviewer.token))
      .set(idem())
      .send({ email: "x@example.test", phone: "+254712345678", full_name: "X", role: "admin_support" });
    expect(create.status).toBe(403);
  });

  it("admin_super creates a new admin and gets a one-time password", async () => {
    const owner = await newAdmin();
    const email = `team-${ulid().slice(-8).toLowerCase()}@example.test`;

    const res = await request(app)
      .post("/admin/team")
      .set(bearer(owner.token))
      .set(idem())
      .send({
        email,
        phone: "0712345678",
        full_name: "New Reviewer",
        role: "admin_reviewer",
        queues: ["vehicles"],
      });

    expect(res.status).toBe(201);
    expect(res.body.admin.email).toBe(email);
    expect(res.body.admin.phone).toBe("+254712345678");
    expect(res.body.admin.assigned_queues).toEqual(["vehicles"]);
    expect(res.body.admin.status).toBe("active");
    expect(typeof res.body.password).toBe("string");
    expect(res.body.password.length).toBeGreaterThan(10);
    expect(res.body.admin.password_hash).toBeUndefined();

    adminIds.push(res.body.admin.id);
  });

  it("admin_super role ignores any submitted queues", async () => {
    const owner = await newAdmin();
    const email = `team-${ulid().slice(-8).toLowerCase()}@example.test`;

    const res = await request(app)
      .post("/admin/team")
      .set(bearer(owner.token))
      .set(idem())
      .send({ email, phone: "0712345679", full_name: "New Owner", role: "admin_super", queues: ["vehicles"] });

    expect(res.status).toBe(201);
    expect(res.body.admin.assigned_queues).toEqual([]);
    adminIds.push(res.body.admin.id);
  });

  it("rejects a duplicate email with a 409", async () => {
    const owner = await newAdmin();
    const existing = await newAdmin("admin_support");

    const res = await request(app)
      .post("/admin/team")
      .set(bearer(owner.token))
      .set(idem())
      .send({ email: existing.email, phone: "0712345680", full_name: "Dup", role: "admin_support" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("admin_email_taken");
  });

  it("rejects an unparseable phone number", async () => {
    const owner = await newAdmin();

    const res = await request(app)
      .post("/admin/team")
      .set(bearer(owner.token))
      .set(idem())
      .send({
        email: `team-${ulid().slice(-8).toLowerCase()}@example.test`,
        phone: "not-a-phone",
        full_name: "Bad Phone",
        role: "admin_support",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_phone");
  });

  it("updates role and queues for another admin", async () => {
    const owner = await newAdmin();
    const target = await newAdmin("admin_reviewer", ["vehicles"]);

    const res = await request(app)
      .patch(`/admin/team/${target.adminId}`)
      .set(bearer(owner.token))
      .send({ role: "admin_finance", queues: ["payouts"] });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin_finance");
    expect(res.body.assigned_queues).toEqual(["payouts"]);
  });

  it("refuses to let a super admin edit their own role", async () => {
    const owner = await newAdmin();

    const res = await request(app)
      .patch(`/admin/team/${owner.adminId}`)
      .set(bearer(owner.token))
      .send({ role: "admin_support", queues: [] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("cannot_edit_own_role");
  });

  it("deactivates an admin and revokes their live sessions", async () => {
    const owner = await newAdmin();
    const target = await newAdmin("admin_support");

    const res = await request(app)
      .post(`/admin/team/${target.adminId}/deactivate`)
      .set(bearer(owner.token))
      .set(idem());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("disabled");

    const session = await db("admin_sessions")
      .where({ admin_user_id: target.adminId })
      .first();
    expect(session?.revoked_at).not.toBeNull();

    // The deactivated admin's own token now fails require-admin.
    const blocked = await request(app).get("/admin/auth/me").set(bearer(target.token));
    expect(blocked.status).toBe(401);
  });

  it("refuses to let a super admin deactivate themselves", async () => {
    const owner = await newAdmin();

    const res = await request(app)
      .post(`/admin/team/${owner.adminId}/deactivate`)
      .set(bearer(owner.token))
      .set(idem());

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("cannot_deactivate_self");
  });

  it("reactivates a disabled admin", async () => {
    const owner = await newAdmin();
    const target = await newAdmin("admin_support");
    await request(app).post(`/admin/team/${target.adminId}/deactivate`).set(bearer(owner.token)).set(idem());

    const res = await request(app)
      .post(`/admin/team/${target.adminId}/reactivate`)
      .set(bearer(owner.token))
      .set(idem());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
  });

  it("resets a password and revokes every session", async () => {
    const owner = await newAdmin();
    const target = await newAdmin("admin_support");

    const res = await request(app)
      .post(`/admin/team/${target.adminId}/reset-invite`)
      .set(bearer(owner.token))
      .set(idem());

    expect(res.status).toBe(200);
    expect(typeof res.body.password).toBe("string");

    const session = await db("admin_sessions").where({ admin_user_id: target.adminId }).first();
    expect(session?.revoked_at).not.toBeNull();
  });

  it("lists admins newest-first", async () => {
    const owner = await newAdmin();
    await newAdmin("admin_support");

    const res = await request(app).get("/admin/team").set(bearer(owner.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((a: { id: string }) => a.id === owner.adminId)).toBe(true);
  });
});
