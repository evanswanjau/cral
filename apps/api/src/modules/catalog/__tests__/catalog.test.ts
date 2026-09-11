import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createStorageAdapter } from "../../../adapters/storage/index.js";

/**
 * The public catalog. The two gates (`vehicles.status = 'live'` AND
 * `merchants.approved_at` set) and the PII allowlist are the load-bearing
 * behaviour here - a regression on either is a leak, so both get direct
 * assertions.
 *
 * Rows are inserted straight into the tables (the admin-merchants tests'
 * lesson - the full merchant upload dance is not needed to exercise a
 * read surface).
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    const merchantIds = (await db("merchants").whereIn("user_id", userIds).select("id")).map(
      (m) => m.id,
    );
    const vehicleIds = (
      await db("vehicles").whereIn("merchant_id", merchantIds).select("id")
    ).map((v) => v.id);
    await db("bookings").whereIn("vehicle_id", vehicleIds).delete();
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

function plate(): string {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const D = () => String.fromCharCode(48 + Math.floor(Math.random() * 10));
  return `K${L()}${L()} ${D()}${D()}${D()}${L()}`;
}

let phoneSeed = 700_000_00;
/** A distinct E.164 KE mobile per call - `users.phone` is globally unique. */
function uniquePhone(): string {
  phoneSeed += 1;
  return `+2547${String(phoneSeed).slice(-8)}`;
}

interface VehicleSpec {
  status?: string;
  county?: string;
  type?: string;
  transmission?: string;
  seats?: number;
  chauffeured?: boolean;
  daily_rate_amount?: number;
  verification_badge?: string;
}

async function makeMerchant(
  opts: {
    approved?: boolean;
    company?: boolean;
    companyName?: string;
    firstName?: string;
    phone?: string;
  } = {},
): Promise<{ merchantId: string; userId: string }> {
  const suffix = ulid().slice(-10).toLowerCase();
  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      email: `catalog-${suffix}@example.test`,
      password_hash: "x",
      roles: ["merchant"],
      email_verified: true,
      phone: opts.phone ?? uniquePhone(),
      terms_accepted_version: "2026-08-24",
      terms_accepted_at: new Date(),
    })
    .returning("*");
  userIds.push(user.id);

  const [m] = await db("merchants")
    .insert({
      id: generateId("merchant"),
      user_id: user.id,
      owner_type: opts.company ? "company" : "individual",
      company_name: opts.company ? (opts.companyName ?? "Karanja Fleet Ltd") : null,
      first_name: opts.firstName ?? "Mwangi",
      surname: "Karanja",
      national_id: "12345678",
      kra_pin: "A001122334Z",
      payout_method: "mpesa",
      payout_same: true,
      payout_detail: "0722000000",
      onboarding_step: 5,
      onboarding_max_step: 5,
      onboarding_screen: "done",
      onboarding_submitted: true,
      ...(opts.approved ? { approved_at: new Date() } : {}),
    })
    .returning("*");
  return { merchantId: m.id, userId: user.id };
}

async function addVehicle(merchantId: string, spec: VehicleSpec = {}): Promise<string> {
  const [v] = await db("vehicles")
    .insert({
      id: generateId("vehicle"),
      merchant_id: merchantId,
      type: spec.type ?? "sedan",
      make: "Toyota",
      model: "Corolla Fielder",
      year: "2018",
      registration: plate(),
      transmission: spec.transmission ?? "Automatic",
      fuel: "Petrol",
      colour: "Silver",
      seats: spec.seats ?? 5,
      county: spec.county ?? "Nairobi",
      pickup_address: "17 Ndemi Road, Kilimani",
      daily_rate_amount: spec.daily_rate_amount ?? 420_000,
      daily_rate_currency: "KES",
      minimum_hire_days: 1,
      chauffeured: spec.chauffeured ?? false,
      status: spec.status ?? "live",
      verification_badge: spec.verification_badge ?? "none",
      listing_ref: `H${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`,
      submitted_at: new Date(),
      insurance_expiry: "2027-02-15",
    })
    .returning("*");
  return v.id;
}

async function addPhoto(merchantId: string, vehicleId: string): Promise<string> {
  const key = `test/catalog/${vehicleId}/${ulid()}.png`;
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x99]);
  await createStorageAdapter().putObject({ key, body: bytes, contentType: "image/png" });
  const [d] = await db("documents")
    .insert({
      id: generateId("document"),
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      kind: "vehicle_photo",
      storage_key: key,
      original_name: "front.png",
      size_bytes: bytes.length,
      content_type: "image/png",
      review_state: "pending",
    })
    .returning("*");
  return d.id;
}

