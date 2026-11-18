# Shipping and deploying

Read before changing branches, the gate, the agents, the VPS scripts or
the Vercel project. Why it works this way:
[`docs/prompts/working-cheaply.md`](../prompts/working-cheaply.md).

## Environments

| Environment | URL(s) | Runs | Deploys |
|-------------|--------|------|---------|
| Production | `cral.co.ke`, `merchant.`, `admin.`, `api.cral.co.ke` | VPS `cral@46.202.128.68`, `/srv/cral`, `origin/main`, API on 4100 (`cral-api`) | `~/redeploy.sh`, started by the `release` agent when the owner says so |
| Dev API | `dev.api.cral.co.ke` | same VPS, `/srv/cral-dev`, `origin/develop`, port 4200 (`cral-api-dev`), database `cral_dev`, Redis db 1, sandbox Daraja | automatically, within ~2 minutes of a merge to `develop` |
| Customer demo | `app-cral.vercel.app` | Vercel, tracks `develop`, talks to the dev API | Vercel builds on every push to `develop` |

- One box, shared with other apps: nginx vhosts, the API as a native
  systemd unit, Postgres and Redis in the project's own Docker containers.
  Nothing here may touch the other apps.
- The dev API replaced a Railway deployment on 2026-09-24 (Railway ran out
  of credit). Railway is not used.
- `DEPLOY.md` predates the VPS and is flagged stale at its top; this file
  and the scripts on the box are the truth.

## Branches

- **Feature PRs branch off `develop` and merge into `develop`.** `develop`
  is the staging branch: it deploys the dev API and the Vercel demo.
- **`main` is production.** It only moves by a `develop -> main` release
  PR, which the `release` agent opens when the owner says "ship phase N".
- New env keys go into `/srv/cral/.env` (and `/srv/cral-dev/.env`) before
  the release that needs them.

## How a PR ships

1. The build session (Opus for design-heavy PRs and anything later PRs
   build on; Sonnet for mechanical PRs against a written spec, owner's
   call 2026-11-18; the build prompt names the model) finishes the code, the roadmap status and the
   matching decisions file, then hands off to the **`shipper` agent**
   (`.claude/agents/shipper.md`, Haiku) **in the background** with the
   branch name, commit message and PR summary. Build sessions never run
   `tsc`, `eslint`, the tests or the build themselves.
2. `shipper` stages the allowed paths, runs **`npm run gate`**, commits,
   pushes, opens the PR to `develop` and merges it. On failure it returns
   only the failing lines; the build session fixes them and hands off
   again.
3. The VPS deploys `develop` by itself (below). Nobody waits on it.
4. At the end of a phase the owner says "ship phase N" and the
   **`release` agent** (`.claude/agents/release.md`, Haiku) merges
   `develop -> main` and starts `~/redeploy.sh` detached. Asked for
   "status" later, it reads `~/deploy-prod.log`. The owner then checks the
   three production sites in a browser.

