#!/usr/bin/env node
// npm run gate - the one local check before a push.
//
// CI is billing-locked, so this is the only thing standing between a branch
// and production. It runs, in order, stopping at the first failure:
//
//   links      node tools/check-links.mjs --strict
//   typecheck  npm run typecheck
//   lint       npm run lint
//   test       npm run test -w apps/api
//   build      npm run build
//
// Output is captured, not streamed. A pass prints one line per step; a
// failure prints the step and only the lines worth reading (capped at 40),
// with the full log saved next to the git dir for anyone who needs more.
//
// On a full pass it records what it tested in `.git/gate-passed` (inside a
// linked worktree, that worktree's own git dir). The pre-push hook compares
// the pushed commit's tree with that record and skips a second run - see
// .githooks/pre-push and docs/decisions/deploy.md.
//
// Flags (quick local runs only - a skipped step means nothing is recorded):
//   --skip-tests   skip the API tests
//   --skip-build   skip the build
//
// Plain Node, no dependencies, works from Git Bash and PowerShell.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const args = new Set(process.argv.slice(2));
const SKIP_TESTS = args.has("--skip-tests");
const SKIP_BUILD = args.has("--skip-build");
const MAX_LINES = 40;

// eslint-disable-next-line no-control-regex -- matching ANSI escapes is the point
const ANSI =/\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const strip = (s) => s.replace(ANSI, "");

