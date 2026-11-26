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
  minimum_hire_days?: number;
  county?: string;
  type?: string;
  transmission?: string;
  seats?: number;
  chauffeured?: boolean;
  daily_rate_amount?: number;
  verification_badge?: string;
  truck_type?: string;
  payload_kg?: number;
  machine_type?: string;
  registration?: string;
  registration_kind?: string;
  hiring_unit?: string;
  trip_rate_amount?: number;
  km_rate_amount?: number;
  quote_required?: boolean;
}

async function makeMerchant(
  opts: {
    approved?: boolean;
    company?: boolean;
    companyName?: string;
    firstName?: string;
    phone?: string;
    fullName?: string;
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
      full_name: opts.fullName ?? null,
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
      registration: spec.registration ?? plate(),
      registration_kind: spec.registration_kind ?? "plate",
      transmission: spec.transmission ?? "Automatic",
      fuel: "Petrol",
      colour: "Silver",
      seats: spec.seats ?? 5,
      truck_type: spec.truck_type ?? null,
      payload_kg: spec.payload_kg ?? null,
      machine_type: spec.machine_type ?? null,
      hiring_unit: spec.hiring_unit ?? "day",
      trip_rate_amount: spec.trip_rate_amount ?? null,
      trip_rate_currency: spec.trip_rate_amount ? "KES" : null,
      km_rate_amount: spec.km_rate_amount ?? null,
      km_rate_currency: spec.km_rate_amount ? "KES" : null,
      quote_required: spec.quote_required ?? false,
      county: spec.county ?? "Nairobi",
      pickup_address: "17 Ndemi Road, Kilimani",
      daily_rate_amount: spec.daily_rate_amount ?? 420_000,
      daily_rate_currency: "KES",
      minimum_hire_days: spec.minimum_hire_days ?? 1,
      chauffeured: spec.chauffeured ?? false,
      status: spec.status ?? "live",
      verification_badge: spec.verification_badge ?? "none",
      listing_ref: `H-${Date.now().toString().slice(-6)}-${ulid().slice(-6)}`,
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
): Promise<string> {
  const id = generateId("booking");
  await db("bookings").insert({
    id,
    ref: `CB-${Date.now().toString().slice(-6)}-${ulid().slice(-6)}`,
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
  return id;
}

/**
 * A hirer's rating of an owner. Nothing in the product writes
 * `ratee_type: "merchant"` yet (no completed customer hires), so the
 * rating sort is exercised against rows inserted directly - the same
 * shape `rateHirer` writes in the other direction.
 */
async function rateOwner(
  owner: { merchantId: string; userId: string },
  vehicleId: string,
  raterUserId: string,
  stars: number,
  comment?: string,
): Promise<void> {
  const bookingId = await seedBooking(
    owner.merchantId,
    vehicleId,
    raterUserId,
    "completed",
    "2026-06-01",
    "2026-06-03",
  );
  await db("ratings").insert({
    id: generateId("review"),
    booking_id: bookingId,
    rater_id: raterUserId,
    ratee_id: owner.userId,
    ratee_type: "merchant",
    stars,
    comment: comment ?? null,
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

  it("narrows trucks by type and minimum payload, and returns both on the card", async () => {
    const m = await makeMerchant({ approved: true });
    const county = "Truck County";
    const canter = await addVehicle(m.merchantId, { county, type: "truck", truck_type: "canter", payload_kg: 4000 });
    const tipper = await addVehicle(m.merchantId, { county, type: "truck", truck_type: "tipper", payload_kg: 14000 });
    await addVehicle(m.merchantId, { county, type: "sedan" });

    const byType = await request(app).get("/catalog/vehicles").query({ county, truck_type: "canter" });
    expect(byType.body.data.map((v: { id: string }) => v.id)).toEqual([canter]);
    expect(byType.body.data[0]).toMatchObject({ category: "truck", truck_type: "canter", payload_kg: 4000 });

    const byLoad = await request(app).get("/catalog/vehicles").query({ county, payload_min_kg: 10000 });
    expect(byLoad.body.data.map((v: { id: string }) => v.id)).toEqual([tipper]);

    const bad = await request(app).get("/catalog/vehicles").query({ truck_type: "spaceship" });
    expect(bad.status).toBe(422);
  });

  it("lists a whole hire group: all cars is sedan + SUV + van, never a truck or a machine", async () => {
    const m = await makeMerchant({ approved: true });
    const county = `Group ${Date.now()}`;
    const sedan = await addVehicle(m.merchantId, { county, type: "sedan" });
    const suv = await addVehicle(m.merchantId, { county, type: "suv" });
    const van = await addVehicle(m.merchantId, { county, type: "van" });
    const truck = await addVehicle(m.merchantId, { county, type: "truck", truck_type: "tipper", payload_kg: 14000 });
    const digger = await addVehicle(m.merchantId, { county, type: "machinery", machine_type: "excavator" });

    const ids = async (query: Record<string, string>) =>
      ((await request(app).get("/catalog/vehicles").query({ county, ...query })).body.data as Array<{ id: string }>)
        .map((v) => v.id)
        .sort();

    expect(await ids({ group: "cars" })).toEqual([sedan, suv, van].sort());
    expect(await ids({ group: "trucks" })).toEqual([truck]);
    expect(await ids({ group: "machinery" })).toEqual([digger]);
    // `category` narrows inside the group; one outside it finds nothing.
    expect(await ids({ group: "cars", category: "suv" })).toEqual([suv]);
    expect(await ids({ group: "cars", category: "truck" })).toEqual([]);

    const bad = await request(app).get("/catalog/vehicles").query({ group: "boats" });
    expect(bad.status).toBe(422);
  });

  it("narrows machinery by machine type and says when a machine lists by serial number", async () => {
    const m = await makeMerchant({ approved: true });
    const county = `Machine ${Date.now()}`;
    const serial = `CAT${Date.now().toString().slice(-9)}`;
    const digger = await addVehicle(m.merchantId, {
      county,
      type: "machinery",
      machine_type: "excavator",
      registration: serial,
      registration_kind: "serial",
    });
    await addVehicle(m.merchantId, { county, type: "machinery", machine_type: "grader" });

    const res = await request(app).get("/catalog/vehicles").query({ county, machine_type: "excavator" });
    expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([digger]);
    expect(res.body.data[0]).toMatchObject({
      category: "machinery",
      machine_type: "excavator",
      registration: serial,
      registration_kind: "serial",
    });

    const car = await request(app).get("/catalog/vehicles").query({ county, group: "cars" });
    expect(car.body.data).toEqual([]);

    const bad = await request(app).get("/catalog/vehicles").query({ machine_type: "spaceship" });
    expect(bad.status).toBe(422);
  });

  it("narrows by fixed price or price by quote, the same rule as the card's `quoted`", async () => {
    const m = await makeMerchant({ approved: true });
    const county = `Priced ${Date.now()}`;
    const fixed = await addVehicle(m.merchantId, {
      county,
      type: "truck",
      truck_type: "flatbed",
      hiring_unit: "trip",
      trip_rate_amount: 3_000_000,
    });
    const flagged = await addVehicle(m.merchantId, {
      county,
      type: "truck",
      truck_type: "tipper",
      hiring_unit: "trip",
      trip_rate_amount: 3_000_000,
      quote_required: true,
    });
    const perKm = await addVehicle(m.merchantId, {
      county,
      type: "truck",
      truck_type: "box_body",
      hiring_unit: "km",
      km_rate_amount: 12_000,
    });

    const ids = async (priced?: string) =>
      (
        (await request(app).get("/catalog/vehicles").query({ county, ...(priced ? { priced } : {}) })).body
          .data as Array<{ id: string; quoted: boolean }>
      )
        .map((v) => v.id)
        .sort();

    expect(await ids("fixed")).toEqual([fixed]);
    expect(await ids("quote")).toEqual([flagged, perKm].sort());
    expect(await ids()).toEqual([fixed, flagged, perKm].sort());

    const bad = await request(app).get("/catalog/vehicles").query({ priced: "free" });
    expect(bad.status).toBe(422);
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

  it("hides a car whose minimum hire is longer than the requested window", async () => {
    const m = await makeMerchant({ approved: true });
    const county = "Minimum Hire County";
    const twoDay = await addVehicle(m.merchantId, { county, minimum_hire_days: 2 });
    const oneDay = await addVehicle(m.merchantId, { county });

    // One day requested - the two-day car cannot be booked for it.
    const short = await request(app)
      .get("/catalog/vehicles")
      .query({ county, from: "2026-10-02", to: "2026-10-02" });
    expect(short.body.data.map((v: { id: string }) => v.id)).toEqual([oneDay]);

    // Two days, counted inclusively - both are bookable.
    const long = await request(app)
      .get("/catalog/vehicles")
      .query({ county, from: "2026-10-02", to: "2026-10-03" });
    expect(long.body.data.map((v: { id: string }) => v.id).sort()).toEqual([oneDay, twoDay].sort());

    // No dates at all: the window is unknown, so nothing is filtered out.
    const undated = await request(app).get("/catalog/vehicles").query({ county });
    expect(undated.body.data.map((v: { id: string }) => v.id).sort()).toEqual(
      [oneDay, twoDay].sort(),
    );
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

  it("pages newest-first without skipping rows that share a timestamp", async () => {
    const m = await makeMerchant({ approved: true });
    const county = `Same instant ${Date.now()}`;
    // One transaction: every row gets the same `now()`, to the microsecond.
    // The millisecond cursor used to skip all of them after page one.
    const made = await db.transaction(async (trx) => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const [v] = await trx("vehicles")
          .insert({
            id: generateId("vehicle"),
            merchant_id: m.merchantId,
            type: "sedan",
            make: "Toyota",
            model: "Axio",
            year: "2017",
            registration: plate(),
            transmission: "Automatic",
            fuel: "Petrol",
            seats: 5,
            county,
            pickup_address: "Kilimani",
            daily_rate_amount: 400_000,
            daily_rate_currency: "KES",
            minimum_hire_days: 1,
            status: "live",
            listing_ref: `H-${Date.now().toString().slice(-6)}-${ulid().slice(-6)}`,
            submitted_at: new Date(),
            insurance_expiry: "2027-02-15",
            created_at: trx.fn.now(),
          })
          .returning("id");
        ids.push(v.id);
      }
      return ids;
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await request(app)
        .get("/catalog/vehicles")
        .query({ county, sort: "newest", limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((v: { id: string }) => v.id));
      if (!res.body.has_more) break;
      cursor = res.body.next_cursor;
    }
    expect(seen.sort()).toEqual([...made].sort());
  });

  it("orders by the owner's rating, unrated owners last, and pages without dupes", async () => {
    const county = "Rating County";
    const best = await makeMerchant({ approved: true, firstName: "Best" });
    const middling = await makeMerchant({ approved: true, firstName: "Middling" });
    const unrated = await makeMerchant({ approved: true, firstName: "Unrated" });
    const vBest = await addVehicle(best.merchantId, { county });
    const vMid = await addVehicle(middling.merchantId, { county });
    const vNone = await addVehicle(unrated.merchantId, { county });

    // The rater is another account's user - `rater_id` is just a users FK.
    await rateOwner(best, vBest, unrated.userId, 5);
    await rateOwner(middling, vMid, unrated.userId, 3);

    const res = await request(app)
      .get("/catalog/vehicles")
      .query({ county, sort: "rating_desc", limit: 10 });
    expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([vBest, vMid, vNone]);
    expect(res.body.data.map((v: { owner: { rating: unknown } }) => v.owner.rating)).toEqual([
      { average: 5, count: 1 },
      { average: 3, count: 1 },
      // Never an all-zero shape - an owner nobody has rated has no score.
      null,
    ]);

    // The keyset cursor walks the same order one row at a time.
    const walked: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4; i += 1) {
      const page = await request(app)
        .get("/catalog/vehicles")
        .query({ county, sort: "rating_desc", limit: 1, ...(cursor ? { cursor } : {}) });
      walked.push(...page.body.data.map((v: { id: string }) => v.id));
      if (!page.body.has_more) break;
      cursor = page.body.next_cursor as string;
    }
    expect(walked).toEqual([vBest, vMid, vNone]);
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

describe("counties", () => {
  it("lists only counties with a live listing, busiest first, folding spellings", async () => {
    const approved = await makeMerchant({ approved: true });
    const unapproved = await makeMerchant({ approved: false });
    const county = `Busy ${Date.now()}`;
    const quiet = `Quiet ${Date.now()}`;
    const hidden = `Hidden ${Date.now()}`;

    await addVehicle(approved.merchantId, { county });
    await addVehicle(approved.merchantId, { county });
    // Same county, a merchant's own spelling - one entry to a hirer, under
    // whichever spelling the most listings use.
    await addVehicle(approved.merchantId, { county: county.toLowerCase() });
    await addVehicle(approved.merchantId, { county: quiet });
    // Neither of these is hireable, so neither county should appear.
    await addVehicle(approved.merchantId, { county: hidden, status: "draft" });
    await addVehicle(unapproved.merchantId, { county: hidden });

    const res = await request(app).get("/catalog/counties");
    expect(res.status).toBe(200);
    const rows = res.body.counties as Array<{ county: string; vehicle_count: number }>;

    expect(rows.find((r) => r.county === county)).toEqual({ county, vehicle_count: 3 });
    expect(rows.find((r) => r.county === quiet)).toEqual({ county: quiet, vehicle_count: 1 });
    expect(rows.some((r) => r.county.toLowerCase() === hidden.toLowerCase())).toBe(false);
    // The lower-cased duplicate folded into the majority spelling.
    expect(rows.filter((r) => r.county.toLowerCase() === county.toLowerCase())).toHaveLength(1);

    const counts = rows.map((r) => r.vehicle_count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});

describe("counties per hire group", () => {
  it("counts only the asked group, so the trucks page never offers a cars-only county", async () => {
    const m = await makeMerchant({ approved: true });
    const carsOnly = `CarsOnly ${Date.now()}`;
    const mixed = `Mixed ${Date.now()}`;
    await addVehicle(m.merchantId, { county: carsOnly, type: "sedan" });
    await addVehicle(m.merchantId, { county: carsOnly, type: "van" });
    await addVehicle(m.merchantId, { county: mixed, type: "suv" });
    await addVehicle(m.merchantId, { county: mixed, type: "truck", truck_type: "canter", payload_kg: 3000 });

    const counties = async (group?: string) =>
      (await request(app).get("/catalog/counties").query(group ? { group } : {})).body.counties as Array<{
        county: string;
        vehicle_count: number;
      }>;

    const trucks = await counties("trucks");
    expect(trucks.some((c) => c.county === carsOnly)).toBe(false);
    expect(trucks.find((c) => c.county === mixed)).toEqual({ county: mixed, vehicle_count: 1 });

    const cars = await counties("cars");
    expect(cars.find((c) => c.county === carsOnly)).toEqual({ county: carsOnly, vehicle_count: 2 });
    expect(cars.find((c) => c.county === mixed)).toEqual({ county: mixed, vehicle_count: 1 });

    const all = await counties();
    expect(all.find((c) => c.county === mixed)).toEqual({ county: mixed, vehicle_count: 2 });

    const bad = await request(app).get("/catalog/counties").query({ group: "boats" });
    expect(bad.status).toBe(422);
  });
});

describe("hire summary", () => {
  // The shared test database holds other suites' listings too, so these
  // use prices no realistic listing has (a few cents) to own the
  // from-price, and count growth rather than absolute totals.
  it("counts live listings per group and prices each from its cheapest listing, in that listing's unit", async () => {
    const before = (await request(app).get("/catalog/hire-summary")).body;
    const m = await makeMerchant({ approved: true });
    const hidden = await makeMerchant({ approved: false });
    // Its own county keeps these few-cent listings out of other tests' county-scoped reads.
    const county = `Summary ${Date.now()}`;

    await addVehicle(m.merchantId, { county, type: "sedan", daily_rate_amount: 7 });
    await addVehicle(m.merchantId, { county, type: "van", daily_rate_amount: 9 });
    // Cheaper, but not public: a draft, and a car on an unapproved merchant.
    await addVehicle(m.merchantId, { county, type: "sedan", daily_rate_amount: 3, status: "draft" });
    await addVehicle(hidden.merchantId, { county, type: "suv", daily_rate_amount: 2 });

    // A per-trip truck: priced on its trip rate, never its leftover daily rate.
    await addVehicle(m.merchantId, {
      county,
      type: "truck",
      truck_type: "canter",
      payload_kg: 3000,
      hiring_unit: "trip",
      trip_rate_amount: 8,
      daily_rate_amount: 1,
    });
    // Quote-first trucks are counted but never priced.
    await addVehicle(m.merchantId, {
      county,
      type: "truck",
      truck_type: "tipper",
      payload_kg: 14000,
      hiring_unit: "km",
      km_rate_amount: 4,
      daily_rate_amount: 4,
    });
    await addVehicle(m.merchantId, { county, type: "truck", truck_type: "flatbed", payload_kg: 20000, quote_required: true, daily_rate_amount: 5 });

    await addVehicle(m.merchantId, { county, type: "machinery", machine_type: "roller", daily_rate_amount: 6 });

    const res = await request(app).get("/catalog/hire-summary");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["cars", "machinery", "trucks"]);

    expect(res.body.cars.count).toBeGreaterThanOrEqual(before.cars.count + 2);
    expect(res.body.cars.from).toEqual({ amount: 7, currency: "KES" });
    expect(res.body.cars.unit).toBe("day");

    expect(res.body.trucks.count).toBeGreaterThanOrEqual(before.trucks.count + 3);
    expect(res.body.trucks.from).toEqual({ amount: 8, currency: "KES" });
    expect(res.body.trucks.unit).toBe("trip");

    expect(res.body.machinery.count).toBeGreaterThanOrEqual(before.machinery.count + 1);
    expect(res.body.machinery.from).toEqual({ amount: 6, currency: "KES" });
    expect(res.body.machinery.unit).toBe("day");
  });

  it("matches the public listings exactly for a group nothing else touches", async () => {
    // The count is the same query search uses: whatever `group=machinery`
    // pages through, the summary counts.
    const summary = (await request(app).get("/catalog/hire-summary")).body;
    let listed = 0;
    let cursor: string | undefined;
    do {
      const page = await request(app)
        .get("/catalog/vehicles")
        .query({ group: "machinery", limit: 48, ...(cursor ? { cursor } : {}) });
      listed += page.body.data.length;
      cursor = page.body.next_cursor ?? undefined;
    } while (cursor);
    expect(summary.machinery.count).toBe(listed);
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

  it("returns null rating and an empty review list until someone has rated a hire of this car", async () => {
    const m = await makeMerchant({ approved: true });
    const id = await addVehicle(m.merchantId);

    const res = await request(app).get(`/catalog/vehicles/${id}`);
    // Never an all-zero shape - the page says "Not rated yet" off this.
    expect(res.body.rating).toBeNull();
    expect(res.body.reviews).toEqual([]);
  });

  it("names a reviewer by first name and last initial, never by id or email", async () => {
    const owner = await makeMerchant({ approved: true });
    const id = await addVehicle(owner.merchantId);
    const rater = await makeMerchant({ approved: true, fullName: "Wanjiku Njeri" });
    await rateOwner(owner, id, rater.userId, 5, "Exactly the car in the photos.");

    const res = await request(app).get(`/catalog/vehicles/${id}`);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].who).toBe("Wanjiku N.");
    expect(res.body.reviews[0].stars).toBe(5);
    expect(res.body.reviews[0].text).toBe("Exactly the car in the photos.");
    // The rater's identity beyond that initial never crosses the wire.
    const wire = JSON.stringify(res.body);
    expect(wire).not.toContain(rater.userId);
    expect(wire).not.toContain("Njeri");
  });

  it("scopes `rating` to this car, while `owner_rating` spans the owner's whole fleet", async () => {
    const owner = await makeMerchant({ approved: true });
    const thisCar = await addVehicle(owner.merchantId);
    const otherCar = await addVehicle(owner.merchantId);
    const rater = await makeMerchant({ approved: true, fullName: "David Kimani" });

    // Two fives on this car, a one on another car of the same owner.
    await rateOwner(owner, thisCar, rater.userId, 5);
    await rateOwner(owner, thisCar, rater.userId, 5);
    await rateOwner(owner, otherCar, rater.userId, 1);

    const res = await request(app).get(`/catalog/vehicles/${thisCar}`);
    // "From people who hired it" is about this car: 5.0 from two.
    expect(res.body.rating).toEqual({ average: 5, count: 2 });
    expect(res.body.reviews).toHaveLength(2);
    // "The owner" card is about the account: all three hires.
    expect(res.body.owner_rating.count).toBe(3);
    expect(res.body.owner_rating.average).toBeCloseTo(3.7, 1);
  });

  it("caps the review list at ten while `rating.count` stays whole-set", async () => {
    const owner = await makeMerchant({ approved: true });
    const id = await addVehicle(owner.merchantId);
    const rater = await makeMerchant({ approved: true, fullName: "Achieng Otieno" });
    for (let i = 0; i < 12; i += 1) await rateOwner(owner, id, rater.userId, 4);

    const res = await request(app).get(`/catalog/vehicles/${id}`);
    expect(res.body.reviews).toHaveLength(10);
    // The count is the whole set, not the page - the copy under the list
    // says "showing the 10 most recent of 12" off exactly this gap.
    expect(res.body.rating).toEqual({ average: 4, count: 12 });
  });
});
