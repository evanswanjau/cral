import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
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

const BASE_VEHICLE = {
  type: "sedan" as const,
  make: "Toyota",
  model: "Axio",
  year: "2019",
  transmission: "Automatic" as const,
  fuel: "Petrol" as const,
  county: "Nairobi",
  pickup_address: "Westlands, Nairobi",
  daily_rate: "4500",
};

async function createVehicle(accessToken: string, registration: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post("/merchant/vehicles")
    .set(auth(accessToken))
    .send({ ...BASE_VEHICLE, registration, ...overrides });
}

/** Attaches everything `submitVehicle` now requires: all three documents plus three photos. */
async function makeSubmittable(accessToken: string, vehicleId: string) {
  for (const kind of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
    await request(app)
      .post(`/merchant/vehicles/${vehicleId}/documents`)
      .set(auth(accessToken))
      .field("kind", kind)
      .attach("file", Buffer.from(`fake ${kind}`), { filename: `${kind}.pdf`, contentType: "application/pdf" });
  }
  for (let i = 0; i < 3; i++) {
    await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "vehicle_photo")
      .field("vehicle_id", vehicleId)
      .attach("file", Buffer.from(`fake photo ${i}`), { filename: `photo${i}.jpg`, contentType: "image/jpeg" });
  }
}

describe("vehicles — create and list", () => {
  it("creates a draft with a listing ref and lists it under the draft filter", async () => {
    const { accessToken } = await newMerchant();
    const createRes = await createVehicle(accessToken, "KDL 442N");
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toMatch(/^veh_/);
    // H + YYMMDD + a 3-digit per-day sequence (owner's call, 2026-08-31).
    expect(createRes.body.listing_ref).toMatch(/^H\d{9}$/);
    expect(createRes.body.county).toBe("Nairobi");
    expect(createRes.body.status).toBe("draft");
    expect(createRes.body.daily_rate).toEqual({ amount: 450000, currency: "KES" });

    const listRes = await request(app).get("/merchant/vehicles").set(auth(accessToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.counts).toMatchObject({ all: 1, draft: 1, awaiting_approval: 0, needs_action: 0, live: 0 });

    const draftOnly = await request(app).get("/merchant/vehicles?filter=draft").set(auth(accessToken));
    expect(draftOnly.body.data).toHaveLength(1);
    const liveOnly = await request(app).get("/merchant/vehicles?filter=live").set(auth(accessToken));
    expect(liveOnly.body.data).toHaveLength(0);
  });

  it("paginates with a cursor, newest first", async () => {
    const { accessToken } = await newMerchant();
    await createVehicle(accessToken, "KAA 001A");
    await createVehicle(accessToken, "KAA 002B");
    await createVehicle(accessToken, "KAA 003C");

    const page1 = await request(app).get("/merchant/vehicles?limit=2").set(auth(accessToken));
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.has_more).toBe(true);
    expect(page1.body.data[0].registration).toBe("KAA 003C");

    const page2 = await request(app)
      .get(`/merchant/vehicles?limit=2&cursor=${page1.body.next_cursor}`)
      .set(auth(accessToken));
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.has_more).toBe(false);
    expect(page2.body.data[0].registration).toBe("KAA 001A");
  });

  it("404s reading someone else's vehicle", async () => {
    const owner = await newMerchant();
    const stranger = await newMerchant();
    const created = await createVehicle(owner.accessToken, "KBB 100A");

    const res = await request(app)
      .get(`/merchant/vehicles/${created.body.id}`)
      .set(auth(stranger.accessToken));
    expect(res.status).toBe(404);
  });

  it("rejects a registration already listed on the platform — even by a different merchant, and regardless of spacing/case", async () => {
    const first = await newMerchant();
    const second = await newMerchant();

    const ok = await createVehicle(first.accessToken, "KXA 771Q");
    expect(ok.status).toBe(201);

    const sameMerchant = await createVehicle(first.accessToken, "kxa-771q");
    expect(sameMerchant.status).toBe(409);
    expect(sameMerchant.body.error.code).toBe("registration_taken");
    expect(sameMerchant.body.error.field).toBe("registration");

    const otherMerchant = await createVehicle(second.accessToken, "KXA771Q");
    expect(otherMerchant.status).toBe(409);
    expect(otherMerchant.body.error.code).toBe("registration_taken");
  });

  it("hands out per-day listing refs that advance within the day", async () => {
    const { accessToken } = await newMerchant();
    const a = await createVehicle(accessToken, "KAB 010A");
    const b = await createVehicle(accessToken, "KAB 011B");

    expect(a.body.listing_ref).toMatch(/^H\d{9}$/);
    expect(b.body.listing_ref).toMatch(/^H\d{9}$/);
    // Same Nairobi day → same date portion; sequence only moves forward.
    // (Not strictly +1: the whole suite shares one daily counter.)
    expect(a.body.listing_ref.slice(0, 7)).toBe(b.body.listing_ref.slice(0, 7));
    expect(Number(b.body.listing_ref.slice(-3))).toBeGreaterThan(
      Number(a.body.listing_ref.slice(-3)),
    );
  });
});

