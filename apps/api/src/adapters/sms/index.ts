import type { SmsAdapter } from "./types.js";
import { ConsoleSmsAdapter } from "./console-adapter.js";
import { TextSmsAdapter } from "./textsms-adapter.js";

export type { SmsAdapter, SendSmsInput } from "./types.js";
export { TextSmsAdapter } from "./textsms-adapter.js";

/**
 * Provider is chosen by SMS_ADAPTER. `textsms` is the real provider
 * (textsms.co.ke); `console` logs instead of sending and is the default
 * for local dev and the test run (pinned in vitest.config.ts).
 */
export function createSmsAdapter(): SmsAdapter {
  const kind = process.env.SMS_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsoleSmsAdapter();
    case "textsms":
      return new TextSmsAdapter();
    default:
      throw new Error(`Unknown SMS_ADAPTER "${kind}"`);
  }
}
