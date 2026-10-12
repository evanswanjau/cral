import { afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestBooking, createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * `POST /payments/coopbank/callback` - the URL on the Co-op Connect
 * onboarding form. Checked over HTTP, not through the service, because
 * the two things under test (Basic auth, and reading Co-op's wire format
 * while `PAYMENT_ADAPTER` is `console`) both live in the route.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];

afterEach(() => {
  delete process.env.COOPBANK_CALLBACK_USER;
  delete process.env.COOPBANK_CALLBACK_PASSWORD;
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

/** A pending Co-op STK request for KES 750 on a fresh booking. */
async function pendingCoopPayment(): Promise<{ reference: string; bookingId: string }> {
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
    provider: "coopbank",
    provider_request_id: reference,
    status: "pending",
    expires_at: new Date(Date.now() + 10 * 60_000),
  });
  return { reference, bookingId: booking.bookingId };
}

function coopCallback(reference: string, overrides: Record<string, unknown> = {}) {
  return {
    MessageReference: reference,
    MessageDateTime: "2026-10-12T09:00:00Z",
    MessageCode: "0",
    MessageDescription: "The service request has been processed successfully",
    TelcoRef: "ws_CO_121020260900001",
    TransactionID: "SJC1TEST01",
    TransactionAmount: "750",
    ...overrides,
  };
}

describe("POST /payments/coopbank/callback", () => {
  it("settles a Co-op STK result even though the configured rail is console", async () => {
    const { reference, bookingId } = await pendingCoopPayment();

    const res = await request(app).post("/payments/coopbank/callback").send(coopCallback(reference));
    expect(res.status).toBe(200);
    expect(res.body.MessageCode).toBe("0");

    const row = await db("payment_requests").where({ provider_request_id: reference }).first();
    expect(row.status).toBe("success");
    expect(row.provider_receipt).toBe("SJC1TEST01");
    const booking = await db("bookings").where({ id: bookingId }).first();
    expect(booking.payment_request_id).toBe(row.id);
  });

  it("refuses a success for the wrong amount", async () => {
    const { reference } = await pendingCoopPayment();
    await request(app)
      .post("/payments/coopbank/callback")
      .send(coopCallback(reference, { TransactionAmount: "1" }));
    const row = await db("payment_requests").where({ provider_request_id: reference }).first();
    expect(row.status).toBe("failed");
  });

  it("checks Basic credentials once they're configured", async () => {
    process.env.COOPBANK_CALLBACK_USER = "coop";
    process.env.COOPBANK_CALLBACK_PASSWORD = "s3cret-for-tests";
    const { reference } = await pendingCoopPayment();

    const none = await request(app).post("/payments/coopbank/callback").send(coopCallback(reference));
    expect(none.status).toBe(401);
    expect((await db("payment_requests").where({ provider_request_id: reference }).first()).status).toBe(
      "pending",
    );

    const right = await request(app)
      .post("/payments/coopbank/callback")
      .auth("coop", "s3cret-for-tests")
      .send(coopCallback(reference));
    expect(right.status).toBe(200);
  });

  it("is closed in production until credentials are set", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post("/payments/coopbank/callback").send(coopCallback("ANY"));
      expect(res.status).toBe(503);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("is a 422 for a body that isn't Co-op's", async () => {
    const res = await request(app)
      .post("/payments/coopbank/callback")
      .send({ Body: { stkCallback: { CheckoutRequestID: "x" } } });
    expect(res.status).toBe(422);
  });
});