describe("vehicles — price & availability", () => {
  it("patches the price, writes a review-history event and an audit row", async () => {
    const { accessToken, userId } = await newMerchant();
    const created = await createVehicle(accessToken, "KCC 200B");

    const patchRes = await request(app)
      .patch(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken))
      .send({ daily_rate: "12500", minimum_hire_days: 2, chauffeured: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.daily_rate).toEqual({ amount: 1250000, currency: "KES" });
    expect(patchRes.body.minimum_hire_days).toBe(2);
    expect(patchRes.body.chauffeured).toBe(false);
    expect(patchRes.body.events[0]).toMatchObject({ label: "Price updated", tone: "blue" });

    const audit = await db("audit_log")
      .where({ entity_id: created.body.id, action: "vehicle.price_updated" })
      .first();
    expect(audit).toBeTruthy();
    expect(audit.actor_id).toBe(userId);
  });
});

describe("vehicles — pause / resume", () => {
  it("refuses to pause anything but a live listing, and resume anything but paused", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KDD 300C");

    const pauseRes = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/pause`)
      .set(auth(accessToken));
    expect(pauseRes.status).toBe(409);

    await db("vehicles").where({ id: created.body.id }).update({ status: "live" });

    const paused = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/pause`)
      .set(auth(accessToken));
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");

    const resumed = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/resume`)
      .set(auth(accessToken));
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("live");

    const resumeAgain = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/resume`)
      .set(auth(accessToken));
    expect(resumeAgain.status).toBe(409);
  });
});

describe("vehicles — delete", () => {
  it("rejects a mismatched plate and deletes on an exact (case/space-insensitive) match", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KEE 400D");

    const wrong = await request(app)
      .delete(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken))
      .send({ registration: "KEE 999Z" });
    expect(wrong.status).toBe(422);

    const right = await request(app)
      .delete(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken))
      .send({ registration: "kee400d" });
    expect(right.status).toBe(204);

    const getAfter = await request(app)
      .get(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken));
    expect(getAfter.status).toBe(404);
  });
});

