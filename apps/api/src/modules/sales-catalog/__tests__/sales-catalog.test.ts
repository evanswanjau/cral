import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { runSaleListingSweep } from "../../sale-listings/sweep.js";
import {
  bearer,
  insertLiveListing,
  newMerchantSeller,
  newPrivateSeller,
  submittedListing,
} from "../../sale-listings/__tests__/fixtures.js";

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

describe("buying: browse and detail", () => {
  it("lists live cars only, without the plate, chassis or seller's number", async () => {
    const seller = await newMerchantSeller(userIds);
    const make = `Make${Date.now()}`;
    const live = await insertLiveListing(seller, { make });
    await insertLiveListing(seller, { make, status: "paused" });

    const res = await request(app).get("/sales").query({ make });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    const card = res.body.data[0];
    expect(card.ref).toBe(live.ref);
    expect(card.seller).toEqual({ name: "Kilimani Motors Ltd", type: "dealer" });
    expect(card.cover_url).toMatch(new RegExp(`^/sales/${live.ref}/photos/doc_`));
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("registration");
    expect(raw).not.toContain("chassis");
    expect(res.body.facets.makes).toContain(make);
  });

  it("filters by price and sorts cheapest first", async () => {
    const seller = await newMerchantSeller(userIds);
    const make = `Price${Date.now()}`;
    await insertLiveListing(seller, { make, asking_price_amount: 90_000_000 });
    await insertLiveListing(seller, { make, asking_price_amount: 250_000_000 });
    await insertLiveListing(seller, { make, asking_price_amount: 400_000_000 });

    const res = await request(app).get("/sales").query({ make, max_price: 3_000_000, sort: "price_asc" });
    expect(res.body.data.map((c: { asking_price: { amount: number } }) => c.asking_price.amount)).toEqual([
      90_000_000, 250_000_000,
    ]);

    // Cursor paging on the price sort.
    const page1 = await request(app).get("/sales").query({ make, sort: "price_desc", limit: 2 });
    expect(page1.body.has_more).toBe(true);
    const page2 = await request(app).get("/sales").query({ make, sort: "price_desc", limit: 2, cursor: page1.body.next_cursor });
    expect(page2.body.data.map((c: { asking_price: { amount: number } }) => c.asking_price.amount)).toEqual([90_000_000]);
  });

  it("shows the disclosures and counts the view; a draft or sold car is not found", async () => {
    const seller = await newPrivateSeller(userIds);
    const { id, ref } = await insertLiveListing(seller);
    const res = await request(app).get(`/sales/${ref}`);
    expect(res.status).toBe(200);
    expect(res.body.disclosures.known_faults).toBe("Air conditioning needs a regas.");
    expect(res.body.photos).toHaveLength(8);
    expect(res.body.checks).toEqual({ logbook_checked: true, ntsa_search: false, bank_clearance_letter: false });
    expect(res.body.safety_note).toMatch(/Never pay anything/);
    expect(res.body.seller).toEqual({ name: "Wanjiru", type: "private" });
    expect((await db("sale_listings").where({ id }).first()).view_count).toBe(1);

    await db("sale_listings").where({ id }).update({ status: "sold" });
    expect((await request(app).get(`/sales/${ref}`)).status).toBe(404);
  });

  it("serves a listed photo but never the logbook", async () => {
    const seller = await newPrivateSeller(userIds);
    const id = await submittedListing(app, seller);
    await db("sale_listings").where({ id }).update({ status: "live", ref: `S${Date.now().toString().slice(-9)}`, live_at: new Date() });
    const ref = (await db("sale_listings").where({ id }).first()).ref as string;
    const photo = await db("documents").where({ sale_listing_id: id, kind: "sale_photo", slot: "front" }).first();
    const logbook = await db("documents").where({ sale_listing_id: id, kind: "logbook" }).first();

    const ok = await request(app).get(`/sales/${ref}/photos/${photo.id}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/image\/jpeg/);
    expect((await request(app).get(`/sales/${ref}/photos/${logbook.id}`)).status).toBe(404);
  });
});

describe("buying: enquiries and reports", () => {
  it("needs a verified phone, refuses the seller's own car, and notifies the seller", async () => {
    const seller = await newMerchantSeller(userIds);
    const { id, ref } = await insertLiveListing(seller);

    const unverified = await newPrivateSeller(userIds, { phoneVerified: false });
    const blocked = await request(app).post(`/sales/${ref}/enquiries`).set(bearer(unverified.accessToken)).send({ message: "Is it available?" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("phone_unverified");

    const own = await request(app).post(`/sales/${ref}/enquiries`).set(bearer(seller.accessToken)).send({ message: "Is it available?" });
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe("own_listing");

    const buyer = await newPrivateSeller(userIds);
    const res = await request(app)
      .post(`/sales/${ref}/enquiries`)
      .set(bearer(buyer.accessToken))
      .send({ message: "Is it still available?", viewing_window: "Saturday morning" });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^enq_/);
    expect(res.body.seller_phone).toBeNull();

    const again = await request(app).post(`/sales/${ref}/enquiries`).set(bearer(buyer.accessToken)).send({ message: "Hello again" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("enquiry_exists");

    const feed = await db("notifications").where({ merchant_id: seller.merchantId, subject_id: id });
    expect(feed.map((n) => n.category)).toEqual(["enquiry"]);

    const inbox = await request(app).get("/me/sale-inbox").set(bearer(seller.accessToken));
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({ buyer_name: "Wanjiru", status: "new", viewing_window: "Saturday morning" });
    const list = await request(app).get("/me/sale-listings").set(bearer(seller.accessToken));
    expect(list.body.counts.new_enquiries).toBe(1);
  });

  it("hands over the seller's number only when the seller chooses to", async () => {
    const seller = await newPrivateSeller(userIds);
    const { ref } = await insertLiveListing(seller);
    const buyer = await newPrivateSeller(userIds);
    await request(app).post(`/sales/${ref}/enquiries`).set(bearer(buyer.accessToken)).send({ message: "Can I view it?" });

    const enquiryId = (await request(app).get("/me/sale-inbox").set(bearer(seller.accessToken))).body.data[0].id as string;
    const reply = await request(app)
      .post(`/me/sale-inbox/${enquiryId}/reply`)
      .set(bearer(seller.accessToken))
      .send({ message: "Yes, Saturday works.", share_phone: true });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ status: "replied", contact_shared: true });

    const mine = await request(app).get("/me/sale-enquiries").set(bearer(buyer.accessToken));
    const sellerPhone = (await db("users").where({ id: seller.userId }).first()).phone as string;
    expect(mine.body.data[0]).toMatchObject({ reply: "Yes, Saturday works.", seller_phone: sellerPhone });
    const note = await db("notifications").where({ user_id: buyer.userId, category: "enquiry" }).first();
    expect(note.body).toContain(sellerPhone);
    expect(note.body).toMatch(/Never pay anything/);
  });

  it("shares the number straight away when the listing says so", async () => {
    const seller = await newMerchantSeller(userIds);
    const { ref } = await insertLiveListing(seller, { auto_share_contact: true });
    const buyer = await newPrivateSeller(userIds);
    const res = await request(app).post(`/sales/${ref}/enquiries`).set(bearer(buyer.accessToken)).send({ message: "Interested" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("replied");
    expect(res.body.seller_phone).toMatch(/^\+2547/);
  });

  it("won't take an enquiry while under offer", async () => {
    const seller = await newMerchantSeller(userIds);
    const { ref } = await insertLiveListing(seller, { status: "under_offer" });
    const buyer = await newPrivateSeller(userIds);
    const res = await request(app).post(`/sales/${ref}/enquiries`).set(bearer(buyer.accessToken)).send({ message: "Interested" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("listing_under_offer");
  });

  it("takes one report per person per listing", async () => {
    const seller = await newMerchantSeller(userIds);
    const { ref } = await insertLiveListing(seller);
    const buyer = await newPrivateSeller(userIds);
    const first = await request(app).post(`/sales/${ref}/reports`).set(bearer(buyer.accessToken)).send({ reason: "scam" });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/sales/${ref}/reports`).set(bearer(buyer.accessToken)).send({ reason: "duplicate" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("already_reported");
    // "Other" has to say what is wrong.
    const someoneElse = await newPrivateSeller(userIds);
    const other = await request(app).post(`/sales/${ref}/reports`).set(bearer(someoneElse.accessToken)).send({ reason: "other" });
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe("note_required");
  });
});

describe("the 60-day expiry sweep", () => {
  it("reminds once a week out, then expires", async () => {
    const seller = await newPrivateSeller(userIds);
    const soon = await insertLiveListing(seller, { expires_at: new Date(Date.now() + 3 * 86_400_000) });
    const past = await insertLiveListing(seller, { expires_at: new Date(Date.now() - 60_000) });
    const offer = await newMerchantSeller(userIds);
    const held = await insertLiveListing(offer, { status: "under_offer", expires_at: new Date(Date.now() - 60_000) });

    const first = await runSaleListingSweep();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect((await db("sale_listings").where({ id: soon.id }).first()).expiry_reminded_at).not.toBeNull();
    expect((await db("sale_listings").where({ id: past.id }).first()).status).toBe("expired");
    expect((await db("sale_listings").where({ id: held.id }).first()).status).toBe("under_offer");

    // A second run doesn't remind again.
    await runSaleListingSweep();
    const reminders = await db("notifications").where({ user_id: seller.userId, subject_id: soon.id });
    expect(reminders).toHaveLength(1);
  });
});