async function seedBooking(
  merchantId: string,
  vehicleId: string,
  userId: string,
  status: string,
  pickup: string,
  dropoff: string,
): Promise<void> {
  await db("bookings").insert({
    id: generateId("booking"),
    ref: `CB-${Math.floor(Math.random() * 9000 + 1000)}`,
    merchant_id: merchantId,
    vehicle_id: vehicleId,
    hirer_id: userId,
    status,
    pickup_at: new Date(`${pickup}T08:00:00Z`),
    dropoff_at: new Date(`${dropoff}T08:00:00Z`),
    pickup_location: "Kilimani",
    dropoff_location: "Kilimani",
    gross_amount: 840_000,
    gross_currency: "KES",
    commission_amount: 84_000,
    commission_currency: "KES",
    merchant_net_amount: 756_000,
    merchant_net_currency: "KES",
    deposit_amount: 126_000,
    deposit_currency: "KES",
    payout_method: "mpesa",
    payout_detail: "0722000000",
    payout_account_name: "Mwangi Karanja",
  });
}

describe("the two gates decide what is public", () => {
  it("shows a live listing on an approved merchant, and hides the rest", async () => {
    const approved = await makeMerchant({ approved: true });
    const liveId = await addVehicle(approved.merchantId, { county: "Gatecrash County" });
    await addVehicle(approved.merchantId, { status: "paused", county: "Gatecrash County" });
    await addVehicle(approved.merchantId, { status: "draft", county: "Gatecrash County" });

    const unapproved = await makeMerchant({ approved: false });
    await addVehicle(unapproved.merchantId, { county: "Gatecrash County" });

    const res = await request(app).get("/catalog/vehicles").query({ county: "Gatecrash County" });
    expect(res.status).toBe(200);
    expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([liveId]);
  });

  it("404s the detail of a listing that is not publicly visible", async () => {
    const unapproved = await makeMerchant({ approved: false });
    const hiddenId = await addVehicle(unapproved.merchantId);

    const res = await request(app).get(`/catalog/vehicles/${hiddenId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("vehicle_not_found");
  });
});

describe("PII projection", () => {
  it("never returns owner contact details, IDs, payout info or the exact address", async () => {
    const m = await makeMerchant({
      approved: true,
      firstName: "Njoroge",
      phone: "+254799112233",
    });
    const id = await addVehicle(m.merchantId, { county: "Projection County" });

    const listRes = await request(app)
      .get("/catalog/vehicles")
      .query({ county: "Projection County" });
    const detailRes = await request(app).get(`/catalog/vehicles/${id}`);

    for (const res of [listRes, detailRes]) {
      const blob = JSON.stringify(res.body);
      expect(blob).not.toContain("+254799112233");
      expect(blob).not.toContain("0722000000"); // payout_detail
      expect(blob).not.toContain("12345678"); // national_id
      expect(blob).not.toContain("A001122334Z"); // kra_pin
      expect(blob).not.toContain("Ndemi Road"); // pickup_address
      expect(blob).not.toContain("example.test"); // owner email
    }

    // What it *does* carry about the owner: a first name and a join date.
    expect(detailRes.body.owner.display_name).toBe("Njoroge");
    expect(detailRes.body.owner).not.toHaveProperty("phone");
    expect(detailRes.body).not.toHaveProperty("pickup_address");
    expect(detailRes.body).not.toHaveProperty("documents");
    expect(detailRes.body).not.toHaveProperty("reviewer_note");
  });

  it("shows a company's name, not a person's", async () => {
    const m = await makeMerchant({
      approved: true,
      company: true,
      companyName: "Rift Valley Fleet Ltd",
    });
    const id = await addVehicle(m.merchantId, { county: "Company County" });
    const res = await request(app).get(`/catalog/vehicles/${id}`);
    expect(res.body.owner.display_name).toBe("Rift Valley Fleet Ltd");
  });
});

describe("filters", () => {
  it("narrows by category, price, seats, transmission and driver", async () => {
    const m = await makeMerchant({ approved: true });
    const county = "Filter County";
    const wanted = await addVehicle(m.merchantId, {
      county,
      type: "van",
      seats: 11,
      transmission: "Manual",
      chauffeured: true,
      daily_rate_amount: 900_000,
    });
    await addVehicle(m.merchantId, { county, type: "sedan", seats: 5, daily_rate_amount: 300_000 });

    const res = await request(app).get("/catalog/vehicles").query({
      county,
      category: "van",
      seats_min: 7,
      transmission: "manual",
      chauffeured: "true",
      max_price: 1_000_000,
    });
    expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([wanted]);
  });

  it("rejects from without to", async () => {
    const res = await request(app).get("/catalog/vehicles").query({ from: "2026-09-20" });
    expect(res.status).toBe(422);
  });
});

describe("availability window", () => {
  it("drops a car with a confirmed hire overlapping the requested dates", async () => {
    const m = await makeMerchant({ approved: true });
    const county = "Availability County";
    const busy = await addVehicle(m.merchantId, { county });
    const free = await addVehicle(m.merchantId, { county });
    await seedBooking(m.merchantId, busy, m.userId, "confirmed", "2026-09-21", "2026-09-25");

    const overlaps = await request(app)
      .get("/catalog/vehicles")
      .query({ county, from: "2026-09-23", to: "2026-09-24" });
    expect(overlaps.body.data.map((v: { id: string }) => v.id)).toEqual([free]);

    const clear = await request(app)
      .get("/catalog/vehicles")
      .query({ county, from: "2026-10-10", to: "2026-10-12" });
    expect(clear.body.data.map((v: { id: string }) => v.id).sort()).toEqual([busy, free].sort());
  });
});

describe("sort and pagination", () => {
  it("orders by price and walks pages with a cursor, no dupes", async () => {
    const m = await makeMerchant({ approved: true });
    const county = "Paging County";
    const prices = [500_000, 200_000, 800_000, 300_000, 100_000];
    for (const p of prices) await addVehicle(m.merchantId, { county, daily_rate_amount: p });

    const page1 = await request(app)
      .get("/catalog/vehicles")
      .query({ county, sort: "price_asc", limit: 2 });
    expect(page1.body.data.map((v: { daily_rate: { amount: number } }) => v.daily_rate.amount)).toEqual(
      [100_000, 200_000],
    );
    expect(page1.body.has_more).toBe(true);

    const page2 = await request(app)
      .get("/catalog/vehicles")
      .query({ county, sort: "price_asc", limit: 2, cursor: page1.body.next_cursor });
    expect(page2.body.data.map((v: { daily_rate: { amount: number } }) => v.daily_rate.amount)).toEqual(
      [300_000, 500_000],
    );

    const page3 = await request(app)
      .get("/catalog/vehicles")
      .query({ county, sort: "price_asc", limit: 2, cursor: page2.body.next_cursor });
    expect(page3.body.data.map((v: { daily_rate: { amount: number } }) => v.daily_rate.amount)).toEqual(
      [800_000],
    );
    expect(page3.body.has_more).toBe(false);
  });
});

describe("collections", () => {
  it("returns all eight rails, each honouring its membership rule", async () => {
    const m = await makeMerchant({ approved: true });
    await addVehicle(m.merchantId, { daily_rate_amount: 350_000, seats: 5, type: "sedan" }); // budget
    await addVehicle(m.merchantId, { daily_rate_amount: 1_500_000, seats: 8, type: "suv" }); // executive, family, roadtrip

    const res = await request(app).get("/catalog/collections");
    expect(res.status).toBe(200);
    expect(res.body.collections.map((c: { key: string }) => c.key)).toEqual([
      "popular",
      "roadtrip",
      "weekend",
      "budget",
      "family",
      "executive",
      "airport",
      "upcountry",
    ]);

    const byKey = Object.fromEntries(
      res.body.collections.map((c: { key: string; vehicles: unknown[] }) => [c.key, c.vehicles]),
    );
    for (const v of byKey.budget as { daily_rate: { amount: number } }[]) {
      expect(v.daily_rate.amount).toBeLessThanOrEqual(400_000);
    }
    for (const v of byKey.family as { seats: number }[]) {
      expect(v.seats).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("photos", () => {
  it("streams a photo for a public listing and 404s one for a hidden listing", async () => {
    const approved = await makeMerchant({ approved: true });
    const liveId = await addVehicle(approved.merchantId);
    const photoId = await addPhoto(approved.merchantId, liveId);

    const detail = await request(app).get(`/catalog/vehicles/${liveId}`);
    expect(detail.body.primary_photo_url).toBe(`/catalog/vehicles/${liveId}/photos/${photoId}`);
    expect(detail.body.photo_urls).toEqual([`/catalog/vehicles/${liveId}/photos/${photoId}`]);

    const img = await request(app).get(`/catalog/vehicles/${liveId}/photos/${photoId}`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toContain("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");

    const hidden = await makeMerchant({ approved: false });
    const hiddenVeh = await addVehicle(hidden.merchantId);
    const hiddenPhoto = await addPhoto(hidden.merchantId, hiddenVeh);
    const blocked = await request(app).get(
      `/catalog/vehicles/${hiddenVeh}/photos/${hiddenPhoto}`,
    );
    expect(blocked.status).toBe(404);
  });
});

describe("what CRAL checked, and the owner's rating", () => {
  it("reports each per-vehicle document as cleared only once a reviewer accepts it", async () => {
    const m = await makeMerchant({ approved: true });
    const id = await addVehicle(m.merchantId);

    const before = await request(app).get(`/catalog/vehicles/${id}`);
    expect(before.body.documents_cleared).toEqual([
      { kind: "logbook", label: "Logbook", cleared: false },
      { kind: "comprehensive_insurance", label: "Comprehensive insurance", cleared: false },
      { kind: "tracker_certificate", label: "Tracker certificate", cleared: false },
    ]);

    await db("documents").insert({
      id: generateId("document"),
      merchant_id: m.merchantId,
      vehicle_id: id,
      kind: "logbook",
      storage_key: "test/logbook",
      original_name: "logbook.pdf",
      size_bytes: 10,
      content_type: "application/pdf",
      review_state: "ok",
    });

    const after = await request(app).get(`/catalog/vehicles/${id}`);
    expect(after.body.documents_cleared.find((d: { kind: string }) => d.kind === "logbook").cleared).toBe(
      true,
    );
  });

  it("returns null owner_rating honestly - nothing writes a hirer's rating of a merchant yet", async () => {
    const m = await makeMerchant({ approved: true });
    const id = await addVehicle(m.merchantId);

    const res = await request(app).get(`/catalog/vehicles/${id}`);
    expect(res.body.owner_rating).toBeNull();
  });
});
