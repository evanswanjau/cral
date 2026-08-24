// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // apps/api runs under Node.
    files: ["apps/api/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Frontend apps + the UI package's preview run in the browser.
    files: ["apps/{customer,merchant,admin}/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, JSX: "readonly" },
    },
  },
  {
    // Config files (vite.config.ts, etc.) run under Node at build time.
    files: ["**/vite.config.ts", "**/*.config.ts", "**/*.config.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // CLI scripts print by design.
    files: ["apps/api/src/db/migrate.ts"],
    rules: { "no-console": "off" },
  },
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/.local-storage/**",
    ],
  },
  prettier,
];
