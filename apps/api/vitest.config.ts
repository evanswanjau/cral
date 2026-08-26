import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Force the console adapters no matter what .env says. Without this,
    // wiring real SMTP means every test run tries to deliver verification
    // codes to @example.test addresses — slow, noisy, and a good way to get
    // the mailbox rate-limited. dotenv won't overwrite these, since
    // `config()` leaves existing process.env values alone.
    env: {
      NODE_ENV: "test",
      EMAIL_ADAPTER: "console",
      SMS_ADAPTER: "console",
      // .env has a second, later STORAGE_ADAPTER=b2 line for future use
      // (no such adapter is implemented yet — see adapters/storage/index.ts),
      // which dotenv's last-key-wins parsing picks up. Pin to "local" here
      // the same way EMAIL_ADAPTER/SMS_ADAPTER are pinned above, so the
      // document-upload tests always exercise the real local adapter.
      STORAGE_ADAPTER: "local",
    },
    setupFiles: ["./src/lib/load-env.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    // Argon2id hashing is deliberately slow; sequential auth-flow tests
    // that hash/verify a password several times need real headroom.
    testTimeout: 30000,
  },
});
