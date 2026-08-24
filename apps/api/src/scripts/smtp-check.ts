import "../lib/load-env.js";
import { SmtpEmailAdapter } from "../adapters/email/smtp-adapter.js";

/**
 * `npm run smtp:check -w apps/api` — proves the SMTP credentials and the
 * STARTTLS upgrade work. Authenticates and disconnects; sends nothing.
 * Pass an address to also send one real test message to it.
 */
async function main(): Promise<void> {
  const adapter = new SmtpEmailAdapter();
  await adapter.verify();
  // eslint-disable-next-line no-console
  console.log(`SMTP OK — authenticated to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);

  const to = process.argv[2];
  if (to) {
    const { providerId } = await adapter.send({
      to,
      subject: "CRAL SMTP test",
      html: "<p>SMTP is wired up correctly.</p>",
      text: "SMTP is wired up correctly.",
    });
    // eslint-disable-next-line no-console
    console.log(`Sent to ${to} — messageId ${providerId}`);
  }
}

main().catch((error: unknown) => {
  const e = error as { code?: string; command?: string; message?: string };
  console.error(`SMTP FAILED — code=${e.code ?? "?"} command=${e.command ?? "?"}`);
  console.error(e.message ?? String(error));
  process.exit(1);
});
