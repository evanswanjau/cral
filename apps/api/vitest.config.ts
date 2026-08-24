import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Force the console adapters no matter what .env says. Without this,
    // wiring real SMTP means every test run tries to deliver verification
    // codes to @example.test addresses — slow, noisy, and a good way to get
    // the mailbox rate-limited. dotenv won't overwrite these, since
    // `config()` leaves existing process.env values alone.
    env: {
      EMAIL_ADAPTER: "console",
      SMS_ADAPTER: "console",
    },
    setupFiles: ["./src/lib/load-env.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    // Argon2id hashing is deliberately slow; sequential auth-flow tests
    // that hash/verify a password several times need real headroom.
    testTimeout: 30000,
  },
});
