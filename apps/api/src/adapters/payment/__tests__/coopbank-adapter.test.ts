import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCoopTokenCacheForTests } from "../../coopbank/client.js";
import { CoopBankPaymentAdapter, parseCoopBankStkCallback } from "../coopbank-adapter.js";

/**
 * Co-op's STK push. The request is Co-op's own Postman collection's
 * (`POST /FT/stk/1.0.0`, received 2026-11-04); fetch is stubbed.
 */

const saved = { ...process.env };

beforeEach(() => {
  process.env.COOPBANK_CONSUMER_KEY = "key";
  process.env.COOPBANK_CONSUMER_SECRET = "secret";
  process.env.COOPBANK_CALLBACK_URL = "https://api.example.test/payments/coopbank/callback";
  process.env.COOPBANK_OPERATOR_CODE = "CRUZ-RIDE";
  process.env.COOPBANK_STK_PATH_CONFIRMED = "true";
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

const adapter = new CoopBankPaymentAdapter();
const input = { messageReference: "R1", phone: "+254712345678", amountCents: 750_00, narration: "CRAL CB-261104-001" };

describe("CoopBankPaymentAdapter.initiateStkPush", () => {
  it("sends the collection's body: operator code, number amount, no plus on the phone", async () => {
    const sent = stub({ status: 200, body: { MessageReference: "R1", MessageCode: "0", MessageDescription: "Accepted", TelcoRef: "T1" } });
    const result = await adapter.initiateStkPush(input);
    expect(result).toEqual({ providerRef: "T1", responseDescription: "Accepted" });
    const { url, body } = sent();
    expect(url).toBe("https://openapi-sandbox.co-opbank.co.ke/FT/stk/1.0.0");
    expect(body).toMatchObject({
      MessageReference: "R1",
      CallBackUrl: "https://api.example.test/payments/coopbank/callback",
      OperatorCode: "CRUZ-RIDE",
      TransactionCurrency: "KES",
      MobileNumber: "254712345678",
      Narration: "CRAL CB-261104-001",
      Amount: 750,
    });
    expect(new Date(body.MessageDateTime).toISOString()).toBe(body.MessageDateTime);
    expect(body.OtherDetails).toEqual([{ Name: "MessageReference", Value: "R1" }]);
  });

  it("throws on a refusal so the row is marked failed", async () => {
    stub({ status: 400, body: { MessageReference: "R1", MessageCode: "-1", MessageDescription: "Invalid OperatorCode" } });
    await expect(adapter.initiateStkPush(input)).rejects.toThrow(/Invalid OperatorCode/);
  });

  it("needs the operator code", async () => {
    delete process.env.COOPBANK_OPERATOR_CODE;
    await expect(adapter.initiateStkPush(input)).rejects.toThrow(/COOPBANK_OPERATOR_CODE/);
  });

  it("stays switched off until the path is confirmed", async () => {
    process.env.COOPBANK_STK_PATH_CONFIRMED = "false";
    await expect(adapter.initiateStkPush(input)).rejects.toMatchObject({ code: "coopbank_endpoint_unconfirmed" });
  });
});

describe("parseCoopBankStkCallback", () => {
  it("reads the amount from TransactionAmount or Amount", () => {
    const base = { MessageReference: "R1", MessageCode: "0", TransactionID: "SJC1" };
    expect(parseCoopBankStkCallback({ ...base, TransactionAmount: "750" })?.amountShillings).toBe(750);
    expect(parseCoopBankStkCallback({ ...base, Amount: 750 })?.amountShillings).toBe(750);
  });
});
