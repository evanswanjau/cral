import type { SmsAdapter } from "./types.js";
import { ConsoleSmsAdapter } from "./console-adapter.js";

export type { SmsAdapter, SendSmsInput } from "./types.js";

/**
 * Provider is chosen by SMS_ADAPTER so a real provider (e.g. Africa's
 * Talking) can be dropped in later behind this same interface without
 * touching any call site.
 */
export function createSmsAdapter(): SmsAdapter {
  const kind = process.env.SMS_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsoleSmsAdapter();
    default:
      throw new Error(`Unknown SMS_ADAPTER "${kind}"`);
  }
}
