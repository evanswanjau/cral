import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";

/**
 * Sale listings (Phase 6 CS1): the merchant's "Cars for sale" API. The
 * state rules: a draft needs photos and the logbook to be sent; details
 * lock while Ops has it and the checked ones stay locked once live; the
 * merchant's own moves (pause, resume, sold, withdraw) follow the table;
 * one open listing per plate; everything audited.
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newMerchant(): Promise<{ token: string; merchantId: string }> {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Car",
    surname: "Seller",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
  });
  return { token: owner.accessToken, merchantId };
}

let plateSeq = 0;
const plate = () => `KD${String.fromCharCode(65 + (Date.now() % 26))} ${String(100 + (plateSeq++ % 900))}${String.fromCharCode(65 + ((Date.now() >> 5) % 26))}`;

const car = (overrides: Record<string, unknown> = {}) => ({
  body_type: "suv",
  make: "Toyota",
  model: "Prado TX",
  year: 2016,
  registration: plate(),
  mileage_km: 98000,
  transmission: "automatic",
  fuel: "diesel",
  engine_cc: 2800,
  import_status: "foreign_used",
  accident_history: "none",
  known_faults: "None known",
  encumbered: false,
  asking_price: { amount: 6_450_000_00, currency: "KES" },
  county: "Nairobi",
  viewing_area: "Westlands",
  ...overrides,
});

async function draft(token: string, body = car()): Promise<string> {
  const res = await request(app).post("/merchant/sale-listings").set(bearer(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const addFile = (token: string, id: string, kind: "photo" | "logbook") =>
  request(app)
    .post(`/merchant/sale-listings/${id}/files`)
    .set(bearer(token))
    .field("kind", kind)
    .attach("file", kind === "photo" ? testJpeg(kind) : testPdf(kind), {
      filename: kind === "photo" ? "car.jpg" : "logbook.pdf",
      contentType: kind === "photo" ? "image/jpeg" : "application/pdf",
    });

async function ready(token: string): Promise<string> {
  const id = await draft(token);
  for (let i = 0; i < 4; i++) expect((await addFile(token, id, "photo")).status).toBe(200);
  expect((await addFile(token, id, "logbook")).status).toBe(200);
  return id;
}

const submit = (token: string, id: string) => request(app).post(`/merchant/sale-listings/${id}/submit`).set(bearer(token));
const move = (token: string, id: string, to: string) =>
  request(app).post(`/merchant/sale-listings/${id}/status`).set(bearer(token)).send({ to });
const setStatus = (id: string, status: string) => db("sale_listings").where({ id }).update({ status });

describe("sale listings", () => {
  it("creates a draft with an S-YYMMDD-NNN ref, the price in cents and an audit row", async () => {
    const { token } = await newMerchant();
    const res = await request(app).post("/merchant/sale-listings").set(bearer(token)).send(car());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.ref).toMatch(/^S-\d{6}-\d{3}$/);
    expect(res.body.asking_price).toEqual({ amount: 6_450_000_00, currency: "KES" });
    const audit = await db("audit_log").where({ entity_type: "sale_listing", entity_id: res.body.id, action: "sale_listing.created" });
    expect(audit).toHaveLength(1);
  });

  it("rejects a fractional price", async () => {
    const { token } = await newMerchant();
    const res = await request(app)
      .post("/merchant/sale-listings")
      .set(bearer(token))
      .send(car({ asking_price: { amount: 100_000.5, currency: "KES" } }));
    expect(res.status).toBe(422);
  });

  it("needs 4 photos and the logbook to submit, then goes to pending", async () => {
    const { token } = await newMerchant();
    const id = await draft(token);
    expect((await submit(token, id)).body.error.code).toBe("photos_required");
    for (let i = 0; i < 4; i++) await addFile(token, id, "photo");
    expect((await submit(token, id)).body.error.code).toBe("logbook_required");
    await addFile(token, id, "logbook");
    const res = await submit(token, id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.photos).toHaveLength(4);
    expect(res.body.logbook).not.toBeNull();
    expect((await submit(token, id)).body.error.code).toBe("sale_listing_not_submittable");
  });

  it("locks everything while pending, and the checked fields once live", async () => {
    const { token } = await newMerchant();
    const id = await ready(token);
    await submit(token, id);
    const pending = await request(app).patch(`/merchant/sale-listings/${id}`).set(bearer(token)).send({ viewing_area: "Karen" });
    expect(pending.status).toBe(409);
    expect((await addFile(token, id, "photo")).status).toBe(409);

    await setStatus(id, "live");
    const price = await request(app)
      .patch(`/merchant/sale-listings/${id}`)
      .set(bearer(token))
      .send({ asking_price: { amount: 6_200_000_00, currency: "KES" } });
    expect(price.status).toBe(200);
    expect(price.body.asking_price.amount).toBe(6_200_000_00);
    const mileage = await request(app).patch(`/merchant/sale-listings/${id}`).set(bearer(token)).send({ mileage_km: 50000 });
    expect(mileage.status).toBe(409);
    expect(mileage.body.error.code).toBe("sale_listing_locked");
  });

  it("follows the merchant's status table and keeps sold final", async () => {
    const { token } = await newMerchant();
    const id = await ready(token);
    expect((await move(token, id, "paused")).body.error.code).toBe("invalid_transition");
    await submit(token, id);
    await setStatus(id, "live");
    expect((await move(token, id, "paused")).body.status).toBe("paused");
    expect((await move(token, id, "live")).body.status).toBe("live");
    const sold = await move(token, id, "sold");
    expect(sold.body.status).toBe("sold");
    expect(sold.body.sold_at).not.toBeNull();
    expect((await move(token, id, "withdrawn")).status).toBe(409);
    expect((await move(token, id, "live")).status).toBe(409);
    const actions = await db("audit_log").where({ entity_type: "sale_listing", entity_id: id }).pluck("action");
    expect(actions).toEqual(expect.arrayContaining(["sale_listing.submitted", "sale_listing.paused", "sale_listing.sold"]));
  });

  it("deletes only drafts; withdrawing frees the plate for a new listing", async () => {
    const { token } = await newMerchant();
    const reg = plate();
    const id = await ready(token);
    await request(app).patch(`/merchant/sale-listings/${id}`).set(bearer(token)).send({ registration: reg });
    const dup = await request(app).post("/merchant/sale-listings").set(bearer(token)).send(car({ registration: reg.replace(" ", "") }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("registration_already_listed");

    await submit(token, id);
    expect((await request(app).delete(`/merchant/sale-listings/${id}`).set(bearer(token))).status).toBe(409);
    expect((await move(token, id, "withdrawn")).body.status).toBe("withdrawn");
    const again = await draft(token, car({ registration: reg }));
    expect((await request(app).delete(`/merchant/sale-listings/${again}`).set(bearer(token))).status).toBe(204);
  });

  it("keeps other merchants out", async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const id = await draft(a.token);
    expect((await request(app).get(`/merchant/sale-listings/${id}`).set(bearer(b.token))).status).toBe(404);
    expect((await move(b.token, id, "withdrawn")).status).toBe(404);
    const list = await request(app).get("/merchant/sale-listings").set(bearer(b.token));
    expect(list.body.data).toHaveLength(0);
  });
});
