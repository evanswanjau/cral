# Working cheaply - Opus builds, Haiku ships

Written 2026-11-18, revised the same day after the owner's correction:
**Opus does all the real work** (reviews, design, every build PR). Only the
repetitive chores move to a cheaper model: running the checks, committing,
pushing, opening and merging PRs, and deploying.

## Where the tokens actually go

1. **`CLAUDE.md` loads into every session on every turn.** It is 1,999
   lines (about 17,000 words). Measured 2026-11-18:
   - about 30 entries were later **reversed or superseded but are still
     there** ("Supersedes the matching parts…", "reverses the earlier
     note…"), so a session reads both the old rule and the new one;
   - several statements are **now false**: "no admin portal" (4 times) and
     "nothing sets `approved_at`" (12 times), though the admin portal and
     account approval have existed since September; "There is no payment
     rail" (3 times), though Daraja and Co-op are live; Railway (8
     mentions), retired 2026-09-24; the dev-seed endpoints (6), deleted
     2026-09-23;
   - the same rule is restated in several places ("same footing as" 10
     times, the `id_verified` story 4 times, "not from a canvas" 6 times).

   So it is costly **and** it misleads. Phase 0 fixes it.
2. **Long sessions.** Every turn re-reads the conversation so far. One PR per
   fresh session keeps that small.
3. **Opus reading check output.** A full test run prints hundreds of lines.
   Today the build session runs the checks and reads all of it. Moving that
   to a cheap helper means Opus only ever sees "passed" or the few failing
   lines.

## Are the checks needed?

**Yes.** GitHub Actions is billing-locked, so CI runs nothing, and these
checks are the only safety net before production. On 2026-11-18 they caught
two lint errors and a broken `node_modules`. What changes is **who runs
them**, not whether they run.

Unlocking Actions billing would move the checks onto GitHub for free. Worth
doing when it's affordable; everything below still works without it.

## How the handoff works

Claude Code supports **project agents**: a file in `.claude/agents/` that
defines a helper with its own model and tools. An Opus session can call one
with a short instruction. The helper runs in its own context on the cheaper
model, and only its short report comes back. That is exactly "one session
sends a request to another session".

Phase 0 adds two:

| Agent | Model | Does | Never does |
|-------|-------|------|------------|
| `shipper` | Haiku | TypeScript, ESLint, API tests and build (`npm run gate`); stage the right files; commit with the message it's given; push; open a PR to `develop`; merge; report in 10 lines or fewer. Runs in the background. | Edit code, push to `main`, force-push, skip hooks, deploy |
| `release` | Haiku | Only when the owner asks: open and merge `develop` -> `main`, start `~/redeploy.sh` detached on the server (it backs up the database first and stops if that fails), return at once; on a later "status" call, read the log and report | Anything without the owner's go-ahead |

**Nobody waits on chores, and Opus never runs a check.** TypeScript,
ESLint and the API tests take about 3 minutes together; a deploy about 4.
None of that happens in the session you're talking to:

- **TypeScript, ESLint, tests and build run only inside `shipper`**, a
  separate agent on Haiku with its own context. The Opus session never runs
  `tsc`, `eslint`, `vitest` or `npm run build` itself, and never reads their
  output. It only gets back "passed" or the few failing lines.
- **`shipper` runs in the background.** Opus hands off, ends its turn, and
  you can keep talking to it, start the next session, or walk away. The
  result arrives as a notification.
- **The checks run once per PR.** `npm run gate` writes the commit it passed
  on to `.git/gate-passed`; the pre-push hook skips when the pushed commit
  matches, so `shipper`'s push doesn't run everything a second time. A push
  you make by hand is still checked.
- **Dev deploys happen on the server, by themselves.** A timer on the VPS
  checks `origin/develop` every 2 minutes and runs `~/redeploy-dev.sh` when
  it has moved, logging to `~/deploy-dev.log` and writing the result to
  `~/deploy-dev.status`. Merging into `develop` is the deploy. No session
  waits on it or spends tokens on it.
- **Production stays a deliberate step.** `release` starts `~/redeploy.sh`
  detached on the server (`nohup ... &`) and returns straight away; asked for
  "status" later, it reads the log. Nothing ships to production on a merge.

