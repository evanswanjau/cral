import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";
import { generateId } from "../../../lib/ids.js";
import { nextListingRef } from "../../../lib/vehicle-events.js";

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    const merchantIds = (await db("merchants").whereIn("user_id", userIds).select("id")).map((m) => m.id);
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

function plate(): string {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const D = () => String.fromCharCode(48 + Math.floor(Math.random() * 10));
  return `K${L()}${L()} ${D()}${D()}${D()}${L()}`;
}

/** A merchant with a fixed spread of submitted vehicles, inserted directly. */
async function merchantWith(
  statuses: Array<{ status: string; county: string; hoursAgo: number }>,
  opts: { approved?: boolean; company?: boolean } = {},
): Promise<{ merchantId: string; userId: string }> {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  await db("users").where({ id: u.userId }).update({ phone: `+2547${ulid().slice(-8).replace(/[A-Z]/g, "2")}` });

  const [m] = await db("merchants")
    .insert({
      id: generateId("merchant"),
      user_id: u.userId,
      owner_type: opts.company ? "company" : "individual",
      company_name: opts.company ? "Karanja Fleet Ltd" : null,
      first_name: "Mwangi",
      surname: "Karanja",
      payout_method: "mpesa",
      payout_same: true,
      onboarding_step: 5,
      onboarding_max_step: 5,
      onboarding_screen: "done",
      onboarding_submitted: true,
      ...(opts.approved ? { approved_at: new Date() } : {}),
    })
    .returning("*");

  for (const s of statuses) {
    await db("vehicles").insert({
      id: generateId("vehicle"),
      merchant_id: m.id,
      type: "sedan",
      make: "Toyota",
      model: "Axio",
      year: "2019",
      registration: plate(),
      transmission: "Automatic",
      fuel: "Petrol",
      colour: "Silver",
      seats: 5,
      county: s.county,
      pickup_address: `${s.county} CBD`,
      daily_rate_amount: 450000,
      minimum_hire_days: 1,
      chauffeured: false,
      status: s.status,
      listing_ref: await nextListingRef(db),
      submitted_at: new Date(Date.now() - s.hoursAgo * 3600e3),
      insurance_expiry: "2027-02-15",
    });
  }
  return { merchantId: m.id, userId: u.userId };
}

/** Inserts the account/business document rows a merchant approval needs (fake bytes). */
async function seedBusinessDocs(merchantId: string, kinds: string[]) {
  for (const kind of kinds) {
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: merchantId,
      vehicle_id: null,
      kind,
      storage_key: `seed/${merchantId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 12345,
      content_type: "application/pdf",
      review_state: "pending",
    });
  }
}

const bearerIdem = () => ({ "Idempotency-Key": `m-${ulid()}` });

describe("the Merchants lens is ops-only, on the merchants queue", () => {
  it("refuses a merchant token, and an admin without the merchants queue", async () => {
    const { accessToken } = await createVerifiedTestUser();
    expect((await request(app).get("/admin/merchants").set(bearer(accessToken))).status).toBe(401);

    const reviewerNoMerchants = await newAdmin("admin_reviewer", ["vehicles"]);
    const denied = await request(app).get("/admin/merchants").set(bearer(reviewerNoMerchants.token));
    expect(denied.status).toBe(403);

    const reviewer = await newAdmin("admin_reviewer", ["merchants"]);
    expect((await request(app).get("/admin/merchants").set(bearer(reviewer.token))).status).toBe(200);
  });
});

describe("the merchants list", () => {
  it("lists a merchant that has submitted vehicles, with whole-set tallies and a badge", async () => {
    const admin = await newAdmin();
    const { merchantId } = await merchantWith([
      { status: "pending", county: "Nairobi", hoursAgo: 10 },
      { status: "review", county: "Mombasa", hoursAgo: 20 },
      { status: "live", county: "Nairobi", hoursAgo: 200 },
      { status: "rejected", county: "Kisumu", hoursAgo: 300 },
    ]);

    const res = await request(app).get("/admin/merchants").set(bearer(admin.token));
    expect(res.status).toBe(200);
    const row = res.body.data.find((m: { id: string }) => m.id === merchantId);
    expect(row).toBeTruthy();
    expect(row.fleet).toBe(4);
    expect(row.live).toBe(1);
    expect(row.waiting).toBe(2); // pending + review, not page-bound
    expect(row.badge).toBe("new_merchant"); // approved_at is null
    expect(row.towns.sort()).toEqual(["Kisumu", "Mombasa", "Nairobi"]);
    expect(typeof res.body.total).toBe("number");
  });
});

describe("a merchant file", () => {
  it("carries the stats, the not-verified note, the fleet, and the next case to review", async () => {
    const admin = await newAdmin();
    const { merchantId } = await merchantWith(
      [
        { status: "pending", county: "Nakuru", hoursAgo: 5 }, // oldest open -> review_next
        { status: "review", county: "Nakuru", hoursAgo: 2 },
        { status: "rejected", county: "Nakuru", hoursAgo: 100 },
      ],
      { company: true },
    );

    const res = await request(app).get(`/admin/merchants/${merchantId}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Karanja Fleet Ltd");
    expect(res.body.badge).toBe("new_merchant");
    expect(res.body.stats).toMatchObject({ submitted: 3, live: 0, waiting: 2, rejected: 1 });
    expect(res.body.note).toContain("two separate decisions");
    expect(res.body.fleet).toHaveLength(3);
    expect(res.body.review_next).toBeTruthy();
    // The pending one submitted 5h ago is older than the review one at 2h.
    const nextInFleet = res.body.fleet.find((v: { id: string }) => v.id === res.body.review_next.id);
    expect(nextInFleet.status).toBe("pending");
    expect(res.body.fleet_summary).toContain("2 of 3");
  });

  it("an approved merchant reads verified, with the rejection-history note instead", async () => {
    const admin = await newAdmin();
    const { merchantId } = await merchantWith(
      [
        { status: "live", county: "Nairobi", hoursAgo: 500 },
        { status: "rejected", county: "Nairobi", hoursAgo: 400 },
      ],
      { approved: true },
    );
    const res = await request(app).get(`/admin/merchants/${merchantId}`).set(bearer(admin.token));
    expect(res.body.badge).toBe("verified");
    expect(res.body.note).toContain("earlier submission");
    expect(res.body.review_next).toBeNull();
    expect(res.body.fleet_summary).toBe("Nothing from this merchant is waiting on us.");
  });
});

