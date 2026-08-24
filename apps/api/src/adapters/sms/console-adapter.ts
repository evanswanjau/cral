import { ulid } from "ulid";
import type { SmsAdapter, SendSmsInput } from "./types.js";

/** Dev/test adapter: logs instead of sending. No SMS ever leaves the building. */
export class ConsoleSmsAdapter implements SmsAdapter {
  async send(input: SendSmsInput): Promise<{ providerId: string }> {
    const providerId = `console_sms_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(`[sms:console] to=${input.to} providerId=${providerId}\n${input.body}`);
    return { providerId };
  }
}