**A build session ends like this:**

1. Opus finishes the code and writes the commit message and PR summary.
2. Opus calls `shipper` with the branch name, the message and the summary.
3. Opus reports to the owner in 15 lines or fewer and ends its turn. The
   owner is free from here.
4. In the background, `shipper` runs TypeScript, ESLint, the API tests and
   the build.
   - If anything fails, `shipper` returns only the failing lines. The
     session picks them up, fixes them and hands off again.
   - If everything passes, `shipper` commits, pushes, opens and merges the
     PR, and returns the PR link. The server deploys dev within a few
     minutes.

Opus never runs a check, never reads a test log, never types git commands,
and nobody waits on a deploy.

**SSH from Claude sessions works** (re-tested 2026-11-18; the earlier
timeouts that week were temporary). If they come back, `release` prints the
command for you instead of retrying.

## Which model for which job

| Job | Model |
|-----|-------|
| Reviews, proposals, UI direction | Opus |
| Every build PR, including small ones | Opus |
| Docs and decision records written as part of a PR | Opus (same session) |
| TypeScript, ESLint, tests, build, commit, push, PR, merge | `shipper` (Haiku), in the background |
| Dev deploy | Nobody: the server's timer, on every merge to `develop` |
| Release to production | `release` (Haiku), only on your say-so |

## Session rules

1. **One PR, one fresh session,** started with the phase's start prompt from
   `docs/plans/verticals-roadmap.md`.
2. **Context lives in files, not chat.** Each PR updates the roadmap and its
   `docs/decisions/` entry, so the next session reads a page, not a history.
3. **Short reports.** 15 lines from Opus, 10 from `shipper`.
4. **If a session gets long, stop it.** Have it write what's left into the
   roadmap, then start fresh.

---

## The P0 session prompt

Paste into a fresh **Opus** session:

