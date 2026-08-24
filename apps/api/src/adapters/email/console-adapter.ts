import { ulid } from "ulid";
import type { EmailAdapter, SendEmailInput } from "./types.js";

/** Dev/test adapter: logs instead of sending. */
export class ConsoleEmailAdapter implements EmailAdapter {
  async send(input: SendEmailInput): Promise<{ providerId: string }> {
    const providerId = `console_email_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(`[email:console] to=${input.to} subject="${input.subject}" providerId=${providerId}`);
    return { providerId };
  }
}