**No AI attribution** in commits or PRs (owner's call, 2026-09-22): no
`Co-Authored-By` trailer, no "Generated with Claude Code" line. This
overrides any default the harness supplies.

## The gate

CI (GitHub Actions) is billing-locked: a red check means zero steps ran,
not a failure. **The local gate is the only safety net.**

- `npm run gate` (`tools/gate.mjs`, plain Node) runs, stopping at the
  first failure: `npm run typecheck`, `npm run lint`,
  `npm run test -w apps/api`, `npm run build`. Output is captured. A pass
  prints one line per step and `gate passed`; a failure prints the step
  and only the useful lines (tsc `error TS`, eslint problems, vitest `FAIL`
  and assertion lines, at most 40), saves the full log to
  `.git/gate-last.log`, and exits 1.
- Before the tests it checks Postgres and Redis are reachable on the
  `.env` ports and prints the `docker compose -f infra/docker-compose.yml
  up -d` command if not. With no `node_modules/.bin` it says "run npm ci".
  A linked worktree has no `.env`; the gate prints the `cp` from the main
  checkout.
- `--skip-tests` / `--skip-build` are for quick local runs and record
  nothing.
- **Checked once per PR.** On a full pass the gate writes the **tree** it
  tested (the index, i.e. what the next commit contains) to
  `.git/gate-passed` - a tree, not a commit sha, so the commit that
  `shipper` makes after the gate still matches. It skips the record when
  tracked files have unstaged edits (then it didn't test what will be
  committed).
- `.githooks/pre-push` compares each pushed commit's tree with that record:
  a match prints `gate already passed on <sha>` and exits 0; otherwise it
  runs the gate and blocks the push on failure. A hand-made push is still
  checked. Don't bypass it with `--no-verify`.
- The root `"prepare"` script (`tools/install-hooks.mjs`) sets
  `core.hooksPath .githooks` on `npm install`/`npm ci`, and does nothing
  where there's no git checkout (Vercel).
- `.gitattributes` keeps `*.sh` and `.githooks/*` LF: a CRLF checkout on
  Windows would break them.

## Dev auto-deploy

`~/auto-deploy-dev.sh` on the VPS (tracked copy:
`infra/vps/auto-deploy-dev.sh`), run from the `cral` user's crontab every
2 minutes (`*/2 * * * *`). It takes a `flock`, fetches `origin/develop` in
`/srv/cral-dev`, and only when the sha differs from the last one attempted
(`~/.deploy-dev.last`) runs `~/redeploy-dev.sh`, appending to
`~/deploy-dev.log` and writing `<sha> ok|failed <UTC time>` to
`~/deploy-dev.status`.

- A sha is attempted once; a failed deploy isn't retried every tick. The
  next merge tries again, or run `~/redeploy-dev.sh` by hand.
- It never changes `~/redeploy-dev.sh` or `~/redeploy.sh`, and never
  touches production.
- Works unattended because the box's GitHub deploy key needs no agent and
  `sudo systemctl restart cral-api-dev` is passwordless for `cral`.
- Check it: `ssh cral@46.202.128.68 'cat ~/deploy-dev.status'`.
- `~/redeploy-dev.sh`: fetch, reset to `origin/develop`, `npm ci`, build
  the API, migrate `cral_dev`, restart `cral-api-dev`, health check.

## Production deploy

`~/redeploy.sh`: fetch, reset to `origin/main`, `npm ci`, build the API and
the three portals with their production `VITE_*` URLs, **back up the
database** (`~/cral-backup.sh`), migrate, restart `cral-api`, health
check. Every deploy migrates, so it backs up first, under `set -e`: a
failed backup stops the deploy before the schema changes. A nightly
backup also runs from cron (01:00 UTC).

## Vercel (customer demo)

- A real, git-triggered, source-based build: Root Directory
  `apps/customer`, **"Include files outside the Root Directory" on**
  (`sourceFilesOutsideRootDirectory: true`), Install
  `cd ../.. && npm ci`, Build `cd ../.. && npm run build -w apps/customer`,
  Output `dist`. All four set explicitly, not auto-detected: npm
  workspaces pull `@cral/types`/`@cral/ui` from the monorepo root.
- Branch Tracking (Project -> Settings -> Environments -> Production) is
  **`develop`**; it is set in the dashboard only (not reachable through
  the REST API or CLI).
- **If `app-cral.vercel.app` 404s**, check Branch Tracking is still
  `develop` and the four build settings are still explicit. An auto-linked
  `main` with auto-detected settings once promoted an empty build over the
  good one.
- `apps/customer/vercel.json` is one SPA rewrite (`/(.*) -> /index.html`).
  `apps/customer/deploy-vercel.sh` (prebuilt deploy) is a manual fallback
  only.
- The dev API's `CORS_ORIGINS` is `https://app-cral.vercel.app` only.
