import type { SmsAdapter, SendSmsInput } from "./types.js";

/**
 * TextSMS Kenya delivery, selected with `SMS_ADAPTER=textsms`.
 *
 * TextSMS (https://textsms.co.ke) is the provider CRAL uses. Like the
 * Resend email adapter, this is a single HTTPS POST — no SDK. Their bulk
 * endpoint wants the number in bare `2547XXXXXXXX` form (no `+`) and a
 * registered alphanumeric/short-code sender ID.
 *
 * Docs: https://textsms.co.ke/api-documentation/  (POST JSON to
 * /api/services/sendsms/). Their response wraps a single send in a
 * `responses` array; the per-message status key has historically shipped
 * both as `response-code` and the misspelt `respose-code`, so both are
 * checked. Anything other than 200/1000 there is treated as a failure.
 */
const ENDPOINT = "https://sms.textsms.co.ke/api/services/sendsms/";
const OK_CODES = new Set([200, 1000, "200", "1000"]);

interface TextSmsResponseRow {
  "response-code"?: number | string;
  "respose-code"?: number | string;
  "response-description"?: string;
  messageid?: number | string;
  mobile?: number | string;
}

export class TextSmsAdapter implements SmsAdapter {
  private readonly apiKey: string;
  private readonly partnerId: string;
  private readonly shortcode: string;

  constructor() {
    this.apiKey = requireEnv("TEXTSMS_API_KEY");
    this.partnerId = requireEnv("TEXTSMS_PARTNER_ID");
    this.shortcode = requireEnv("TEXTSMS_SHORTCODE");
  }

  async send(input: SendSmsInput): Promise<{ providerId: string }> {
    const mobile = toLocalDigits(input.to);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apikey: this.apiKey,
        partnerID: this.partnerId,
        shortcode: this.shortcode,
        mobile,
        message: input.body,
      }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`TextSMS send failed: ${res.status} ${res.statusText} — ${text}`);
    }

    let row: TextSmsResponseRow | undefined;
    try {
      const json = JSON.parse(text) as { responses?: TextSmsResponseRow[] };
      row = json.responses?.[0];
    } catch {
      throw new Error(`TextSMS send: unparseable response — ${text}`);
    }

    const code = row?.["response-code"] ?? row?.["respose-code"];
    if (!row || !OK_CODES.has(code as number | string)) {
      throw new Error(
        `TextSMS send rejected: ${code ?? "no code"} ${row?.["response-description"] ?? text}`,
      );
    }

    return { providerId: String(row.messageid ?? `textsms_${Date.now()}`) };
  }
}

/** `+254712345678` / `0712345678` / `254712345678` → `254712345678`. */
function toLocalDigits(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when SMS_ADAPTER=textsms`);
  }
  return value;
}