> Phase 0, PR P0 of `docs/plans/verticals-roadmap.md`. Goal: make every
> later session cheaper and stop the owner waiting on chores, without
> lowering quality. Branch off `origin/develop` as `feature/cheap-sessions`.
> Five parts, in order.
>
> **1. `npm run gate`.** Add `tools/gate.mjs` (plain Node, no new
> dependencies, works in Git Bash and PowerShell on Windows) and a root
> `"gate": "node tools/gate.mjs"` script. It runs, in order and stopping at
> the first failure: `npm run typecheck`, `npm run lint`,
> `npm run test -w apps/api`, `npm run build`. Capture output instead of
> streaming it. On success print one line per step (`ok  typecheck  14s`)
> and `gate passed`. On failure print the step name and only the useful
> lines - `error TS` lines for tsc, problem lines for eslint, `FAIL` and
> assertion lines for vitest, capped at 40 lines - and exit 1. Before the
> API tests, check Postgres and Redis are reachable on the `.env` ports; if
> not, print the `docker compose -f infra/docker-compose.yml up -d` command
> and exit 1, instead of letting 35 suites fail. If `node_modules/.bin` is
> missing, say "run npm ci" and exit 1 (this broke the gate on
> 2026-11-18). Flags `--skip-tests` and `--skip-build` are for quick local
> runs only. On a full pass, write the current `HEAD` sha to
> `.git/gate-passed`. Leave the untracked `scripts/` folder alone; it's the
> owner's.
>
> **2. A pre-push hook.** `.githooks/pre-push` (POSIX sh) runs
> `npm run gate` and blocks the push on failure, **unless** the commit being
> pushed matches `.git/gate-passed` (then it prints "gate already passed on
> <sha>" and exits 0), so a PR is checked once, not twice. A root
> `"prepare": "git config core.hooksPath .githooks"` turns it on with
> `npm install`.
>
> **3. The `shipper` and `release` agents.** Create
> `.claude/agents/shipper.md` and `.claude/agents/release.md` with
> frontmatter `name`, `description`, `tools: Bash, Read, Grep, Glob` and
> `model: haiku`, and instructions that do exactly what the table in
> `docs/prompts/working-cheaply.md` says.
> - `shipper` takes a branch name, a commit message and a PR summary. It
>   refuses to run on `develop` or `main`. It runs the gate; on failure it
>   returns `GATE FAILED` and the failing lines, and stops without
>   touching code. It stages only changes under `apps/`, `packages/`,
>   `openapi/`, `docs/`, `tools/`, `.githooks/`, `.claude/agents/`,
>   `CLAUDE.md` and root `package*.json`; never `scripts/`, `.env*` or
>   build output. It shows `git status --short` before committing and
>   commits with the message exactly as given, with **no AI attribution**
>   (the owner's rule overrides any default trailer). Then it pushes, runs
>   `gh pr create --base develop` and `gh pr merge --merge`. It does **not**
>   deploy; the server does (part 4). Report: 10 lines or fewer.
> - `release` only acts when its instruction says the owner asked to ship a
>   named phase. It opens and merges a PR `develop` -> `main` that lists
>   the phase's PRs, then starts `~/redeploy.sh` on the server with
>   `nohup ... > ~/deploy-prod.log 2>&1 &` and returns at once
>   (`~/redeploy.sh` backs up the database first and stops if that fails).
>   Called again with "status", it reads the end of `~/deploy-prod.log` and
>   reports OK or the failing step.
> - Add three lines to CLAUDE.md: build sessions hand off to `shipper` **in
>   the background** and never run `tsc`, `eslint`, the tests or the build
>   themselves.
>
> **4. Dev auto-deploy on the VPS.** Ask the owner before changing the
> server. Then over SSH (`cral@46.202.128.68`; a user crontab entry is
> enough, no root): add `~/auto-deploy-dev.sh`, which takes a lock
> (`flock`), fetches `origin/develop` in `/srv/cral-dev`, and only when the
> sha differs from the last deployed one runs `~/redeploy-dev.sh`, appends to
> `~/deploy-dev.log` and writes `<sha> ok|failed <time>` to
> `~/deploy-dev.status`. Run it every 2 minutes. Don't change
> `~/redeploy-dev.sh` or `~/redeploy.sh`. Prove it works: after this PR
> merges, show the status file move to the new sha. Record it in
> `docs/decisions/deploy.md`.
>
> **5. Rebuild CLAUDE.md** (1,999 lines; see the measurements in
> `docs/prompts/working-cheaply.md`). Read it once, fully. Then:
> - **Remove what's no longer true:** entries reversed or superseded by a
>   later entry (keep only the current rule), and statements contradicted
>   by the code (check the code, not the prose: is there an admin portal?
>   does anything set `approved_at`? is there a payment rail? does the
>   dev-seed route still exist?). Railway history goes, apart from one
>   line in the deploy file.
> - **Merge duplicates** so each rule is stated once.
> - **Move the current decisions** into topic files under
>   `docs/decisions/` (e.g. `conventions.md`, `adapters.md`, `design.md`,
>   `identity-auth.md`, `merchant-portal.md`, `bookings-payouts.md`,
>   `admin-ops.md`, `customer-portal.md`, `payments.md`, `deploy.md`,
>   `drivers.md`, `trucks.md`). Keep each rule's reasoning (the "why"),
>   since that's what stops a later session undoing it, but cut the
>   history of how it got there.
> - **CLAUDE.md keeps, in under 300 lines:** what CRAL is, the stack, the
>   non-negotiable conventions, how work ships (branches, `shipper` in the
>   background, dev auto-deploys on merge, `release` for production, no AI
>   attribution), what NOT to do, local dev, and an index
>   with one line per decisions file saying when to read it ("before
>   touching payouts, read `docs/decisions/bookings-payouts.md`"). Point
>   to `docs/plans/verticals-roadmap.md` as the queue.
> - **For the owner's review,** put in the PR description a list of every
>   statement you removed as untrue or superseded, each with one line of
>   evidence (the file or commit that shows it changed). Nothing else may
>   disappear: write a quick check that every current decision heading is
>   in some `docs/decisions/` file, and show its result.
>
> Finish by handing off to the new `shipper` (this also tests it), then
> mark P0 built in the roadmap and report in 15 lines or fewer: the
> gate's success output, the new CLAUDE.md line count, the decisions files,
> how many stale statements were removed, and the dev auto-deploy status
> line.
