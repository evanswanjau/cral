// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
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
    plugins: {
      // Registered so the `react-hooks/exhaustive-deps` disable comments
      // already in the code resolve to a real rule. Without the plugin,
      // ESLint errors on the *comment* ("Definition for rule ... was not
      // found") — three of those were failing the lint run, which is what
      // prompted wiring this up rather than deleting the comments: each one
      // marks an effect whose deps are deliberately narrow.
      //
      // `--max-warnings=0` in the lint script means "warn" here is as fatal
      // as "error", so both rules are set explicitly rather than inherited
      // from the plugin's recommended config.
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
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
