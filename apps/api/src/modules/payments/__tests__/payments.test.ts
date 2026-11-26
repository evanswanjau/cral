import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { getPaymentState, handleCallback, initiatePayment } from "../service.js";
import { executeRefund, recordRefund } from "../../../lib/refunds.js";
import type { PaymentRequestRow } from "../service.js";
import type { BookingRow } from "../../bookings/db-types.js";

/**
 * Payments. Runs against the `console` payment adapter (pinned in
 * vitest.config.ts) - these tests exercise the booking/DB/idempotency
 * plumbing that every rail shares, not any one provider's gateway.
 *
 * Two rails are registered: `daraja` (Safaricom direct, what the demo
 * runs on) and `coopbank` (kept for go-live, still gated on
 * COOPBANK_STK_PATH_CONFIRMED). Their wire formats are parsed by their
 * own adapters and tested in adapters/payment/__tests__ against captured
 * provider payloads.
 */

const userIds: string[] = [];
const bookingIds: string[] = [];
const merchantIds: string[] = [];

afterAll(async () => {
  if (bookingIds.length) {
    await db("refunds").whereIn("booking_id", bookingIds).delete();
    await db("payment_requests").whereIn("booking_id", bookingIds).delete();
    await db("bookings").whereIn("id", bookingIds).delete();
  }
  if (merchantIds.length) {
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("id", merchantIds).delete();
  }
  if (userIds.length) {
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

/**
 * `bookings.merchant_id` and `.vehicle_id` are real foreign keys, so a
 * booking fixture needs rows behind them - a generated id alone trips the
 * constraint.
 */
async function merchantWithVehicle(): Promise<{ merchantId: string; vehicleId: string }> {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);

  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Test",
    surname: "Merchant",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
  });
  merchantIds.push(merchantId);

  const vehicleId = generateId("vehicle");
  await db("vehicles").insert({
    id: vehicleId,
    merchant_id: merchantId,
    type: "sedan",
    make: "Toyota",
    model: "Axio",
    year: "2019",
    registration: `KP${merchantId.slice(-5).toUpperCase()}`,
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    daily_rate_amount: 500_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: false,
    status: "live",
  });

  return { merchantId, vehicleId };
}

/**
 * Payment waits for Ops to clear the hirer's papers (H5), so every hirer
 * here starts with an accepted ID and licence unless a test says
 * otherwise. Documents cascade off `users.id`.
 */
