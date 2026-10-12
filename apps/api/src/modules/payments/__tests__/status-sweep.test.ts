import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestBooking, createVerifiedTestUser } from "../../../test/helpers.js";
import { reconcilePendingCoopPayments, STATUS_QUERY_AFTER_MS } from "../status-sweep.js";

/**
 * The Transaction Status sweep. The Co-op call itself is stubbed - the
 * sandbox gateway answers nothing but redirects as of 2026-10-12 - so
 * these exercise which rows get asked about and what happens to each
 * answer. The answer reader has its own tests in adapters/coopbank.
 */

const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];

beforeEach(() => {
  process.env.COOPBANK_CONSUMER_KEY = "key";
  process.env.COOPBANK_CONSUMER_SECRET = "secret";
});
afterEach(() => {
  delete process.env.COOPBANK_CONSUMER_KEY;
  delete process.env.COOPBANK_CONSUMER_SECRET;
});

afterAll(async () => {
  await db("payment_requests").whereIn("booking_id", bookingIds).delete();
  await db("bookings").whereIn("id", bookingIds).delete();
  await db("vehicles").whereIn("merchant_id", merchantIds).delete();
  await db("merchants").whereIn("id", merchantIds).delete();
  await db("sessions").whereIn("user_id", userIds).delete();
  await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

/** A KES 750 STK request created `ageMs` before `now`. */
async function pending(now: Date, ageMs: number, provider = "coopbank"): Promise<string> {
  const hirer = await createVerifiedTestUser();
  const booking = await createTestBooking(hirer.userId);
  userIds.push(hirer.userId, booking.ownerUserId);
  merchantIds.push(booking.merchantId);
  bookingIds.push(booking.bookingId);
  const reference = ulid();
  await db("payment_requests").insert({
    id: generateId("payment"),
    booking_id: booking.bookingId,
    purpose: "deposit",
    phone: "+254712345678",
    amount_amount: 75_000,
    amount_currency: "KES",
    provider,
    provider_request_id: reference,
    status: "pending",
    expires_at: new Date(now.getTime() - ageMs + 5 * 60_000),
    created_at: new Date(now.getTime() - ageMs),
  });
  return reference;
}

const statusOf = async (reference: string) =>
  (await db("payment_requests").where({ provider_request_id: reference }).first()).status as string;

const success = (reference: string) => ({
  status: 200,
  body: {
    MessageReference: reference,
    MessageCode: "0",
    MessageDescription: "FULL SUCCESS",
    Destinations: [{ TransactionID: "SJC1SWEEP1", Amount: 750, ResponseCode: "0" }],
  },
});

describe("reconcilePendingCoopPayments", () => {
  it("settles a lost callback from Co-op's own answer, and audits who decided", async () => {
    const now = new Date();
    const ref = await pending(now, 10 * 60_000);
    const query = vi.fn(async (r: string) => success(r));

    const result = await reconcilePendingCoopPayments(now, query);
    expect(query).toHaveBeenCalledWith(ref);
    expect(result.settled).toBeGreaterThanOrEqual(1);
    expect(await statusOf(ref)).toBe("success");

    const row = await db("payment_requests").where({ provider_request_id: ref }).first();
    const audit = await db("audit_log").where({ entity_id: row.booking_id, action: "payment.succeeded" }).first();
    expect(audit.actor_id).toBe("coopbank-status-query");
  });

  it("leaves a row alone when the answer is ambiguous or the call fails", async () => {
    const now = new Date();
    const ambiguous = await pending(now, 10 * 60_000);
    const broken = await pending(now, 10 * 60_000);
    const query = vi.fn(async (r: string) => {
      if (r === broken) throw new Error("redirected (302)");
      return { status: 404, body: { MessageCode: "-1" } };
    });

    await reconcilePendingCoopPayments(now, query);
    expect(await statusOf(ambiguous)).toBe("pending");
    expect(await statusOf(broken)).toBe("pending");
  });

  it("gives the callback a head start, and only asks about Co-op rows", async () => {
    const now = new Date();
    const fresh = await pending(now, STATUS_QUERY_AFTER_MS / 2);
    const daraja = await pending(now, 10 * 60_000, "daraja");
    const query = vi.fn(async (r: string) => success(r));

    await reconcilePendingCoopPayments(now, query);
    expect(query).not.toHaveBeenCalledWith(fresh);
    expect(query).not.toHaveBeenCalledWith(daraja);
  });

  it("does nothing where Co-op isn't configured", async () => {
    delete process.env.COOPBANK_CONSUMER_KEY;
    const query = vi.fn();
    const result = await reconcilePendingCoopPayments(new Date(), query);
    expect(query).not.toHaveBeenCalled();
    expect(result.checked).toBe(0);
  });
});