describe("vehicles — duplicate", () => {
  it("copies specs into a new draft and clears documents/plate", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KFF 500E");

    const dup = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/duplicate`)
      .set(auth(accessToken));
    expect(dup.status).toBe(201);
    expect(dup.body.id).not.toBe(created.body.id);
    expect(dup.body.registration).not.toBe("KFF 500E");
    expect(dup.body.status).toBe("draft");
    expect(dup.body.make).toBe("Toyota");
    expect(dup.body.doc_count).toBe(0);
  });
});

describe("vehicles — submit", () => {
  it("refuses to submit until the daily rate, all three documents, and three photos are present", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KGG 600F", { daily_rate: "0" });

    const noRate = await request(app).post(`/merchant/vehicles/${created.body.id}/submit`).set(auth(accessToken));
    expect(noRate.status).toBe(422);
    expect(noRate.body.error.code).toBe("daily_rate_required");

    await request(app)
      .patch(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken))
      .send({ daily_rate: "4500" });

    const noDocs = await request(app).post(`/merchant/vehicles/${created.body.id}/submit`).set(auth(accessToken));
    expect(noDocs.status).toBe(422);
    expect(noDocs.body.error.code).toBe("documents_incomplete");

    for (const kind of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
      await request(app)
        .post(`/merchant/vehicles/${created.body.id}/documents`)
        .set(auth(accessToken))
        .field("kind", kind)
        .attach("file", Buffer.from(`fake ${kind}`), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    }

    const noPhotos = await request(app).post(`/merchant/vehicles/${created.body.id}/submit`).set(auth(accessToken));
    expect(noPhotos.status).toBe(422);
    expect(noPhotos.body.error.code).toBe("photos_incomplete");
  });

  it("moves a complete draft to pending, and refuses a second submit", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KGG 700H");
    await makeSubmittable(accessToken, created.body.id);

    const submitRes = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/submit`)
      .set(auth(accessToken));
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("pending");
    expect(submitRes.body.submitted_at).toBeTruthy();

    const again = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/submit`)
      .set(auth(accessToken));
    expect(again.status).toBe(409);
  });

  it("locks price edits and messaging the reviewer while a submitted listing awaits its first look", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KGG 800I");
    await makeSubmittable(accessToken, created.body.id);
    await request(app).post(`/merchant/vehicles/${created.body.id}/submit`).set(auth(accessToken));

    const priceRes = await request(app)
      .patch(`/merchant/vehicles/${created.body.id}`)
      .set(auth(accessToken))
      .send({ daily_rate: "5000" });
    expect(priceRes.status).toBe(409);
    expect(priceRes.body.error.code).toBe("vehicle_pending_review");

    const messageRes = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/messages`)
      .set(auth(accessToken))
      .send({ message: "Any update?" });
    expect(messageRes.status).toBe(409);
    expect(messageRes.body.error.code).toBe("vehicle_pending_review");
  });
});

describe("vehicles — message the reviewer", () => {
  it("refuses to message before the reviewer has responded — neither a draft nor a freshly-submitted listing", async () => {
    const { accessToken } = await newMerchant();
    const draft = await createVehicle(accessToken, "KHH 600F");
    const draftRes = await request(app)
      .post(`/merchant/vehicles/${draft.body.id}/messages`)
      .set(auth(accessToken))
      .send({ message: "Hello?" });
    expect(draftRes.status).toBe(409);
    expect(draftRes.body.error.code).toBe("vehicle_not_submitted");

    const pending = await createVehicle(accessToken, "KHH 650F");
    await db("vehicles").where({ id: pending.body.id }).update({ status: "pending" });
    const pendingRes = await request(app)
      .post(`/merchant/vehicles/${pending.body.id}/messages`)
      .set(auth(accessToken))
      .send({ message: "Hello?" });
    expect(pendingRes.status).toBe(409);
    expect(pendingRes.body.error.code).toBe("vehicle_pending_review");
  });

  it("appends a review-history event once the reviewer has taken a look", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KHH 700G");
    await db("vehicles").where({ id: created.body.id }).update({ status: "review" });

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/messages`)
      .set(auth(accessToken))
      .send({ message: "The insurance certificate is being renewed this week." });
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toMatchObject({
      label: "You messaged the reviewer",
      body: "The insurance certificate is being renewed this week.",
    });

    const empty = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/messages`)
      .set(auth(accessToken))
      .send({ message: "   " });
    expect(empty.status).toBe(422);
  });
});

