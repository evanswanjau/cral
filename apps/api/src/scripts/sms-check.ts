import "../lib/load-env.js";
import { TextSmsAdapter } from "../adapters/sms/textsms-adapter.js";

/**
 * `npm run sms:check -w apps/api -- +2547XXXXXXXX` — sends one real test
 * SMS through TextSMS to the number you pass, to prove the credentials and
 * sender ID work. Unlike `smtp:check` there is no no-send verify step:
 * TextSMS has no auth-only endpoint, so a number is required.
 */
async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npm run sms:check -w apps/api -- +2547XXXXXXXX");
    process.exit(1);
  }

  const adapter = new TextSmsAdapter();
  const { providerId } = await adapter.send({
    to,
    body: "CRAL SMS test — TextSMS is wired up correctly.",
  });
  // eslint-disable-next-line no-console
  console.log(`Sent to ${to} — messageId ${providerId}`);
}

main().catch((error: unknown) => {
  console.error("SMS FAILED —", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
