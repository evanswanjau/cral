# Working cheaply - models, sessions and checks

Written 2026-11-18 after a long session ran out of credits. This is the
playbook for every build session from Phase 0 on.

## Where the tokens actually go

In order of cost, from what this project does today:

1. **`CLAUDE.md` is ~2,000 lines and loads into every session, on every
   turn.** Every question, every tool call, every model re-reads it. Most of
   it is decision history that only matters when touching that one area.
   This is the largest fixed cost, and Phase 0 fixes it.
2. **Long sessions.** Each turn re-reads the whole conversation so far. One
   session that does a phase, a revert and a planning discussion pays for
   all of it on every later turn. A fresh session per PR starts near zero.
3. **The most capable model doing routine work.** Opus is worth it for
   design, money and security logic. Mechanical PRs that follow a written
   plan cost several times more on Opus than on Sonnet for the same result.
4. **Check output dumped into the conversation.** `npm run test` prints
   hundreds of lines; a model reading them, or re-running checks after every
   small edit, pays for every line.

## Are the checks needed?

**Yes, keep them.** GitHub Actions is billing-locked, so CI runs nothing,
and these checks are the only thing standing between a mistake and
production. In this session alone they caught two lint errors in new tests
and a broken `node_modules` that would have shipped unnoticed.

**But they shouldn't cost model tokens.** The fix is how they run:

- **One quiet command, `npm run gate`** (Phase 0 builds it): typecheck,
  lint, API tests and build, printing one line per step on success and only
  the failing lines on failure.
- **Run once, at the end of a PR**, never after every edit.
- **A git pre-push hook runs the gate automatically**, so a push can't skip
  it, and you can run it yourself in a terminal at no token cost.
- **Best of all, unlock GitHub Actions billing.** Then CI runs the gate on
  every PR for free and sessions only fix what it reports.

**A separate "checks" session is not worth it.** To fix a failure it has to
reload the context the build session already had. Let the build session run
the quiet gate once and fix its own failures.

## Which model for which job

| Job | Model | Why |
|-----|-------|-----|
| Reviews, proposals, UI direction (Phase 2A) | Opus | Judgement across many files; mistakes here are expensive later |
| Money and security logic (T3, GS2, GS3, AG3) | Opus | State machines, idempotency, scoped tokens |
| New public page shells (2B shell, CS3) | Opus | Sets the pattern others copy |
| Building a PR from a written plan or prompt | Sonnet | The thinking is already done |
| Docs, contract updates, copy edits | Sonnet | |
| Merging PRs, git cleanup, release PRs, deploy checklists | Haiku | Pure chores |

Set **effort** to match: high for Opus design work, default for Sonnet
builds, low for Haiku chores.

## Session rules

1. **One PR, one fresh session.** Start it with the phase's start prompt
   from `docs/plans/verticals-roadmap.md`. Don't carry a chat from one PR
   into the next.
2. **Context lives in files, not chat.** Each PR updates the roadmap status
   and its decisions entry, so the next session reads a page, not a history.
3. **Ask for short reports.** "Report in 15 lines or fewer" is in every start
   prompt. Long recaps are paid twice: once to write, once to re-read.
4. **Don't ask a build session to explain or plan.** Planning happens once,
   in an Opus session that writes a doc. Build sessions execute.
5. **If a session gets long, stop it.** Have it write what's left into the
   roadmap or a short `docs/handoff.md`, then start fresh.
6. **Deploys stay with you.** SSH to the VPS times out from build sessions,
   so `~/redeploy-dev.sh` and `~/redeploy.sh` are yours to run.

---

## The P0 session prompt

Paste into a fresh **Sonnet** session:

> Phase 0, PR P0 of `docs/plans/verticals-roadmap.md`. Goal: make every
> later session cheaper. Branch off `origin/develop` as
> `feature/cheap-sessions`. Three parts, in this order.
>
> **1. `npm run gate`.** Add `tools/gate.mjs` (plain Node, no new
> dependencies, must work in Git Bash and PowerShell on Windows) and a root
> `"gate": "node tools/gate.mjs"` script. It runs, in order and stopping at
> the first failure: `npm run typecheck`, `npm run lint`,
> `npm run test -w apps/api`, `npm run build`. Capture each step's output
> instead of streaming it. On success print one line per step
> (`ok  typecheck  14s`) and a final `gate passed`. On failure print the
> step name, then only the useful part of its output - for tsc the
> `error TS` lines, for eslint the problem lines, for vitest the `FAIL`
> and assertion lines (cap at 60 lines) - and exit 1. Before the API tests,
> check Postgres and Redis are reachable on the `.env` ports; if not, say
> `start docker: docker compose -f infra/docker-compose.yml up -d` and exit
> 1 instead of letting 35 suites fail. Flags: `--skip-tests` and
> `--skip-build` for quick local runs; the hook never uses them. Don't use
> the untracked `scripts/` folder; it belongs to the owner.
>
> **2. A pre-push hook.** Add `.githooks/pre-push` (POSIX sh) that runs
> `npm run gate` and blocks the push on failure, and a root `"prepare":
> "git config core.hooksPath .githooks"` script so `npm install` turns it
> on. `git push --no-verify` stays as the escape hatch. Document both in
> the CLAUDE.md "How work ships" section in three lines.
>
> **3. Slim CLAUDE.md.** It's ~2,000 lines and loads into every session.
> Move, **verbatim and in full**, every "Recorded product decisions" entry
> and every long section into topic files under `docs/decisions/`: for
> example `conventions.md`, `adapters.md`, `design.md`, `identity-auth.md`,
> `merchant-portal.md`, `bookings-payouts.md`, `admin-ops.md`,
> `customer-portal.md`, `payments.md`, `deploy.md`, `drivers.md`,
> `trucks.md`. Don't rewrite or summarise the moved text. CLAUDE.md
> keeps, in under 300 lines: what CRAL is (5 lines), stack, the
> non-negotiable conventions, how work ships (branches, gate, deploy, no AI
> attribution), what NOT to do, local dev, and an **index**: one line per
> decisions file saying when to read it ("before touching payouts, read
> `docs/decisions/bookings-payouts.md`"). Point it at
> `docs/plans/verticals-roadmap.md` as the queue. Verify nothing was lost:
> every `**bold heading**` and `##` heading from the old CLAUDE.md appears
> in exactly one new file (write a quick check and show its result), and
> the total line count of the new files plus the new CLAUDE.md is at least
> the old line count minus 50.
>
> Then run `npm run gate` once (it's new, so this also tests it), commit
> with no AI attribution, push (the hook runs), open a PR to `develop`,
> merge it, mark P0 built in the roadmap, and report in 15 lines or fewer:
> gate output on success, the new CLAUDE.md line count, and the list of
> decisions files.
