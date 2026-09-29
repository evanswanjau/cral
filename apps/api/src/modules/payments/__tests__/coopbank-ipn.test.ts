import { afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { decimalToCents } from "../coopbank-ipn.js";

/**
 * Co-op Bank's account-event IPN. The payload below is the sample from
 * their Core Banking Event Notification Specification v1.1, masked
 * balances ("xx.9") and all, with a fresh TransactionId per test.
 */

const app = createApp();
const transactionIds: string[] = [];

afterEach(() => {
  delete process.env.COOPBANK_IPN_USER;
  delete process.env.COOPBANK_IPN_PASSWORD;
});

afterAll(async () => {
  // audit_log rows stay - that table is append-only by design.
  if (transactionIds.length) {
    await db("bank_account_events").whereIn("transaction_id", transactionIds).delete();
  }
  await db.destroy();
});

function sample(overrides: Record<string, unknown> = {}) {
  const transactionId = `CB${ulid()}`;
  transactionIds.push(transactionId);
  return {
    AcctNo: "01134248358600",
    Amount: "22459.0",
    BookedBalance: "xx.9",
    ClearedBalance: "xx.9",
    Currency: "KES",
    CustMemoLine1: "CHQ No.xx",
    CustMemoLine2: "",
    CustMemoLine3: "",
    EventType: "DEBIT",
    ExchangeRate: "",
    Narration: "CHQ No.xx",
    PaymentRef: "06112023_153977988",
    PostingDate: "2023-11-06+03:00",
    ValueDate: "2023-11-06+03:00",
    TransactionDate: "2023-11-06+03:00",
    TransactionId: transactionId,
    ...overrides,
  };
}

describe("decimalToCents", () => {
  it("converts the bank's decimal strings without a float", () => {
    expect(decimalToCents("22459.0")).toBe(2245900);
    expect(decimalToCents("0.1")).toBe(10);
    expect(decimalToCents("19.99")).toBe(1999);
    expect(decimalToCents("100")).toBe(10000);
    expect(decimalToCents("5.500")).toBe(550);
    expect(decimalToCents("-12.5")).toBe(-1250);
  });

  it("refuses what it can't hold exactly", () => {
    expect(decimalToCents("xx.9")).toBeNull();
    expect(decimalToCents("")).toBeNull();
    expect(decimalToCents("1.005")).toBeNull();
    expect(decimalToCents("1,000.00")).toBeNull();
    expect(decimalToCents(null)).toBeNull();
  });
});

describe("POST /payments/coopbank/ipn", () => {
  it("records the spec's sample and answers in Co-op's shape", async () => {
    const body = sample();
    const res = await request(app).post("/payments/coopbank/ipn").send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ MessageCode: "200", Message: "Successfully received data" });

    const row = await db("bank_account_events")
      .where({ transaction_id: body.TransactionId })
      .select(
        "*",
        db.raw("to_char(posting_date, 'YYYY-MM-DD') as posting"),
      )
      .first();
    expect(row).toMatchObject({
      provider: "coopbank",
      account_no: "01134248358600",
      event_type: "debit",
      amount_currency: "KES",
      booked_balance_amount: null,
      cleared_balance_amount: null,
      payment_ref: "06112023_153977988",
      cust_memo_line2: null,
      exchange_rate: null,
      posting: "2023-11-06",
    });
    expect(Number(row.amount_amount)).toBe(2245900);
    expect(row.payload.TransactionId).toBe(body.TransactionId);
  });

  it("stores a redelivery once and still acknowledges it", async () => {
    const body = sample({ EventType: "CREDIT" });
    const first = await request(app).post("/payments/coopbank/ipn").send(body);
    const second = await request(app).post("/payments/coopbank/ipn").send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await db("bank_account_events").where({ transaction_id: body.TransactionId });
    expect(rows).toHaveLength(1);
  });

  it("is a 400 for a body missing what identifies the event", async () => {
    const res = await request(app)
      .post("/payments/coopbank/ipn")
      .send(sample({ TransactionId: "" }));
    expect(res.status).toBe(400);
    expect(res.body.MessageCode).toBe("400");
  });

  it("is a 400 for an amount it can't read", async () => {
    const res = await request(app)
      .post("/payments/coopbank/ipn")
      .send(sample({ Amount: "xx.9" }));
    expect(res.status).toBe(400);
  });

  it("checks Basic credentials once they're configured", async () => {
    process.env.COOPBANK_IPN_USER = "coop";
    process.env.COOPBANK_IPN_PASSWORD = "s3cret-for-tests";

    const none = await request(app).post("/payments/coopbank/ipn").send(sample());
    expect(none.status).toBe(401);
    expect(none.body.MessageCode).toBe("401");

    const wrong = await request(app)
      .post("/payments/coopbank/ipn")
      .auth("coop", "not-it")
      .send(sample());
    expect(wrong.status).toBe(401);

    const right = await request(app)
      .post("/payments/coopbank/ipn")
      .auth("coop", "s3cret-for-tests")
      .send(sample());
    expect(right.status).toBe(200);
  });
});
