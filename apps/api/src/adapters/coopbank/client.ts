/**
 * Co-op Connect (developer.co-opbank.co.ke) - the token and the one POST
 * shape every Co-op API shares, used by the STK payment adapter, the
 * Transaction Status lookup and the disbursement adapter. One copy, so a
 * gateway change (like the 2026-10 move of the token URL) is one edit.
 *
 * Every Co-op API is `POST <base>/<context>/<version>` with a JSON body
 * carrying our own `MessageReference` (<=27 chars) and a bearer token from
 * a WSO2 client-credentials grant. The public store
 * (`GET https://developer.co-opbank.co.ke/api/am/store/v1/apis/{id}/swagger`)
 * only lists the 1.0/2.0 versions; the paths CRAL is subscribed to are the
 * ones in Co-op's own Postman collection "CRUZ RIDE AUTO LIMITED"
 * (received 2026-11-04), collected in `COOP_PATHS` below.
 */

/**
 * Every Co-op API CRAL calls, exactly as Co-op's collection spells them -
 * trailing slashes included, since a WSO2 gateway routes on the literal
 * context. One table, so a version bump is one edit.
 */
export const COOP_PATHS = {
  stkPush: "/FT/stk/1.0.0",
  stkStatus: "/Enquiry/STK/1.0.0/",
  transactionStatus: "/Enquiry/TransactionStatus_V3/3.0.0/",
  pesalinkValidation: "/Enquiry/Validation/IPSL/1.0.0/",
  sendToMpesa: "/FundsTransfer/External/A2M/Mpesa_v2/2.0.0",
  pesalink: "/FundsTransfer/External/A2A/PesaLink_v2/2.0.0",
  internalTransfer: "/FundsTransfer/Internal/A2A_v3/3.0.0",
  accountBalance: "/Enquiry/AccountBalance_v2/2.0.0/",
  miniStatement: "/Enquiry/MiniStatement/Account_v2/2.0.0/",
  fullStatement: "/Enquiry/AccountFullStatementPaginated/1.0.0/",
} as const;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

export function requireCoopEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Co-op Bank calls`);
  return value;
}

/**
 * CRAL's Co-op Connect user (`CRUZRIDEAUTO`) - the `UserId` every
 * enquiry and the Pesalink/internal transfers carry alongside our token.
 */
export function coopUserId(): string {
  return requireCoopEnv("COOPBANK_USER_ID");
}

/** True when the consumer key/secret are set - what every Co-op call needs. */
export function coopBankConfigured(): boolean {
  return Boolean(process.env.COOPBANK_CONSUMER_KEY && process.env.COOPBANK_CONSUMER_SECRET);
}

function tokenUrl(): string {
  // `/oauth2/token`, not `/token`: since 2026-10 the bare `/token` path
  // 302s to the gateway's `/carbon/admin/login.jsp` instead of issuing.
  return process.env.COOPBANK_TOKEN_URL ?? "https://openapi-sandbox.co-opbank.co.ke/oauth2/token";
}

function apiBaseUrl(): string {
  return process.env.COOPBANK_API_BASE_URL ?? "https://openapi-sandbox.co-opbank.co.ke";
}

/** WSO2 client-credentials grant, cached until 30s before it expires. */
export async function getCoopAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const consumerKey = requireCoopEnv("COOPBANK_CONSUMER_KEY");
  const consumerSecret = requireCoopEnv("COOPBANK_CONSUMER_SECRET");
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    redirect: "manual",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Co-op Bank token request failed: ${res.status} ${res.statusText} — ${text}`);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Co-op Bank token response unparseable: ${text}`);
  }
  if (!json.access_token) {
    throw new Error(`Co-op Bank token response missing access_token: ${text}`);
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

export interface CoopResponse {
  /** HTTP status. Co-op uses it as part of the answer (207 = partial success, 404 = unknown reference). */
  status: number;
  /** Parsed JSON body - always an object when this returns. */
  body: Record<string, unknown>;
}

/**
 * POSTs to one Co-op API and returns its status and JSON body, whatever
 * the status. Throws only when there is no usable answer at all: a
 * redirect (the gateway sends anything it can't route to its admin login
 * page - every API call did this in sandbox on 2026-10-12), or a body
 * that isn't a JSON object. A thrown call is "we don't know", never a
 * decision; callers must not read it as a failure of the payment itself.
 */
export async function coopPost(path: string, payload: unknown): Promise<CoopResponse> {
  const accessToken = await getCoopAccessToken();
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `Co-op Bank ${path} redirected (${res.status} to ${res.headers.get("location") ?? "?"}) - the gateway did not route the call`,
    );
  }

  const text = await res.text().catch(() => "");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Co-op Bank ${path} answered ${res.status} with a non-JSON body: ${text.slice(0, 200)}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Co-op Bank ${path} answered ${res.status} with an unexpected body: ${text.slice(0, 200)}`);
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

/** Test seam - drops the cached token so a test's fetch stub sees the grant. */
export function resetCoopTokenCacheForTests(): void {
  cachedToken = null;
}
