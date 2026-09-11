import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { handleCallback, initiatePayment } from "../service.js";
import type { PaymentRequestRow } from "../service.js";
import type { BookingRow } from "../../bookings/db-types.js";

/**
 * Payments (M-Pesa STK push via Cooperative Bank, owner's call 2026-09-11).
 * Runs against the `console` payment adapter (pinned in vitest.config.ts) -
 * these tests exercise the booking/DB/idempotency plumbing, not Co-op's
 * actual gateway (see coopbank-adapter.ts for what's still unconfirmed).
 */

const userIds: string[] = [];
const bookingIds: string[] = [];
const merchantIds: string[] = [];

afterAll(async () => {
  if (bookingIds.length) {
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

async function bookingFor(hirerId: string, overrides: Partial<BookingRow> = {}) {
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
    expect(row?.provider_request_id).toMatch(/^console_stk_/);
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

    const callbackBody = {
      Body: {
        stkCallback: {
          MerchantRequestID: "test-merchant-req",
          CheckoutRequestID: pending!.provider_request_id,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [{ Name: "MpesaReceiptNumber", Value: "TEST1234RECEIPT" }],
          },
        },
      },
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
        Body: {
          stkCallback: {
            MerchantRequestID: "test-merchant-req-2",
            CheckoutRequestID: pending!.provider_request_id,
            ResultCode: 1032,
            ResultDesc: "Request cancelled by user",
          },
        },
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
});
