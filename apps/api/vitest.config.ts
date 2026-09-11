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
      // Same reasoning — a test run must never fire a real STK push.
      PAYMENT_ADAPTER: "console",
      // The admin (Ops) audience signs with its own key. Pin a real one for
      // the test run so admin-auth tests don't depend on a local .env
      // carrying JWT_ADMIN_SECRET.
      JWT_ADMIN_SECRET: "test_only_admin_secret_at_least_32_chars_xx",
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
    // Cap the worker pool. Every worker opens its own Knex pool (max 10),
    // and Postgres tops out at 100 connections — one worker per CPU core
    // (Vitest's default) plus the growing file count started tipping heavy
    // suites into sporadic connection/timeout failures under load. Four
    // forks keeps total connections well under the cap and the run stable;
    // the suite is I/O-bound on Postgres, not CPU-bound, so this is barely
    // slower.
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
  },
});
