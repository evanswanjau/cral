import { describe, expect, it } from "vitest";
import { DarajaPaymentAdapter, darajaTimestamp, toDarajaMsisdn } from "../daraja-adapter.js";

/**
 * Daraja's own wire format, against payloads shaped exactly as Safaricom
 * documents them.
 *
 * These are pure - no database, no network. The settle rules they feed
 * are tested once, in modules/payments, through the console adapter; what
 * is provider-specific is only the parsing here, so that is all this file
 * covers. The same split keeps `coopbank` testable without either rail
 * standing in for the other.
 */

const adapter = new DarajaPaymentAdapter();

describe("darajaTimestamp", () => {
  it("formats YYYYMMDDHHmmss in Nairobi time, not UTC", () => {
    // 2026-09-22T21:30:00Z is 00:30 the NEXT day in Nairobi (UTC+3).
    // Getting this wrong shifts the hash in `Password` and Daraja rejects
    // the push with an unhelpful error, so the date rollover matters.
    expect(darajaTimestamp(new Date("2026-09-22T21:30:00.000Z"))).toBe("20260923003000");
  });

  it("pads single-digit months, days and hours", () => {
    expect(darajaTimestamp(new Date("2026-01-05T02:03:04.000Z"))).toBe("20260105050304");
  });
});

describe("toDarajaMsisdn", () => {
  it("strips the leading + Daraja rejects", () => {
    expect(toDarajaMsisdn("+254712345678")).toBe("254712345678");
  });

  it("converts a local 07... number to 2547...", () => {
    expect(toDarajaMsisdn("0712345678")).toBe("254712345678");
  });

  it("leaves an already-normalised number alone", () => {
    expect(toDarajaMsisdn("254712345678")).toBe("254712345678");
  });
});

describe("DarajaPaymentAdapter.parseCallback", () => {
  /** A real success payload, metadata items in Daraja's own order. */
  const success = {
    Body: {
      stkCallback: {
        MerchantRequestID: "29115-34620561-1",
        CheckoutRequestID: "ws_CO_191220191020363925",
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 1 },
            { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
            { Name: "TransactionDate", Value: 20260922103045 },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  };

  it("reads the receipt, the amount and the correlator off a success", () => {
    expect(adapter.parseCallback(success)).toEqual({
      reference: "ws_CO_191220191020363925",
      succeeded: true,
      receipt: "NLJ7RT61SV",
      failureReason: null,
      amountShillings: 1,
    });
  });

  it("correlates on CheckoutRequestID, not MerchantRequestID", () => {
    // The two are easy to confuse and only one is returned by the
    // initiate call we stamp onto the row.
    expect(adapter.parseCallback(success)?.reference).toBe("ws_CO_191220191020363925");
  });

  it("reads a cancelled prompt as a failure carrying Daraja's own words", () => {
    // A failure has no CallbackMetadata at all - amount and receipt must
    // come back null rather than NaN or "".
    const cancelled = {
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_191220191020363925",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    };
    expect(adapter.parseCallback(cancelled)).toEqual({
      reference: "ws_CO_191220191020363925",
      succeeded: false,
      receipt: null,
      failureReason: "Request cancelled by user",
      amountShillings: null,
    });
  });

  it("treats a stringified ResultCode as the same result", () => {
    const stringy = {
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_1",
          ResultCode: "0",
          ResultDesc: "ok",
          CallbackMetadata: { Item: [{ Name: "MpesaReceiptNumber", Value: "ABC123" }] },
        },
      },
    };
    expect(adapter.parseCallback(stringy)?.succeeded).toBe(true);
  });

  it("returns null for a body that isn't Daraja's, rather than throwing", () => {
    // A Co-op payload arriving at the Daraja URL, or anything else. The
    // route must be able to ignore it quietly - see routes.ts.
    expect(adapter.parseCallback({ MessageReference: "x", MessageCode: "0" })).toBeNull();
    expect(adapter.parseCallback({})).toBeNull();
    expect(adapter.parseCallback(null)).toBeNull();
    expect(adapter.parseCallback({ Body: { stkCallback: { ResultCode: 0 } } })).toBeNull();
  });
});

describe("DarajaPaymentAdapter.refund", () => {
  it("throws rather than resolving, so a refund is never recorded as done", () => {
    // B2C ships with the payouts slice. A silent success here would mark
    // a booking refunded while the renter's money sat with us.
    return expect(
      adapter.refund({
        messageReference: "x",
        phone: "+254712345678",
        amountCents: 100,
        narration: "Refund",
        originalReceipt: null,
      }),
    ).rejects.toMatchObject({ status: 501, code: "daraja_refund_unavailable" });
  });
});