describe("merchant approval - the business gate", () => {
  it("blocks approve until the business docs and checklist are clear, then verifies", async () => {
    const admin = await newAdmin();
    const { merchantId } = await merchantWith([{ status: "pending", county: "Nairobi", hoursAgo: 5 }]);
    await seedBusinessDocs(merchantId, ["national_id", "kra_pin"]);

    const file = await request(app).get(`/admin/merchants/${merchantId}`).set(bearer(admin.token));
    expect(file.body.business_documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["kra_pin", "national_id"]);
    expect(file.body.checklist.items.length).toBeGreaterThan(0);
    expect(file.body.can_approve).toBe(false);

    // Too early - docs not accepted.
    const early = await request(app)
      .post(`/admin/merchants/${merchantId}/approve`)
      .set(bearer(admin.token))
      .set(bearerIdem());
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe("documents_not_all_accepted");

    for (const kind of ["national_id", "kra_pin"]) {
      const acc = await request(app)
        .post(`/admin/merchants/${merchantId}/documents/${kind}/decision`)
        .set(bearer(admin.token))
        .set(bearerIdem())
        .send({ decision: "accept" });
      expect(acc.status).toBe(200);
    }

    // Docs done but the checklist blockers aren't.
    const midway = await request(app)
      .post(`/admin/merchants/${merchantId}/approve`)
      .set(bearer(admin.token))
      .set(bearerIdem());
    expect(midway.body.error.code).toBe("checklist_blockers_outstanding");

    const items = (await request(app).get(`/admin/merchants/${merchantId}`).set(bearer(admin.token))).body
      .checklist.items as Array<{ id: string; severity: string }>;
    for (const it of items.filter((i) => i.severity === "block")) {
      await request(app)
        .post(`/admin/merchants/${merchantId}/checklist`)
        .set(bearer(admin.token))
        .send({ item_id: it.id, result: "pass" });
    }

    const approved = await request(app)
      .post(`/admin/merchants/${merchantId}/approve`)
      .set(bearer(admin.token))
      .set(bearerIdem());
    expect(approved.status).toBe(200);
    expect(approved.body.approved).toBe(true);
    expect(approved.body.badge).toBe("verified");

    // Reopen puts it back.
    const reopened = await request(app)
      .post(`/admin/merchants/${merchantId}/reopen`)
      .set(bearer(admin.token))
      .set(bearerIdem());
    expect(reopened.body.approved).toBe(false);
  });

  it("a rejected business document notifies nobody breaks and stays rejected", async () => {
    const admin = await newAdmin();
    const { merchantId } = await merchantWith([{ status: "pending", county: "Nairobi", hoursAgo: 5 }]);
    await seedBusinessDocs(merchantId, ["national_id", "kra_pin"]);

    const res = await request(app)
      .post(`/admin/merchants/${merchantId}/documents/national_id/decision`)
      .set(bearer(admin.token))
      .set(bearerIdem())
      .send({ decision: "reject", note: "The scan is cut off." });
    expect(res.status).toBe(200);
    const line = res.body.business_documents.find((d: { kind: string }) => d.kind === "national_id");
    expect(line.state).toBe("rejected");
    expect(line.review_note).toBe("The scan is cut off.");
  });
});
