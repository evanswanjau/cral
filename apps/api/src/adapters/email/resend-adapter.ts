import type { EmailAdapter, SendEmailInput } from "./types.js";

/**
 * Resend delivery, selected with `EMAIL_ADAPTER=resend`.
 *
 * Chosen over `SmtpEmailAdapter` specifically because raw SMTP to
 * `mail.cral.co.ke` turned out to be unreachable from Railway — two
 * external test tools got a full, healthy SMTP conversation from the same
 * host on both port 587 and 465, but Railway's own egress never completed
 * even a TCP handshake (`ETIMEDOUT` at the `CONN` stage every time). That
 * pointed at Railway's specific outbound IP being blocked or filtered by
 * the mail server's firewall, not a config problem on our side. Resend
 * sends over a plain HTTPS POST instead of a raw SMTP socket, so a mail
 * server's IP-based firewall never enters the picture.
 *
 * No SDK dependency — the API is one POST, and pulling in a client library
 * for that isn't worth it. Docs: https://resend.com/docs/api-reference/emails/send-email
 *
 * Requires the sending domain (`cral.co.ke`) to be verified in Resend's
 * dashboard first (they issue a handful of DNS TXT/MX records to add) —
 * sends will fail with a 403 from Resend until that's done.
 */
export class ResendEmailAdapter implements EmailAdapter {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    this.apiKey = requireEnv("RESEND_API_KEY");
    this.from = requireEnv("EMAIL_FROM");
  }

  async send(input: SendEmailInput): Promise<{ providerId: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend send failed: ${res.status} ${res.statusText} — ${body}`);
    }

    const json = (await res.json()) as { id: string };
    return { providerId: json.id };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`EMAIL_ADAPTER=resend requires ${name} to be set.`);
  }
  return value;
}
