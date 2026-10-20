import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { testPdf } from "../../../test/helpers.js";
import {
  bearer,
  insertFleetVehicle,
  insertLiveListing,
  listingBody,
  newMerchantSeller,
  newPrivateSeller,
  submittedListing,
  uploadAllDocuments,
} from "./fixtures.js";

const app = createApp();
const userIds: string[] = [];
const bookingIds: string[] = [];

afterAll(async () => {
  if (bookingIds.length) await db("bookings").whereIn("id", bookingIds).delete();
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

describe("seller: sale listings", () => {
  it("creates a draft with the price in cents and everything still to upload", async () => {
    const seller = await newPrivateSeller(userIds);
    const res = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^sal_/);
    expect(res.body.status).toBe("draft");
    expect(res.body.ref).toBeNull();
    expect(res.body.seller_type).toBe("private");
    expect(res.body.seller_cleared).toBe(true);
    expect(res.body.asking_price).toEqual({ amount: 145_000_000, currency: "KES" });
    expect(res.body.missing_for_submit).toEqual(["logbook", "the eight photos"]);

    const list = await request(app).get("/me/sale-listings").set(bearer(seller.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.seller).toMatchObject({ type: "private", cleared: true, limit: 2 });
  });

  it("holds prices above the integer-cents ceiling", async () => {
    const seller = await newMerchantSeller(userIds);
    const res = await request(app)
      .post("/me/sale-listings")
      .set(bearer(seller.accessToken))
      .send(listingBody({ asking_price: "38500000" }));
    expect(res.status).toBe(201);
    expect(res.body.asking_price.amount).toBe(3_850_000_000);
  });

  it("caps a private account at two open listings", async () => {
    const seller = await newPrivateSeller(userIds);
    for (let i = 0; i < 2; i++) {
      expect((await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody())).status).toBe(201);
    }
    const third = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe("private_listing_limit");

    // A merchant has no cap.
    const merchant = await newMerchantSeller(userIds);
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post("/me/sale-listings").set(bearer(merchant.accessToken)).send(listingBody())).status).toBe(201);
    }
  });

  it("allows one open sale per car, by plate and by chassis, however they are typed", async () => {
    const a = await newMerchantSeller(userIds);
    const b = await newMerchantSeller(userIds);
    const first = listingBody();
    expect((await request(app).post("/me/sale-listings").set(bearer(a.accessToken)).send(first)).status).toBe(201);

    const plate = await request(app)
      .post("/me/sale-listings")
      .set(bearer(b.accessToken))
      .send(listingBody({ registration: ` ${first.registration.toLowerCase().replace(/^(..)/, "$1 ")} ` }));
    expect(plate.status).toBe(409);
    expect(plate.body.error.code).toBe("registration_taken");

    const chassis = await request(app)
      .post("/me/sale-listings")
      .set(bearer(b.accessToken))
      .send(listingBody({ chassis_number: first.chassis_number.toLowerCase() }));
    expect(chassis.status).toBe(409);
    expect(chassis.body.error.code).toBe("chassis_taken");
  });

  it("refuses another account's fleet car, and links the seller's own", async () => {
    const owner = await newMerchantSeller(userIds);
    const vehicleId = await insertFleetVehicle(owner.merchantId!);
    const plate = (await db("vehicles").where({ id: vehicleId }).first()).registration as string;

    const stranger = await newPrivateSeller(userIds);
    const clash = await request(app)
      .post("/me/sale-listings")
      .set(bearer(stranger.accessToken))
      .send(listingBody({ registration: plate }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("registration_taken");

    // Started from scratch, but it's their own fleet car - linked anyway.
    const own = await request(app)
      .post("/me/sale-listings")
      .set(bearer(owner.accessToken))
      .send(listingBody({ registration: plate }));
    expect(own.status).toBe(201);
    expect(own.body.vehicle_id).toBe(vehicleId);
  });

  it("insists on the logbook and all eight photos, and on a verified phone for a private seller", async () => {
    const seller = await newPrivateSeller(userIds, { phoneVerified: false });
    const created = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    const id = created.body.id as string;

    const phone = await request(app).post(`/me/sale-listings/${id}/submit`).set(bearer(seller.accessToken));
    expect(phone.status).toBe(422);
    expect(phone.body.error.code).toBe("phone_unverified");

    await db("users").where({ id: seller.userId }).update({ phone_verified: true });
    const docs = await request(app).post(`/me/sale-listings/${id}/submit`).set(bearer(seller.accessToken));
    expect(docs.status).toBe(422);
    expect(docs.body.error.code).toBe("documents_incomplete");

    const noSlot = await request(app)
      .post(`/me/sale-listings/${id}/documents`)
      .set(bearer(seller.accessToken))
      .field({ kind: "sale_photo" })
      .attach("file", testPdf("x"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(noSlot.status).toBe(422);
    expect(noSlot.body.error.code).toBe("slot_required");

    const pdfPhoto = await request(app)
      .post(`/me/sale-listings/${id}/documents`)
      .set(bearer(seller.accessToken))
      .field({ kind: "sale_photo", slot: "front" })
      .attach("file", testPdf("x"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(pdfPhoto.status).toBe(422);
    expect(pdfPhoto.body.error.code).toBe("photo_must_be_image");

    await uploadAllDocuments(app, seller.accessToken, id);
    const ok = await request(app).post(`/me/sale-listings/${id}/submit`).set(bearer(seller.accessToken));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("pending");
    expect(ok.body.missing_for_submit).toEqual([]);

    const feed = await db("notifications").where({ user_id: seller.userId, subject_id: id });
    expect(feed.map((n) => n.category)).toContain("review");
  });

  it("keeps sale documents out of the seller's own account documents", async () => {
    const seller = await newPrivateSeller(userIds);
    const created = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    await uploadAllDocuments(app, seller.accessToken, created.body.id as string);

    const own = await request(app).get("/me/documents").set(bearer(seller.accessToken));
    expect(own.status).toBe(200);
    const kinds = JSON.stringify(own.body);
    expect(kinds).not.toContain("logbook");
    expect(kinds).not.toContain("sale_photo");

    const rows = await db("documents").where({ sale_listing_id: created.body.id });
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.user_id === null && r.merchant_id === null)).toBe(true);
  });

  it("locks the car's details while a reviewer has it, but not the price", async () => {
    const seller = await newPrivateSeller(userIds);
    const id = await submittedListing(app, seller);

    const details = await request(app).patch(`/me/sale-listings/${id}`).set(bearer(seller.accessToken)).send({ mileage_km: 50000 });
    expect(details.status).toBe(409);
    expect(details.body.error.code).toBe("sale_listing_locked");

    const price = await request(app).patch(`/me/sale-listings/${id}`).set(bearer(seller.accessToken)).send({ asking_price: "1300000" });
    expect(price.status).toBe(200);
    expect(price.body.asking_price.amount).toBe(130_000_000);
    expect(price.body.status).toBe("pending");
  });

  it("sends a live listing back to review when the car's details change", async () => {
    const seller = await newMerchantSeller(userIds);
    const { id } = await insertLiveListing(seller);

    const price = await request(app).patch(`/me/sale-listings/${id}`).set(bearer(seller.accessToken)).send({ negotiable: false });
    expect(price.body.status).toBe("live");

    const faults = await request(app)
      .patch(`/me/sale-listings/${id}`)
      .set(bearer(seller.accessToken))
      .send({ known_faults: "Gearbox slips in third." });
    expect(faults.status).toBe(200);
    expect(faults.body.status).toBe("pending");
  });

  it("deletes only a draft", async () => {
    const seller = await newMerchantSeller(userIds);
    const created = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    const del = await request(app).delete(`/me/sale-listings/${created.body.id}`).set(bearer(seller.accessToken));
    expect(del.status).toBe(204);

    const { id } = await insertLiveListing(seller);
    const live = await request(app).delete(`/me/sale-listings/${id}`).set(bearer(seller.accessToken));
    expect(live.status).toBe(409);
    expect(live.body.error.code).toBe("not_draft");
  });

  it("can't read or change someone else's listing", async () => {
    const owner = await newMerchantSeller(userIds);
    const other = await newMerchantSeller(userIds);
    const { id } = await insertLiveListing(owner);
    expect((await request(app).get(`/me/sale-listings/${id}`).set(bearer(other.accessToken))).status).toBe(404);
    expect(
      (await request(app).post(`/me/sale-listings/${id}/status`).set(bearer(other.accessToken)).send({ to: "paused" })).status,
    ).toBe(404);
  });
});

describe("seller: status moves and the fleet car's hire listing", () => {
  it("pauses hire while under offer, and gives it back if the sale falls through", async () => {
    const seller = await newMerchantSeller(userIds);
    const vehicleId = await insertFleetVehicle(seller.merchantId!);
    const { id } = await insertLiveListing(seller, { vehicle_id: vehicleId });

    const offer = await request(app).post(`/me/sale-listings/${id}/status`).set(bearer(seller.accessToken)).send({ to: "under_offer" });
    expect(offer.status).toBe(200);
    expect((await db("vehicles").where({ id: vehicleId }).first()).status).toBe("paused");

    const back = await request(app).post(`/me/sale-listings/${id}/status`).set(bearer(seller.accessToken)).send({ to: "live" });
    expect(back.status).toBe(200);
    expect((await db("vehicles").where({ id: vehicleId }).first()).status).toBe("live");
  });

  it("won't mark a car sold while a hire still needs it, then takes it off hire for good", async () => {
    const seller = await newMerchantSeller(userIds);
    const vehicleId = await insertFleetVehicle(seller.merchantId!);
    const { id } = await insertLiveListing(seller, { vehicle_id: vehicleId });
    const hirer = await newPrivateSeller(userIds);
    const bookingId = generateId("booking");
    bookingIds.push(bookingId);
    await db("bookings").insert({
      id: bookingId,
      ref: `CB-SALE-${Date.now().toString().slice(-6)}`,
      merchant_id: seller.merchantId,
      vehicle_id: vehicleId,
      hirer_id: hirer.userId,
      status: "confirmed",
      pickup_at: new Date(Date.now() + 86_400_000),
      dropoff_at: new Date(Date.now() + 2 * 86_400_000),
      pickup_location: "Nairobi",
      dropoff_location: "Nairobi",
      gross_amount: 400_000,
      gross_currency: "KES",
      commission_amount: 40_000,
      commission_currency: "KES",
      merchant_net_amount: 360_000,
      merchant_net_currency: "KES",
      deposit_amount: 60_000,
      deposit_currency: "KES",
      payout_method: "mpesa",
      payout_detail: "0700000000",
      payout_account_name: "Test",
      has_pickup_condition_photos: false,
      deposit_released: false,
    });

    const blocked = await request(app)
      .post(`/me/sale-listings/${id}/status`)
      .set(bearer(seller.accessToken))
      .send({ to: "sold", sold_via_cral: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("vehicle_has_upcoming_bookings");

    await db("bookings").where({ id: bookingId }).update({ status: "cancelled" });
    const sold = await request(app)
      .post(`/me/sale-listings/${id}/status`)
      .set(bearer(seller.accessToken))
      .send({ to: "sold", sold_via_cral: true });
    expect(sold.status).toBe(200);
    expect(sold.body.status).toBe("sold");
    const vehicle = await db("vehicles").where({ id: vehicleId }).first();
    expect(vehicle.status).toBe("paused");
    expect(vehicle.sold_at).not.toBeNull();

    const resume = await request(app).post(`/merchant/vehicles/${vehicleId}/resume`).set(bearer(seller.accessToken));
    expect(resume.status).toBe(409);
    expect(resume.body.error.code).toBe("vehicle_sold");

    // Sold frees the plate: the buyer can list the same car later.
    const plate = (await db("sale_listings").where({ id }).first()).registration as string;
    const buyer = await newPrivateSeller(userIds);
    const relist = await request(app).post("/me/sale-listings").set(bearer(buyer.accessToken)).send(listingBody({ registration: plate }));
    expect(relist.status).toBe(201);
  });

  it("rejects moves that make no sense", async () => {
    const seller = await newMerchantSeller(userIds);
    const created = await request(app).post("/me/sale-listings").set(bearer(seller.accessToken)).send(listingBody());
    const res = await request(app)
      .post(`/me/sale-listings/${created.body.id}/status`)
      .set(bearer(seller.accessToken))
      .send({ to: "sold" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_transition");
  });

  it("renews an expired listing for another 60 days", async () => {
    const seller = await newMerchantSeller(userIds);
    const { id } = await insertLiveListing(seller, { status: "expired", expires_at: new Date(Date.now() - 86_400_000) });
    const res = await request(app).post(`/me/sale-listings/${id}/renew`).set(bearer(seller.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("live");
    const days = (new Date(res.body.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(60);
  });
});