function git(...a) {
  try {
    return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function gitPath(name) {
  const p = git("rev-parse", "--git-path", name);
  return p ? resolve(ROOT, p) : null;
}

function fail(lines, code = 1) {
  for (const l of lines) console.log(l);
  process.exit(code);
}

// ---------------------------------------------------------------- preflight

if (!existsSync(join(ROOT, "node_modules", ".bin"))) {
  fail(["FAIL  setup", "node_modules/.bin is missing - run npm ci"]);
}

function readDotEnv() {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return null;
  const out = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function hostPort(url, fallbackPort) {
  try {
    const u = new URL(url);
    return { host: u.hostname || "localhost", port: Number(u.port) || fallbackPort };
  } catch {
    return { host: "localhost", port: fallbackPort };
  }
}

function reachable({ host, port }) {
  return new Promise((done) => {
    const sock = connect({ host, port });
    const finish = (ok) => {
      sock.destroy();
      done(ok);
    };
    sock.setTimeout(2000, () => finish(false));
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}

async function testPreflight() {
  const env = readDotEnv();
  if (!env) {
    // A linked worktree has no .env of its own; the main checkout does.
    const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
    const mainEnv = common ? join(dirname(common), ".env") : null;
    const hint =
      mainEnv && existsSync(mainEnv) && resolve(mainEnv) !== join(ROOT, ".env")
        ? `copy it from the main checkout: cp "${mainEnv.replace(/\\/g, "/")}" .env`
        : "create it: cp .env.example .env (then fill in the secrets)";
    fail(["FAIL  setup", "no .env in this checkout - the API tests need it", hint]);
  }
  const pg = hostPort(env.DATABASE_URL ?? process.env.DATABASE_URL ?? "", 5432);
  const redis = hostPort(env.REDIS_URL ?? process.env.REDIS_URL ?? "redis://localhost:6380", 6380);
  const [pgOk, redisOk] = await Promise.all([reachable(pg), reachable(redis)]);
  if (!pgOk || !redisOk) {
    const down = [!pgOk && `Postgres (${pg.host}:${pg.port})`, !redisOk && `Redis (${redis.host}:${redis.port})`]
      .filter(Boolean)
      .join(" and ");
    fail([
      "FAIL  setup",
      `${down} not reachable - start them, then run the gate again:`,
      "docker compose -f infra/docker-compose.yml up -d",
    ]);
  }
}

// -------------------------------------------------------------------- steps

function run(cmd) {
  return new Promise((done) => {
    const child = spawn(cmd, {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => done({ code: code ?? 1, out: strip(out) }));
    child.on("error", (e) => done({ code: 1, out: String(e) }));
  });
}

// npm prints "> @cral/api@0.0.0 typecheck" before each workspace's script;
// tsc and eslint print paths relative to that workspace, so keep the name.
const WORKSPACE_HEADER = /^> (@?[\w./-]+)@[\w.-]+ \w+/;

function tscLines(out) {
  const lines = [];
  let ws = "";
  for (const l of out.split(/\r?\n/)) {
    const h = l.match(WORKSPACE_HEADER);
    if (h) ws = h[1];
    else if (/error TS\d+/.test(l)) lines.push(ws ? `${ws}: ${l.trim()}` : l.trim());
  }
  return lines;
}

function eslintLines(out) {
  const lines = [];
  for (const l of out.split(/\r?\n/)) {
    if (/^\S.*\.(m?[jt]sx?|cjs)$/.test(l.trim()) && !l.startsWith(" ")) lines.push(l.trim().replace(ROOT, "."));
    else if (/^\s+\d+:\d+\s+(error|warning)\s/.test(l)) lines.push(l.replace(/\s+/g, " ").trim());
    else if (/\d+ problems?|max-warnings|Oops! Something went wrong|ESLint couldn't/.test(l)) lines.push(l.trim());
  }
  return lines;
}

function vitestLines(out) {
  const lines = [];
  const seen = new Set();
  for (const l of out.split(/\r?\n/)) {
    const t = l.trim();
    if (!t) continue;
    const keep =
      /^(FAIL|×|✗)\s/.test(t) ||
      /\b(Assertion)?Error\b[:\s]/.test(t) ||
      /^[-+] (Expected|Received)/.test(t) ||
      /^(Expected|Received)[: ]/.test(t) ||
      /^❯ .+:\d+:\d+/.test(t) ||
      /^(Test Files|Tests)\s+\d/.test(t);
    if (!keep) continue;
    if (/^FAIL\s/.test(t)) {
      if (seen.has(t)) continue;
      seen.add(t);
    }
    lines.push(t);
  }
  return lines;
}

function buildLines(out) {
  const lines = [];
  let ws = "";
  for (const l of out.split(/\r?\n/)) {
    const h = l.match(WORKSPACE_HEADER);
    if (h) ws = h[1];
    else if (/error TS\d+|✘ \[ERROR\]|\[vite\].*error|^error\b|Error:|Could not resolve|failed to load/i.test(l))
      lines.push(ws ? `${ws}: ${l.trim()}` : l.trim());
  }
  return lines;
}

// check-links prints one summary line per app, then one line per finding.
function linkLines(out) {
  return out.split(/\r?\n/).filter((l) => l.trim() && !/^\w+: \d+ routes, \d+ links read, 0 to look at$/.test(l.trim()));
}

const STEPS = [
  { name: "links", cmd: "node tools/check-links.mjs --strict", pick: linkLines },
  { name: "typecheck", cmd: "npm run typecheck", pick: tscLines },
  { name: "lint", cmd: "npm run lint", pick: eslintLines },
  { name: "test", cmd: "npm run test -w apps/api", pick: vitestLines, before: testPreflight, skip: SKIP_TESTS },
  { name: "build", cmd: "npm run build", pick: buildLines, skip: SKIP_BUILD },
];

const pad = (s, n) => (s + " ".repeat(n)).slice(0, Math.max(n, s.length));

for (const step of STEPS) {
  if (step.skip) {
    console.log(`skip ${pad(step.name, 10)}`);
    continue;
  }
  if (step.before) await step.before();
  const t0 = Date.now();
  const { code, out } = await run(step.cmd);
  const secs = Math.round((Date.now() - t0) / 1000);
  if (code === 0) {
    console.log(`ok   ${pad(step.name, 10)} ${secs}s`);
    continue;
  }
  let picked = step.pick(out);
  if (picked.length === 0) picked = out.split(/\r?\n/).filter((l) => l.trim()).slice(-MAX_LINES);
  const shown = picked.slice(0, MAX_LINES);
  const logPath = gitPath("gate-last.log");
  if (logPath) writeFileSync(logPath, out);
  console.log(`FAIL ${pad(step.name, 10)} ${secs}s  (${step.cmd})`);
  for (const l of shown) console.log(`  ${l}`);
  if (picked.length > shown.length) console.log(`  ... ${picked.length - shown.length} more`);
  if (logPath) console.log(`full log: ${logPath.replace(/\\/g, "/")}`);
  process.exit(1);
}

// ------------------------------------------------------------------- record

if (SKIP_TESTS || SKIP_BUILD) {
  console.log("gate passed (partial run - not recorded for pre-push)");
  process.exit(0);
}

// Record the tree that was tested: the index, which is what the next commit
// will contain (and equals HEAD's tree when there is nothing staged). That
// only describes what ran if no tracked file has unstaged edits, so skip the
// record otherwise and let the pre-push hook run the gate again.
const recordPath = gitPath("gate-passed");
const unstaged = git("diff", "--name-only");
const tree = git("write-tree");
const head = git("rev-parse", "HEAD");
if (recordPath && tree && unstaged === "") {
  writeFileSync(recordPath, `${tree} ${head ?? ""}\n`);
  console.log(`gate passed (tree ${tree.slice(0, 10)})`);
} else {
  console.log("gate passed (unstaged edits to tracked files - not recorded for pre-push)");
}
