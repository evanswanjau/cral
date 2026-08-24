import { ulid } from "ulid";
import type { EmailAdapter, SendEmailInput } from "./types.js";

/**
 * Dev/test adapter: logs instead of sending.
 *
 * The body is logged, not just the subject — email now carries sign-up and
 * password-reset codes for email-first accounts, and without the body there
 * is no way to complete those flows against a local server.
 */
export class ConsoleEmailAdapter implements EmailAdapter {
  async send(input: SendEmailInput): Promise<{ providerId: string }> {
    const providerId = `console_email_${ulid()}`;
    const body = input.text ?? input.html;
    // eslint-disable-next-line no-console
    console.log(
      `[email:console] to=${input.to} subject="${input.subject}" providerId=${providerId}\n${body}`,
    );
    return { providerId };
  }
}
