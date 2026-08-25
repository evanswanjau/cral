import type { EmailAdapter } from "./types.js";
import { ConsoleEmailAdapter } from "./console-adapter.js";
import { SmtpEmailAdapter } from "./smtp-adapter.js";
import { ResendEmailAdapter } from "./resend-adapter.js";

export type { EmailAdapter, SendEmailInput } from "./types.js";
export { SmtpEmailAdapter } from "./smtp-adapter.js";
export { ResendEmailAdapter } from "./resend-adapter.js";

export function createEmailAdapter(): EmailAdapter {
  const kind = process.env.EMAIL_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsoleEmailAdapter();
    case "smtp":
      return new SmtpEmailAdapter();
    case "resend":
      return new ResendEmailAdapter();
    default:
      throw new Error(`Unknown EMAIL_ADAPTER "${kind}"`);
  }
}
