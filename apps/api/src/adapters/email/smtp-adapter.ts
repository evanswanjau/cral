import { createTransport, type Transporter } from "nodemailer";
import type { EmailAdapter, SendEmailInput } from "./types.js";

/**
 * Real SMTP delivery, selected with `EMAIL_ADAPTER=smtp`.
 *
 * Email is not a nice-to-have in this product: it carries the sign-up
 * verification code, the password-reset link, and the 2FA enable/disable
 * notices. Everything else the platform sends goes by email too — SMS is
 * reserved for opt-in 2FA challenges.
 *
 * Port 587 is STARTTLS, not implicit TLS, so `secure` is false and
 * `requireTLS` forces the upgrade — connecting with `secure: true` on 587
 * hangs until it times out. Set `SMTP_SECURE=true` only for port 465.
 */
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const host = requireEnv("SMTP_HOST");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = process.env.SMTP_SECURE === "true";

    this.from = process.env.SMTP_FROM ?? requireEnv("SMTP_USER");
    this.transporter = createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: {
        user: requireEnv("SMTP_USER"),
        pass: requireEnv("SMTP_PASSWORD"),
      },
      // Nodemailer's own default is ~2 minutes per stage, which turns an
      // unreachable mail server (wrong firewall rule, host down) into a
      // 2-minute hang on every send — long enough to look like the whole
      // request died, not just the email. Fail in single-digit seconds
      // instead; a real SMTP server answers well within that.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  /**
   * Proves the credentials and TLS upgrade work without sending anything.
   * Called at boot so a misconfigured mail server is a loud startup problem
   * rather than a silent failure the first time someone registers.
   */
  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(input: SendEmailInput): Promise<{ providerId: string }> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { providerId: info.messageId };
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`EMAIL_ADAPTER=smtp requires ${name} to be set.`);
  }
  return value;
}