describe("vehicles — verification badge", () => {
  it("refuses to start a verification request until the listing is live", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KII 700G");

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", `not-yet-live-${created.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("vehicle_not_approved");
  });

  it("requires an Idempotency-Key, records intent without charging, and replays safely", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KII 800H");
    await db("vehicles").where({ id: created.body.id }).update({ status: "live" });

    const noKey = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/verification`)
      .set(auth(accessToken));
    expect(noKey.status).toBe(400);

    const key = `verify-once-key-${created.body.id}`;
    const first = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(first.status).toBe(200);
    expect(first.body.verification_badge).toBe("pending");

    const replay = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const events = await db("vehicle_events").where({ vehicle_id: created.body.id, kind: "verification_requested" });
    expect(events).toHaveLength(1);
  });
});

describe("vehicles — document upload", () => {
  it("re-uploading a document moves a rejected vehicle back to review and resolves the note", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KJJ 900I");
    await db("vehicles").where({ id: created.body.id }).update({
      status: "action",
      reviewer_note: "Upload comprehensive cover.",
      reviewer_note_resolved: false,
    });

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/documents`)
      .set(auth(accessToken))
      .field("kind", "comprehensive_insurance")
      .field("expires_at", "2027-03-16")
      .attach("file", Buffer.from("fake cert"), { filename: "cert.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("review");
    expect(res.body.reviewer_note_resolved).toBe(true);
    expect(res.body.documents.comprehensive_insurance).toMatchObject({ review_state: "pending" });
    expect(res.body.events[0]).toMatchObject({ label: "Comprehensive insurance re-uploaded" });
  });

  it("keeps a pending vehicle pending on a document re-upload — no reviewer has looked at it yet, so it can't be 'under review'", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KJJ 950I");
    await db("vehicles").where({ id: created.body.id }).update({ status: "pending" });

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/documents`)
      .set(auth(accessToken))
      .field("kind", "comprehensive_insurance")
      .field("expires_at", "2028-01-01")
      .attach("file", Buffer.from("fake cert"), { filename: "cert.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.documents.comprehensive_insurance).toMatchObject({ review_state: "pending", expires_at: "2028-01-01" });
  });

  it("does not move a live vehicle out of live on a document re-upload", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KKK 100J");
    await db("vehicles").where({ id: created.body.id }).update({ status: "live" });

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/documents`)
      .set(auth(accessToken))
      .field("kind", "logbook")
      .attach("file", Buffer.from("fake logbook"), { filename: "logbook.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("live");
  });

  it("rejects a document whose expiry date is already in the past", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KNN 400M");

    const res = await request(app)
      .post(`/merchant/vehicles/${created.body.id}/documents`)
      .set(auth(accessToken))
      .field("kind", "comprehensive_insurance")
      .field("expires_at", "2020-06-01")
      .attach("file", Buffer.from("stale cert"), { filename: "cert.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("expiry_in_past");
  });

  it("carries photos uploaded via the onboarding documents endpoint through to the vehicle detail", async () => {
    const { accessToken } = await newMerchant();
    const created = await createVehicle(accessToken, "KLL 200K");

    await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "vehicle_photo")
      .field("vehicle_id", created.body.id)
      .attach("file", Buffer.from("fake photo"), { filename: "front.jpg", contentType: "image/jpeg" });

    const detail = await request(app).get(`/merchant/vehicles/${created.body.id}`).set(auth(accessToken));
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.photos[0].original_name).toBe("front.jpg");
  });
});

describe("vehicles — merchant approval", () => {
  it("only shows the approved-merchant banner once an admin has approved the account, not just because owner docs are uploaded", async () => {
    const { accessToken, userId } = await newMerchant();
    const created = await createVehicle(accessToken, "KMM 300L");

    await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "national_id")
      .attach("file", Buffer.from("fake id"), { filename: "id.jpg", contentType: "image/jpeg" });
    await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "kra_pin")
      .attach("file", Buffer.from("fake kra"), { filename: "kra.pdf", contentType: "application/pdf" });

    const beforeApproval = await request(app).get(`/merchant/vehicles/${created.body.id}`).set(auth(accessToken));
    expect(beforeApproval.body.merchant_approved).toBe(false);
    expect(beforeApproval.body.owner_documents.national_id).toMatchObject({ review_state: "pending" });
    expect(beforeApproval.body.owner_documents.kra_pin).toMatchObject({ review_state: "pending" });

    const merchant = await db("merchants").where({ user_id: userId }).first();
    await db("merchants").where({ id: merchant.id }).update({ approved_at: new Date() });

    const afterApproval = await request(app).get(`/merchant/vehicles/${created.body.id}`).set(auth(accessToken));
    expect(afterApproval.body.merchant_approved).toBe(true);
  });
});
