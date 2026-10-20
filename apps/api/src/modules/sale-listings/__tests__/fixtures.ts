import { ulid } from "ulid";
import request from "supertest";
import type { Express } from "express";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";
import { PHOTO_SLOTS } from "../schemas.js";

/**
 * Shared set-up for the three car-sales suites (seller, catalog, Ops).
 * Sellers and listings are inserted directly where the upload dance isn't
 * the thing under test - lighter, per the admin-merchants lesson about heavy
 * parallel set-ups.
 */

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
export const idem = () => ({ "Idempotency-Key": `sale-${ulid()}` });

/** A plate and chassis no other test will reuse - both are unique while a listing is open. */
export function uniquePlate(): string {
  return `KS${ulid().slice(-7)}`;
}

export function listingBody(overrides: Record<string, unknown> = {}) {
  return {
    category: "sedan",
    make: "Toyota",
    model: "Fielder",
    year: 2018,
    registration: uniquePlate(),
    chassis_number: `NZE161${ulid().slice(-10)}`,
    mileage_km: 96000,
    engine_cc: 1500,
    transmission: "Automatic",
    fuel: "Petrol",
    colour: "Silver",
    drive: "2wd",
    import_status: "foreign_used",
    asking_price: "1450000",
    negotiable: true,
    known_faults: "Air conditioning needs a regas.",
    accident_history: "none",
    encumbered: false,
    service_history: "partial",
    county: "Nairobi",
    viewing_area: "Kilimani",
    description: "One owner since import.",
    ...overrides,
  };
}

export interface TestSeller {
  userId: string;
  accessToken: string;
  merchantId: string | null;
}

/** A private seller: verified phone, and (by default) a national ID already accepted. */
export async function newPrivateSeller(
  cleanup: string[],
  opts: { idState?: "ok" | "pending" | null; phoneVerified?: boolean } = {},
): Promise<TestSeller> {
  const user = await createVerifiedTestUser();
  cleanup.push(user.userId);
  const phone = `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  await db("users")
    .where({ id: user.userId })
    .update({ full_name: "Wanjiru Kamau", phone, phone_verified: opts.phoneVerified ?? true });
  const idState = opts.idState === undefined ? "ok" : opts.idState;
  if (idState) {
    await db("documents").insert({
      id: generateId("document"),
      user_id: user.userId,
      kind: "national_id",
      storage_key: `test/${ulid()}`,
      original_name: "id.pdf",
      size_bytes: 10,
      content_type: "application/pdf",
      review_state: idState,
    });
  }
  return { userId: user.userId, accessToken: user.accessToken, merchantId: null };
}

/** A merchant seller - approved by default. */
export async function newMerchantSeller(cleanup: string[], approved = true): Promise<TestSeller> {
  const user = await createVerifiedTestUser();
  cleanup.push(user.userId);
  await db("users")
    .where({ id: user.userId })
    .update({ phone: `+2547${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, phone_verified: true });
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: user.userId,
    owner_type: "company",
    company_name: "Kilimani Motors Ltd",
    first_name: "Otieno",
    surname: "Odhiambo",
    payout_method: "bank",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: approved ? new Date() : null,
  });
  return { userId: user.userId, accessToken: user.accessToken, merchantId };
}

export async function insertFleetVehicle(merchantId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = generateId("vehicle");
  await db("vehicles").insert({
    id,
    merchant_id: merchantId,
    type: "sedan",
    make: "Toyota",
    model: "Fielder",
    year: "2018",
    registration: uniquePlate(),
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    daily_rate_amount: 400_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: false,
    status: "live",
    ...overrides,
  });
  return id;
}

/** Uploads the logbook and all eight photos through the API. */
export async function uploadAllDocuments(app: Express, token: string, listingId: string): Promise<void> {
  const logbook = await request(app)
    .post(`/me/sale-listings/${listingId}/documents`)
    .set(bearer(token))
    .field({ kind: "logbook" })
    .attach("file", testPdf("logbook"), { filename: "logbook.pdf", contentType: "application/pdf" });
  if (logbook.status !== 200) throw new Error(`logbook upload ${logbook.status}: ${JSON.stringify(logbook.body)}`);
  for (const slot of PHOTO_SLOTS) {
    const res = await request(app)
      .post(`/me/sale-listings/${listingId}/documents`)
      .set(bearer(token))
      .field({ kind: "sale_photo", slot })
      .attach("file", testJpeg(slot), { filename: `${slot}.jpg`, contentType: "image/jpeg" });
    if (res.status !== 200) throw new Error(`${slot} upload ${res.status}: ${JSON.stringify(res.body)}`);
  }
}

/** Create, upload everything and submit - returns the listing id. */
export async function submittedListing(app: Express, seller: TestSeller, overrides: Record<string, unknown> = {}) {
  const created = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody(overrides));
  if (created.status !== 201) throw new Error(`create ${created.status}: ${JSON.stringify(created.body)}`);
  const id = created.body.id as string;
  await uploadAllDocuments(app, seller.accessToken, id);
  const submitted = await request(app).post(`/me/sale-listings/${id}/submit`).set(bearer(seller.accessToken));
  if (submitted.status !== 200) throw new Error(`submit ${submitted.status}: ${JSON.stringify(submitted.body)}`);
  return id;
}

/**
 * A live listing inserted directly, with its logbook and eight photos
 * (`ok`, with stand-in storage keys - the bytes aren't stored).
 */
export async function insertLiveListing(
  seller: TestSeller,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; ref: string }> {
  const id = generateId("saleListing");
  const ref = `S${ulid().slice(-9)}`;
  const body = listingBody();
  await db("sale_listings").insert({
    id,
    seller_user_id: seller.userId,
    merchant_id: seller.merchantId,
    ref,
    category: body.category,
    make: body.make,
    model: body.model,
    year: body.year,
    registration: body.registration,
    chassis_number: body.chassis_number,
    mileage_km: body.mileage_km,
    engine_cc: body.engine_cc,
    transmission: body.transmission,
    fuel: body.fuel,
    colour: body.colour,
    drive: body.drive,
    import_status: body.import_status,
    asking_price_amount: 145_000_000,
    asking_price_currency: "KES",
    negotiable: true,
    known_faults: body.known_faults,
    accident_history: "none",
    encumbered: false,
    service_history: "partial",
    county: "Nairobi",
    viewing_area: "Kilimani",
    status: "live",
    submitted_at: new Date(),
    live_at: new Date(),
    expires_at: new Date(Date.now() + 60 * 86_400_000),
    ...overrides,
  });
  const docs = [
    { kind: "logbook", slot: null },
    ...PHOTO_SLOTS.map((slot) => ({ kind: "sale_photo", slot })),
  ];
  await db("documents").insert(
    docs.map((d) => ({
      id: generateId("document"),
      sale_listing_id: id,
      kind: d.kind,
      slot: d.slot,
      storage_key: `test/${ulid()}`,
      original_name: `${d.slot ?? d.kind}.jpg`,
      size_bytes: 10,
      content_type: d.kind === "logbook" ? "application/pdf" : "image/jpeg",
      review_state: "ok",
    })),
  );
  return { id, ref };
}
