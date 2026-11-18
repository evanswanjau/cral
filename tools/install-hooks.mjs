// `npm install` / `npm ci` run this through the root "prepare" script. It
// points git at the tracked .githooks/ folder so the pre-push gate is on in
// every checkout. It must never fail an install: Vercel and other builders
// may run npm ci without a .git directory or without git at all.

import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // Not a git checkout (or no git): nothing to install.
}
