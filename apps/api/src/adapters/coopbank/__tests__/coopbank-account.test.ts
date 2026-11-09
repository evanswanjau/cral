import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountBalance, fullStatement, miniStatement, validatePesalinkAccount } from "../account.js";
import { resetCoopTokenCacheForTests } from "../client.js";

/**
 * Account enquiries and Pesalink validation. Requests are Co-op's own
 * Postman collection's (received 2026-11-04), paths spelt exactly as it
 * spells them. fetch is stubbed - nothing here reaches Co-op.
 */

const saved = { ...process.env };

beforeEach(() => {
  process.env.COOPBANK_CONSUMER_KEY = "key";
  process.env.COOPBANK_CONSUMER_SECRET = "secret";
  process.env.COOPBANK_USER_ID = "CRUZRIDEAUTO";
  process.env.COOPBANK_SOURCE_ACCOUNT = "01100000000000";
  delete process.env.COOPBANK_TOKEN_URL;
  delete process.env.COOPBANK_API_BASE_URL;
  resetCoopTokenCacheForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

function stub(body: unknown = { MessageCode: "0" }) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => ({ url: fetchMock.mock.calls[1]![0] as string, body: JSON.parse(fetchMock.mock.calls[1]![1].body) });
}

const BASE = "https://openapi-sandbox.co-opbank.co.ke";

describe("account enquiries", () => {
  it("asks for our own account's balance, with a fresh reference under 27 chars", async () => {
    const sent = stub({ MessageCode: "0", AvailableBalance: "1000.00" });
    const res = await accountBalance();
    expect(res.body).toMatchObject({ AvailableBalance: "1000.00" });
    const { url, body } = sent();
    expect(url).toBe(`${BASE}/Enquiry/AccountBalance_v2/2.0.0/`);
    expect(body).toMatchObject({ UserId: "CRUZRIDEAUTO", AccountNumber: "01100000000000" });
    expect(body.MessageReference.length).toBeLessThanOrEqual(27);
  });

  it("gives each call its own reference", async () => {
    const first = stub();
    await miniStatement();
    const a = first().body.MessageReference;
    resetCoopTokenCacheForTests();
    const second = stub();
    await miniStatement();
    expect(second().body.MessageReference).not.toBe(a);
    expect(second().url).toBe(`${BASE}/Enquiry/MiniStatement/Account_v2/2.0.0/`);
  });

  it("asks for a full statement between two dates", async () => {
    const sent = stub();
    await fullStatement("2026-10-01", "2026-10-31");
    const { url, body } = sent();
    expect(url).toBe(`${BASE}/Enquiry/AccountFullStatementPaginated/1.0.0/`);
    expect(body).toMatchObject({
      UserId: "CRUZRIDEAUTO",
      ISO2CountryCode: "KE",
      AccountNumber: "01100000000000",
      StartDate: "2026-10-01",
      EndDate: "2026-10-31",
    });
  });

  it("refuses a date that isn't YYYY-MM-DD without calling Co-op", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fullStatement("1/10/2026", "2026-10-31")).rejects.toThrow(/YYYY-MM-DD/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("needs our source account", async () => {
    delete process.env.COOPBANK_SOURCE_ACCOUNT;
    await expect(accountBalance()).rejects.toThrow(/COOPBANK_SOURCE_ACCOUNT/);
  });
});

describe("validatePesalinkAccount", () => {
  it("pads the bank code to Pesalink's four-digit identifier", async () => {
    const sent = stub();
    await validatePesalinkAccount("1234567890", "68");
    const { url, body } = sent();
    expect(url).toBe(`${BASE}/Enquiry/Validation/IPSL/1.0.0/`);
    expect(body).toMatchObject({ UserId: "CRUZRIDEAUTO", AccountNumber: "1234567890", RecipientBankIdentifier: "0068" });
  });

  it("refuses a bank code that isn't 1-4 digits", async () => {
    await expect(validatePesalinkAccount("1234567890", "Equity")).rejects.toThrow(/1-4 digits/);
  });
});
