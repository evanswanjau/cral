import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coopPost, resetCoopTokenCacheForTests } from "../client.js";
import { interpretStkStatus } from "../transaction-status.js";

/**
 * The shared Co-op client and the Transaction Status reader. Payload
 * shapes are the public swagger's (developer.co-opbank.co.ke, fetched
 * 2026-10-11); the 302 case is what the sandbox gateway actually did on
 * every API call on 2026-10-12.
 */

describe("coopPost", () => {
  const savedTokenUrl = process.env.COOPBANK_TOKEN_URL;
  const savedBaseUrl = process.env.COOPBANK_API_BASE_URL;
  beforeEach(() => {
    // A local .env may still carry the pre-2026-10 `/token` URL.
    delete process.env.COOPBANK_TOKEN_URL;
    delete process.env.COOPBANK_API_BASE_URL;
    process.env.COOPBANK_CONSUMER_KEY = "key";
    process.env.COOPBANK_CONSUMER_SECRET = "secret";
    resetCoopTokenCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.COOPBANK_CONSUMER_KEY;
    delete process.env.COOPBANK_CONSUMER_SECRET;
    if (savedTokenUrl !== undefined) process.env.COOPBANK_TOKEN_URL = savedTokenUrl;
    if (savedBaseUrl !== undefined) process.env.COOPBANK_API_BASE_URL = savedBaseUrl;
  });

  function stubFetch(api: Response) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(api);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("asks for the token at /oauth2/token and sends it as a bearer", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ MessageCode: "0" }), { status: 200 }));
    const res = await coopPost("/Enquiry/TransactionStatus/2.0.0", { MessageReference: "R1" });
    expect(res).toEqual({ status: 200, body: { MessageCode: "0" } });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://openapi-sandbox.co-opbank.co.ke/oauth2/token");
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe("Bearer tok");
  });

  it("returns a 404 answer rather than throwing - it's still an answer", async () => {
    stubFetch(new Response(JSON.stringify({ MessageCode: "-1" }), { status: 404 }));
    const res = await coopPost("/x", {});
    expect(res.status).toBe(404);
  });

  it("throws when the gateway redirects to its login page", async () => {
    stubFetch(
      new Response(null, { status: 302, headers: { location: "https://openapi-sandbox.co-opbank.co.ke/carbon/admin/login.jsp" } }),
    );
    await expect(coopPost("/x", {})).rejects.toThrow(/redirected \(302/);
  });

  it("throws on a body that isn't JSON", async () => {
    stubFetch(new Response("<html>Access Denied</html>", { status: 403 }));
    await expect(coopPost("/x", {})).rejects.toThrow(/non-JSON/);
  });
});

describe("interpretStkStatus", () => {
  const ok = (body: Record<string, unknown>, status = 200) => ({ status, body });

  it("settles a full success that carries a receipt and amount", () => {
    const parsed = interpretStkStatus(
      "R1",
      ok({
        MessageReference: "R1",
        MessageCode: "0",
        MessageDescription: "FULL SUCCESS",
        Source: { AccountNumber: "36001873000", Amount: 750, ResponseCode: "0" },
        Destinations: [{ ReferenceNumber: "R1_1", Amount: 750, TransactionID: "SJC1TEST01", ResponseCode: "0" }],
      }),
    );
    expect(parsed).toEqual({
      reference: "R1",
      succeeded: true,
      receipt: "SJC1TEST01",
      failureReason: null,
      amountShillings: 750,
    });
  });

  it("accepts a top-level TransactionID, the shape the STK callback uses", () => {
    const parsed = interpretStkStatus("R1", ok({ MessageCode: "0", TransactionID: "SJC1TEST02", TransactionAmount: "750" }));
    expect(parsed?.succeeded).toBe(true);
    expect(parsed?.receipt).toBe("SJC1TEST02");
    expect(parsed?.amountShillings).toBe(750);
  });

  it("does not call it a success without a receipt", () => {
    expect(interpretStkStatus("R1", ok({ MessageCode: "0", MessageDescription: "FULL SUCCESS" }))).toBeNull();
  });

  it("records a failure only when a leg says so", () => {
    const parsed = interpretStkStatus(
      "R1",
      ok({
        MessageCode: "0",
        Destinations: [{ ResponseCode: "1032", ResponseDescription: "Request cancelled by user" }],
      }),
    );
    expect(parsed).toMatchObject({ succeeded: false, failureReason: "Request cancelled by user" });
  });

  it("leaves 404, partial success and unknown codes undecided", () => {
    expect(interpretStkStatus("R1", ok({ MessageCode: "-1" }, 404))).toBeNull();
    expect(interpretStkStatus("R1", ok({ MessageCode: "1", MessageDescription: "PARTIAL SUCCESS" }, 207))).toBeNull();
    expect(interpretStkStatus("R1", ok({ MessageCode: "9", MessageDescription: "Processing" }))).toBeNull();
  });
});
