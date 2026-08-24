import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/lib/load-env.ts"],
    // Argon2id hashing is deliberately slow; sequential auth-flow tests
    // that hash/verify a password several times need real headroom.
    testTimeout: 30000,
  },
});
