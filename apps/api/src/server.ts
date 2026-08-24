import "./lib/load-env.js";
import { createApp } from "./app.js";
import { emailAdapter } from "./lib/adapters.js";
import { SmtpEmailAdapter } from "./adapters/email/index.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
});

// Prove the mail path at boot rather than the first time someone registers
// and their verification code silently never arrives. A warning, not a
// fatal: the rest of the API is still worth serving if mail is down.
if (emailAdapter instanceof SmtpEmailAdapter) {
  void emailAdapter.verify().then(
    () => {
      // eslint-disable-next-line no-console
      console.log(`[api] smtp ready — ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    },
    (error: unknown) => {
      console.warn(`[api] smtp NOT ready — ${(error as Error).message}`);
    },
  );
}