async function clearPapers(hirerId: string, kinds: string[] = ["national_id", "driving_licence"], state = "ok") {
  for (const kind of kinds) {
    const existing = await db("documents").where({ user_id: hirerId, kind }).first("id");
    if (existing) continue;
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: null,
      user_id: hirerId,
      vehicle_id: null,
      kind,
      storage_key: `test/${hirerId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 100,
      content_type: "application/pdf",
      review_state: state,
    });
  }
}

async function bookingFor(hirerId: string, overrides: Partial<BookingRow> = {}, papers: "cleared" | "none" = "cleared") {
  if (papers === "cleared") await clearPapers(hirerId);
  const id = generateId("booking");
  const { merchantId, vehicleId } = await merchantWithVehicle();
  const [row] = await db<BookingRow>("bookings")
    .insert({
      id,
      ref: `CB-TEST-${id.slice(-6)}`,
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      hirer_id: hirerId,
      status: "confirmed",
      pickup_at: new Date(),
      dropoff_at: new Date(Date.now() + 86_400_000),
      pickup_location: "Nairobi",
      dropoff_location: "Nairobi",
      gross_amount: 500_000,
      gross_currency: "KES",
      commission_amount: 50_000,
      commission_currency: "KES",
      merchant_net_amount: 450_000,
      merchant_net_currency: "KES",
      deposit_amount: 75_000,
      deposit_currency: "KES",
      payout_method: "mpesa",
      payout_detail: "0700000000",
      payout_account_name: "Test Merchant",
      has_pickup_condition_photos: false,
      deposit_released: false,
      ...overrides,
    })
    .returning("*");
  if (!row) throw new Error("failed to insert test booking");
  bookingIds.push(row.id);
  return row;
}

describe("payments", () => {
  it("initiates an STK push and records a pending payment_requests row", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);

    const result = await initiatePayment(
      userId,
      booking.id,
      { purpose: "deposit", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    expect(result.status).toBe("pending");

    const row = await db<PaymentRequestRow>("payment_requests")
      .where({ id: result.payment_request_id })
      .first();
    expect(row?.amount_amount).toBe(booking.deposit_amount);
    expect(row?.booking_id).toBe(booking.id);
    // Our own generated MessageReference (a raw ulid, 26 chars) - not
    // anything the console adapter returns. See service.ts#initiatePayment.
    expect(row?.provider_request_id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it("another user's booking is a 404, not a 403", async () => {
    const owner = await createVerifiedTestUser();
    const stranger = await createVerifiedTestUser();
    userIds.push(owner.userId, stranger.userId);
    const booking = await bookingFor(owner.userId);

    await expect(
      initiatePayment(
        stranger.userId,
        booking.id,
        { purpose: "full", phone: "+254712345678" },
        { ip: null, requestId: null },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("callback marks success, sets the booking's payment_request_id, and is idempotent", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);
    const { payment_request_id } = await initiatePayment(
      userId,
      booking.id,
      { purpose: "deposit", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    const pending = await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .first();

    // The console adapter's callback shape is `ParsedCallback` itself -
    // these tests exercise the settle plumbing, not any one provider's
    // wire format, and pinning them to whichever rail is configured would
    // make an adapter swap read as a plumbing regression. Each real
    // adapter's parsing is covered in adapters/payment/__tests__.
    const callbackBody = {
      reference: pending!.provider_request_id,
      succeeded: true,
      receipt: "TEST1234RECEIPT",
      amountShillings: null,
    };

    await handleCallback(callbackBody, { ip: null, requestId: null });

    const updated = await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .first();
    expect(updated?.status).toBe("success");
    expect(updated?.provider_receipt).toBe("TEST1234RECEIPT");

    const updatedBooking = await db<BookingRow>("bookings").where({ id: booking.id }).first();
    expect(updatedBooking?.payment_request_id).toBe(payment_request_id);

    // A replayed callback (provider retry) must not error or double-apply.
    await expect(handleCallback(callbackBody, { ip: null, requestId: null })).resolves.toBeUndefined();
  });

  it("a failed result is recorded without touching the booking", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);
    const { payment_request_id } = await initiatePayment(
      userId,
      booking.id,
      { purpose: "deposit", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    const pending = await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .first();

    await handleCallback(
      {
        reference: pending!.provider_request_id,
        succeeded: false,
        failureReason: "Request cancelled by user",
      },
      { ip: null, requestId: null },
    );

    const updated = await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .first();
    expect(updated?.status).toBe("failed");
    expect(updated?.failure_reason).toBe("Request cancelled by user");

    const updatedBooking = await db<BookingRow>("bookings").where({ id: booking.id }).first();
    expect(updatedBooking?.payment_request_id).toBeNull();
  });

  /**
   * The owner accepts first, then the renter pays (owner's call,
   * 2026-09-21, reversing the brief 2026-09-20 pay-first order and
   * restoring the original gate). Charging for dates nobody holds yet is
   * what created the refund obligation in the first place.
   */
  it("refuses to charge a booking the owner hasn't answered yet", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId, { status: "requested" });

    await expect(
      initiatePayment(userId, booking.id, { purpose: "full", phone: "+254712345678" }, { ip: null, requestId: null }),
    ).rejects.toMatchObject({ code: "booking_not_payable" });
  });

  it("still refuses to charge a booking nobody holds dates on", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    // Declined, expired and cancelled are money for dates nobody holds.
    const booking = await bookingFor(userId, { status: "declined" });

    await expect(
      initiatePayment(userId, booking.id, { purpose: "full", phone: "+254712345678" }, { ip: null, requestId: null }),
    ).rejects.toMatchObject({ code: "booking_not_payable" });
  });

  it("refuses a second charge once one has succeeded", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);

    const { payment_request_id } = await initiatePayment(
      userId,
      booking.id,
      { purpose: "full", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .update({ status: "success" });

    await expect(
      initiatePayment(userId, booking.id, { purpose: "full", phone: "+254712345678" }, { ip: null, requestId: null }),
    ).rejects.toMatchObject({ code: "already_paid" });
  });

  it("returns the in-flight prompt rather than pushing a second one", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);

    const first = await initiatePayment(
      userId,
      booking.id,
      { purpose: "full", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    const second = await initiatePayment(
      userId,
      booking.id,
      { purpose: "full", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    expect(second.payment_request_id).toBe(first.payment_request_id);
  });

  it("reports payment state so a reloaded page can recover it", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);

    expect((await getPaymentState(userId, booking.id)).status).toBe("none");

    const { payment_request_id } = await initiatePayment(
      userId,
      booking.id,
      { purpose: "full", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    expect((await getPaymentState(userId, booking.id)).status).toBe("pending");

    // A pending row past its window reads as expired, not as live for ever.
    await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .update({ expires_at: new Date(Date.now() - 1000) });
    expect((await getPaymentState(userId, booking.id)).status).toBe("expired");
  });
});

/**
 * Refunds outlived the pay-first flow they were built for (2026-09-20,
 * reversed 2026-09-21). A renter pays only after acceptance now, so a
 * declined *request* owes nothing - the first test below is the one that
 * pins that. A merchant cancelling a booking they were already paid for
 * still owes the money back, which is why this stays.
 */
describe("refunds", () => {
  /** Drives a booking to genuinely paid, the way the callback would. */
  async function paidBooking(hirerId: string, status = "confirmed") {
    const booking = await bookingFor(hirerId, { status } as Partial<BookingRow>);
    const { payment_request_id } = await initiatePayment(
      hirerId,
      booking.id,
      { purpose: "full", phone: "+254712345678" },
      { ip: null, requestId: null },
    );
    await db<PaymentRequestRow>("payment_requests")
      .where({ id: payment_request_id })
      .update({ status: "success", provider_receipt: "TEST_RECEIPT" });
    return booking;
  }

  it("records nothing for an unpaid booking - a declined request owes no money", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId, { status: "requested" });

    const refundId = await db.transaction((trx) =>
      recordRefund(trx, { bookingId: booking.id, reason: "declined", actorId: userId, requestId: null, ip: null }),
    );
    expect(refundId).toBeNull();
    expect(await db("refunds").where({ booking_id: booking.id })).toHaveLength(0);
  });

  it("records what is owed on a paid booking, and sends it", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await paidBooking(userId);

    const refundId = await db.transaction((trx) =>
      recordRefund(trx, { bookingId: booking.id, reason: "declined", actorId: userId, requestId: null, ip: null }),
    );
    expect(refundId).toMatch(/^rfd_/);

    await executeRefund(refundId!, booking.ref);
    const row = await db("refunds").where({ id: refundId }).first();
    // The console adapter settles; Co-op's throws on purpose, which is
    // what the `failed` state is for.
    expect(row.status).toBe("success");
    expect(row.amount_amount).toBe(500_000);
  });

  it("refunds the balance, not the whole payment, when a fee is kept", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await paidBooking(userId, "confirmed");

    const refundId = await db.transaction((trx) =>
      recordRefund(trx, {
        bookingId: booking.id,
        reason: "merchant_cancelled",
        actorId: userId,
        requestId: null,
        ip: null,
        amountCents: 375_000,
      }),
    );
    const row = await db("refunds").where({ id: refundId }).first();
    expect(row.amount_amount).toBe(375_000);
  });

  it("never refunds more than the payment brought in", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await paidBooking(userId);

    const refundId = await db.transaction((trx) =>
      recordRefund(trx, {
        bookingId: booking.id,
        reason: "declined",
        actorId: userId,
        requestId: null,
        ip: null,
        amountCents: 900_000_000,
      }),
    );
    const row = await db("refunds").where({ id: refundId }).first();
    expect(row.amount_amount).toBe(500_000);
  });

  it("owes a booking back exactly once per reason, however many times it is asked", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await paidBooking(userId);

    const first = await db.transaction((trx) =>
      recordRefund(trx, { bookingId: booking.id, reason: "declined", actorId: userId, requestId: null, ip: null }),
    );
    const second = await db.transaction((trx) =>
      recordRefund(trx, { bookingId: booking.id, reason: "declined", actorId: userId, requestId: null, ip: null }),
    );
    expect(first).toMatch(/^rfd_/);
    // The unique index is what makes a double-refund impossible; the
    // second call finds the row already there and owes nothing more.
    expect(second).toBeNull();
    expect(await db("refunds").where({ booking_id: booking.id })).toHaveLength(1);
  });
});

/**
 * H5 (owner's decision 3, 2026-11-26): no money until Ops has cleared the
 * papers this hire needs - the ID always, the licence only when the
 * renter drives. Refused before any `payment_requests` row is written.
 */
describe("papers before payment", () => {
  const pay = (userId: string, bookingId: string) =>
    initiatePayment(userId, bookingId, { purpose: "full", phone: "+254712345678" }, { ip: null, requestId: null });

  it("refuses a self-drive hire while the renter's papers are still being checked", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    await clearPapers(userId, ["national_id", "driving_licence"], "pending");
    const booking = await bookingFor(userId, {}, "none");

    await expect(pay(userId, booking.id)).rejects.toMatchObject({ code: "papers_not_cleared", status: 422 });
    expect(await db("payment_requests").where({ booking_id: booking.id }).first()).toBeUndefined();
  });

  it("refuses a self-drive hire with the ID cleared but no licence", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    await clearPapers(userId, ["national_id"]);
    const booking = await bookingFor(userId, {}, "none");

    await expect(pay(userId, booking.id)).rejects.toMatchObject({ code: "papers_not_cleared" });
  });

  it("takes payment for a chauffeured hire on the ID alone", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    await clearPapers(userId, ["national_id"]);
    const booking = await bookingFor(userId, {}, "none");
    await db("vehicles").where({ id: booking.vehicle_id }).update({ chauffeured: true });

    const result = await pay(userId, booking.id);
    expect(result.status).toBe("pending");
  });

  it("takes payment for a self-drive hire once both papers are cleared", async () => {
    const { userId } = await createVerifiedTestUser();
    userIds.push(userId);
    const booking = await bookingFor(userId);

    const result = await pay(userId, booking.id);
    expect(result.status).toBe("pending");
  });
});
