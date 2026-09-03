import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createHash } from "node:crypto";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { createVerifiedTestUser } from "../../test/helpers.js";
import { purgeExpiredIdempotencyKeys } from "../idempotency.js";

/**
 * Findings 5 and 6 from docs/plans/merchant-review-2026-09-03.md.
 *
 * `POST /merchant/vehicles/:vehicleId/verification` is the exercise route:
 * it 409s while the listing isn't live and 200s once it is, so the same key
 * can be walked through a failure and then a success.
 */

const app = createApp();
const createdUserIds: string[] = [];

/** What the middleware computes for `route` on the verification endpoint. */
const VERIFY_ROUTE = "POST /merchant/vehicles/:vehicleId/verification";

/**
 * The middleware's hash of an empty body — these requests carry no payload.
 *
 * A pre-seeded row has to carry the *matching* hash, because the
 * different-body check deliberately runs ahead of the in-flight and lease
 * checks: reusing one key for two different bodies is a client bug worth
 * reporting as `idempotency_conflict` whether or not the earlier attempt
 * ever finished.
 */
const EMPTY_BODY_HASH = createHash("sha256").update(JSON.stringify({})).digest("hex");

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map(
      (m) => m.id,
    );
    await db("vehicle_events")
      .whereIn("vehicle_id", db("vehicles").whereIn("merchant_id", merchantIds).select("id"))
      .delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("idempotency_keys").whereIn("user_id", createdUserIds).delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

let plateSeq = 0;
async function createVehicle(accessToken: string) {
  const plate = `KZZ ${(700 + plateSeq++).toString()}Z`;
  const res = await request(app)
    .post("/merchant/vehicles")
    .set(auth(accessToken))
    .send({
      type: "sedan",
      make: "Toyota",
      model: "Axio",
      year: "2019",
      registration: plate,
      transmission: "Automatic",
      fuel: "Petrol",
      county: "Nairobi",
      pickup_address: "Westlands, Nairobi",
      daily_rate: "4500",
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// --- Finding 5: a failed handler used to poison its key forever -------

describe("a failed request releases its Idempotency-Key", () => {
  it("lets the caller retry the same key after the first attempt errored", async () => {
    const { userId, accessToken } = await newMerchant();
    const vehicleId = await createVehicle(accessToken);
    const key = `retry-after-failure-${ulid()}`;

    // The listing isn't live yet, so this 409s — the handler never reaches
    // `complete()`.
    const failed = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(failed.status).toBe(409);
    expect(failed.body.error.code).toBe("vehicle_not_approved");

    // The claim must have been released rather than left dangling.
    const dangling = await db("idempotency_keys")
      .where({ user_id: userId, key, route: VERIFY_ROUTE })
      .first();
    expect(dangling).toBeUndefined();

    // Fix the precondition and retry with the very same key. Before this
    // change the caller got `idempotency_in_progress` here, permanently.
    await db("vehicles").where({ id: vehicleId }).update({ status: "live" });

    const retried = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(retried.status).toBe(200);
    expect(retried.body.verification_badge).toBe("pending");
  });

  it("still stores and replays a successful response", async () => {
    const { userId, accessToken } = await newMerchant();
    const vehicleId = await createVehicle(accessToken);
    await db("vehicles").where({ id: vehicleId }).update({ status: "live" });
    const key = `success-replays-${ulid()}`;

    const first = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(first.status).toBe(200);

    const stored = await db("idempotency_keys")
      .where({ user_id: userId, key, route: VERIFY_ROUTE })
      .first();
    expect(stored.response_status).toBe(200);

    const replay = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(replay.body).toEqual(first.body);

    // The side effect happened exactly once.
    const events = await db("vehicle_events").where({
      vehicle_id: vehicleId,
      kind: "verification_requested",
    });
    expect(events).toHaveLength(1);
  });

  it("rejects a genuinely concurrent replay while the first is in flight", async () => {
    const { userId, accessToken } = await newMerchant();
    const vehicleId = await createVehicle(accessToken);
    await db("vehicles").where({ id: vehicleId }).update({ status: "live" });
    const key = `in-flight-${ulid()}`;

    // Stand in for a request that is still running: claimed just now, no
    // status yet, well inside the lease.
    await db("idempotency_keys").insert({
      user_id: userId,
      key,
      route: VERIFY_ROUTE,
      request_hash: EMPTY_BODY_HASH,
      response_status: null,
      response_body: null,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("idempotency_in_progress");
  });

  it("takes over a claim abandoned by a crashed process", async () => {
    const { userId, accessToken } = await newMerchant();
    const vehicleId = await createVehicle(accessToken);
    await db("vehicles").where({ id: vehicleId }).update({ status: "live" });
    const key = `abandoned-${ulid()}`;

    // Claimed, never resolved, and older than the lease — what a process
    // killed mid-handler leaves behind. `finish` never fired for it, so the
    // lease is the only thing that frees the key.
    await db("idempotency_keys").insert({
      user_id: userId,
      key,
      route: VERIFY_ROUTE,
      request_hash: EMPTY_BODY_HASH,
      response_status: null,
      response_body: null,
      created_at: new Date(Date.now() - 5 * 60 * 1000),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);
    expect(res.status).toBe(200);
  });
});

// --- Finding 6: the 24h window was never enforced, nothing purged -----

describe("the replay window is real", () => {
  it("does not replay a response past its 24h window", async () => {
    const { userId, accessToken } = await newMerchant();
    const vehicleId = await createVehicle(accessToken);
    await db("vehicles").where({ id: vehicleId }).update({ status: "live" });
    const key = `expired-${ulid()}`;

    // A stored response from more than 24h ago. It must not be served, and
    // it must not collide with the fresh claim either — the row is still
    // physically there until the sweep collects it.
    await db("idempotency_keys").insert({
      user_id: userId,
      key,
      route: VERIFY_ROUTE,
      request_hash: EMPTY_BODY_HASH,
      response_status: 200,
      response_body: JSON.stringify({ stale: true }),
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/merchant/vehicles/${vehicleId}/verification`)
      .set(auth(accessToken))
      .set("Idempotency-Key", key);

    expect(res.status).toBe(200);
    expect(res.body.stale).toBeUndefined();
    expect(res.body.verification_badge).toBe("pending");

    // The expired row was replaced, not duplicated.
    const rows = await db("idempotency_keys").where({ user_id: userId, key, route: VERIFY_ROUTE });
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("purges expired keys and leaves live ones alone", async () => {
    const { userId } = await newMerchant();
    const liveKey = `live-${ulid()}`;
    const deadKey = `dead-${ulid()}`;

    await db("idempotency_keys").insert([
      {
        user_id: userId,
        key: liveKey,
        route: VERIFY_ROUTE,
        request_hash: "h",
        response_status: 200,
        response_body: JSON.stringify({}),
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
      {
        user_id: userId,
        key: deadKey,
        route: VERIFY_ROUTE,
        request_hash: "h",
        response_status: 200,
        response_body: JSON.stringify({}),
        expires_at: new Date(Date.now() - 60 * 60 * 1000),
      },
    ]);

    await purgeExpiredIdempotencyKeys();

    expect(await db("idempotency_keys").where({ user_id: userId, key: liveKey }).first()).toBeTruthy();
    expect(await db("idempotency_keys").where({ user_id: userId, key: deadKey }).first()).toBeUndefined();
  });
});
