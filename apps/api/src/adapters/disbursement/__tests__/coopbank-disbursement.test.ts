import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCoopTokenCacheForTests } from "../../coopbank/client.js";
import { CoopBankDisbursementAdapter, isFundsTransferBody, readFundsTransferResult } from "../coopbank-adapter.js";

/**
 * Co-op funds transfers. Requests are Co-op's own Postman collection's
 * (Pesalink Send to Account 2.0.0, IFT Send to Account 3.0.0, B2C Send To
 * M-Pesa 2.0.0, received 2026-11-04); results are the public 1.0 swagger's
 * shape, since the collection carries none. fetch is stubbed.
 */

const saved = { ...process.env };

beforeEach(() => {
  process.env.COOPBANK_CONSUMER_KEY = "key";
  process.env.COOPBANK_CONSUMER_SECRET = "secret";
  process.env.COOPBANK_SOURCE_ACCOUNT = "01100000000000";
  process.env.COOPBANK_CALLBACK_URL = "https://api.example.test/payments/coopbank/callback";
  process.env.COOPBANK_USER_ID = "CRUZRIDEAUTO";
  delete process.env.COOPBANK_TOKEN_URL;
  delete process.env.COOPBANK_API_BASE_URL;
  resetCoopTokenCacheForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

function stub(api: { status: number; body: unknown }) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(api.body), { status: api.status }));
  vi.stubGlobal("fetch", fetchMock);
  return () => ({ url: fetchMock.mock.calls[1]![0] as string, body: JSON.parse(fetchMock.mock.calls[1]![1].body) });
}

const accepted = { status: 200, body: { MessageReference: "R1", MessageCode: "0", MessageDescription: "Accepted" } };
const adapter = new CoopBankDisbursementAdapter();

describe("CoopBankDisbursementAdapter.send", () => {
  it("sends Pesalink with the bank code, our user id and whole shillings", async () => {
    const sent = stub(accepted);
    const ack = await adapter.send({
      messageReference: "R1",
      channel: "pesalink",
      destination: "1234567890",
      bankCode: "68",
      amountShillings: 4500,
      narration: "CRAL payout PO-1 to merchant",
    });
    expect(ack.accepted).toBe(true);
    const { url, body } = sent();
    expect(url).toBe("https://openapi-sandbox.co-opbank.co.ke/FundsTransfer/External/A2A/PesaLink_v2/2.0.0");
    expect(body).toMatchObject({
      MessageReference: "R1",
      UserId: "CRUZRIDEAUTO",
      ISO2CountryCode: "KE",
      CallBackUrl: "https://api.example.test/payments/coopbank/callback",
      Source: { AccountNumber: "01100000000000", Amount: 4500, TransactionCurrency: "KES" },
      // The collection's leg amount is a string, the source's a number.
      Destinations: [
        { ReferenceNumber: "R1_1", AccountNumber: "1234567890", BankCode: "68", Amount: "4500", TransactionCurrency: "KES" },
      ],
    });
    expect(body.Source.Narration.length).toBeLessThanOrEqual(25);
  });

  it("uses the internal transfer for a Co-op account, with no bank code", async () => {
    const sent = stub(accepted);
    await adapter.send({ messageReference: "R1", channel: "internal", destination: "01100000000001", bankCode: null, amountShillings: 10, narration: "x" });
    const { url, body } = sent();
    expect(url).toContain("/FundsTransfer/Internal/A2A_v3/3.0.0");
    expect(body.UserId).toBe("CRUZRIDEAUTO");
    expect(body.Source.Amount).toBe(10);
    expect(body.Destinations[0]).toMatchObject({ AccountNumber: "01100000000001", Amount: 10 });
    expect(body.Destinations[0]).not.toHaveProperty("BankCode");
  });

  it("sends M-Pesa to the number without its plus, amounts as strings", async () => {
    const sent = stub(accepted);
    await adapter.send({ messageReference: "R1", channel: "mpesa", destination: "+254712345678", bankCode: null, amountShillings: 10, narration: "x" });
    const { url, body } = sent();
    expect(url).toContain("/FundsTransfer/External/A2M/Mpesa_v2/2.0.0");
    expect(body).toMatchObject({ ISO2CountryCode: "KE", Source: { Amount: "10" } });
    // The collection's M-Pesa request has no UserId.
    expect(body).not.toHaveProperty("UserId");
    expect(body.Destinations[0]).toMatchObject({ MobileNumber: "254712345678", Amount: "10" });
  });

  it("treats a 4xx with Co-op's envelope as a definite refusal", async () => {
    stub({ status: 409, body: { MessageReference: "R1", MessageCode: "-14", MessageDescription: "Duplicate reference" } });
    const ack = await adapter.send({ messageReference: "R1", channel: "mpesa", destination: "+254712345678", bankCode: null, amountShillings: 10, narration: "x" });
    expect(ack).toMatchObject({ accepted: false, description: "Duplicate reference" });
  });

  it("refuses a bank transfer without our Co-op user id", async () => {
    delete process.env.COOPBANK_USER_ID;
    await expect(
      adapter.send({ messageReference: "R1", channel: "internal", destination: "01100000000001", bankCode: null, amountShillings: 10, narration: "x" }),
    ).rejects.toThrow(/COOPBANK_USER_ID/);
  });

  it("refuses to send without a source account", async () => {
    delete process.env.COOPBANK_SOURCE_ACCOUNT;
    await expect(
      adapter.send({ messageReference: "R1", channel: "mpesa", destination: "+254712345678", bankCode: null, amountShillings: 10, narration: "x" }),
    ).rejects.toThrow(/COOPBANK_SOURCE_ACCOUNT/);
  });
});

describe("readFundsTransferResult", () => {
  const leg = (rc: string, extra: Record<string, unknown> = {}) => ({ ResponseCode: rc, ResponseDescription: rc === "0" ? "Success" : "Insufficient funds", ...extra });

  it("is a success only when every leg is", () => {
    expect(
      readFundsTransferResult({ MessageReference: "R1", MessageCode: "0", Source: leg("0"), Destinations: [leg("0", { TransactionID: "T1" })] }),
    ).toEqual({ reference: "R1", succeeded: true, transactionId: "T1", failureReason: null });
  });

  it("is a failure when any leg says so", () => {
    expect(readFundsTransferResult({ MessageReference: "R1", MessageCode: "1", Destinations: [leg("26")] })).toMatchObject({
      succeeded: false,
      failureReason: "Insufficient funds",
    });
  });

  it("decides nothing on a bare ack or without a reference", () => {
    expect(readFundsTransferResult({ MessageReference: "R1", MessageCode: "0" })).toBeNull();
    expect(readFundsTransferResult({ MessageCode: "0", Destinations: [leg("0")] })).toBeNull();
  });

  it("tells a transfer result from an STK result", () => {
    expect(isFundsTransferBody({ MessageReference: "R1", Destinations: [] })).toBe(true);
    expect(isFundsTransferBody({ MessageReference: "R1", TransactionID: "SJC" })).toBe(false);
  });
});
