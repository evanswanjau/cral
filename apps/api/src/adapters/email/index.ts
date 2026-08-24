import type { EmailAdapter } from "./types.js";
import { ConsoleEmailAdapter } from "./console-adapter.js";

export type { EmailAdapter, SendEmailInput } from "./types.js";

export function createEmailAdapter(): EmailAdapter {
  const kind = process.env.EMAIL_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsoleEmailAdapter();
    default:
      throw new Error(`Unknown EMAIL_ADAPTER "${kind}"`);
  }
}
