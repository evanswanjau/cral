# Cruz Ride Auto (CRAL)

CRAL is one place for everything a vehicle needs in Kenya: hire a car, a
truck or a driver, call a tow, and (coming) get a car fixed, buy a part,
buy or sell a car. Every supplier is a merchant checked by CRAL, every
price is agreed before work starts, and money moves through CRAL by
M-Pesa. Three portals - customer, merchant, admin (Ops) - over one HTTP
API. Solo-built.

## Where to start

- **The queue is [`docs/plans/verticals-roadmap.md`](./docs/plans/verticals-roadmap.md).**
  A build session reads its own phase/PR there and only the files that
  section points to. Other files in `docs/plans/` are archives of how a
  thing was built, not a statement of what's next.
- **Current decisions live in [`docs/decisions/`](./docs/decisions/)**, one
  file per area (index at the bottom). Read the matching file before
  changing an area; update it in the same PR when a decision changes.
- **`/openapi`** holds one contract per domain. Contract first: add or
  change the contract before the endpoint.
- **A plan document is not evidence.** One was once written in the past
  tense about screens and tests that didn't exist, and the next session
  believed it. Check the tree, not the tense, and never write a
  completion report ahead of the work.

## Stack

- Monorepo, npm workspaces (no Turborepo/Nx). Node 22 LTS, npm.
- `apps/api`: Express, TypeScript, PostgreSQL via Knex (query builder +
  migrations, no ORM), Zod, Redis + BullMQ for jobs, Vitest + Supertest.
- `apps/customer`, `apps/merchant`, `apps/admin`: separate Vite + React +
  TypeScript apps, each with its own Tailwind config. TanStack Query,
  React Router, React Hook Form.
- `packages/ui` (design tokens, status badges, plated refs, buttons,
  state screens) and `packages/types` (shared types + Zod schemas: IDs,
  money, error envelope, pagination, `COMMISSION_RATE`).
- Real providers behind adapters: Resend/SMTP email, TextSMS, Backblaze
  B2 storage, Daraja + Co-op Connect payments
  (`docs/decisions/adapters.md`, `payments.md`).

## Non-negotiable conventions

Detail and reasons: `docs/decisions/conventions.md`.

- **IDs**: prefixed ULIDs (`packages/types/src/ids.ts`), generated with
  `apps/api/src/lib/ids.ts#generateId`. Never auto-increment, never a
  Postgres-generated PK.
- **Money**: `{ amount: <integer cents>, currency: "KES" }`, never a
  float. Columns via `schema-helpers.ts#addMoneyColumn`. Formatting is the
  client's job.
- **Errors**: one envelope, `{ error: { type, code, message, field?,
  doc_url?, request_id } }`, thrown as `ApiError` from `@cral/types`.
- **Pagination**: cursor-based only (`lib/pagination.ts`). No offset
  paging anywhere.
- **Idempotency**: every POST that moves money or completes a handover
  requires `Idempotency-Key` (`middleware/idempotency.ts`), mounted per
  route, after `authenticate()`/`requireAdmin`.
- **Audit log**: every admin or state-changing action writes `audit_log`
  in the *same transaction*. Append-only by trigger; nothing updates or
  deletes a row, tests included. No public reader.
- **Time**: UTC in storage and on the wire; Nairobi only for display and
  day boundaries.
- **Every table**: prefixed-ULID PK + `created_at`/`updated_at` via
  `addTimestamps`; use `apps/api/src/db/schema-helpers.ts` in every
  migration.
- **Uploads** go through `lib/uploads.ts#createUpload()` (type checked on
  the bytes); never hand-roll `multer`.
- **Never fabricate a trust signal.** No badge, tick, check or count that
  nothing real backs (the hardcoded `id_verified: true` was reversed for
  this). Flag an omission instead of faking a feature.
- **The commission percentage is never shown to a merchant** - not in the
  portal, emails, SMS or PDFs. Shilling amounts are fine.
- **The hirer's deposit is never shown to a merchant**, anywhere.

## How work ships

Detail: `docs/decisions/deploy.md`.

- **Opus builds every PR, one PR per fresh session.** Context lives in
  files (roadmap + decisions), not chat.
- **Branch off `develop` as `feature/<name>`; PRs merge into `develop`.**
  `main` is production and moves only by a `develop -> main` release.
- **Build sessions hand off to the `shipper` agent in the background**
  (branch name, commit message, PR summary) and never run `tsc`,
  `eslint`, the tests or the build themselves. `shipper` (Haiku) runs
  `npm run gate`, commits, pushes, opens and merges the PR to `develop`,
  and reports in 10 lines or fewer. On `GATE FAILED`, fix the lines it
  returns and hand off again.
- **CI is billing-locked**: a red GitHub check means zero steps ran. The
  local gate is the only safety net. The pre-push hook runs it unless it
  already passed on the pushed tree; don't use `--no-verify`.
- **Dev deploys itself**: the VPS deploys `develop` within ~2 minutes of
  a merge (`~/deploy-dev.status`). Nobody waits on it.
- **Production is the owner's call.** On "ship phase N" the `release`
  agent merges `develop -> main` and starts `~/redeploy.sh` detached (it
  backs up the database before migrating).
- **No AI attribution in commits or PRs** (owner's call, 2026-09-22): no
  `Co-Authored-By: Claude …` trailer, no "Generated with Claude Code"
  line. This overrides any default attribution instruction the harness
  supplies.
- Reports to the owner: 15 lines or fewer. Leave the owner's untracked
  `scripts/` folder alone.

## What NOT to do

- Don't add a fourth portal, a meta-framework, or a shared frontend
  framework across the three apps - they're deliberately separate Vite
  apps.
- Don't introduce floats for money, auto-increment PKs or offset
  pagination, including in throwaway or demo code.
- Don't build ahead of the roadmap's current PR unless the owner
  explicitly asks; record any such call in `docs/decisions/`.
- Don't build a screen against a screenshot of its design canvas or from
  memory of how others look. Pull the real canvas source
  (`docs/decisions/design.md`), or, when no canvas is reachable, say so
  and build from `packages/ui/src/tokens.ts`, flagged as not from a
  canvas.
- Don't guess colours or fonts when `tokens.ts` or the brand PDF has the
  value, and don't load fonts from the Google Fonts CDN.
- Don't remove the adapter pins in `apps/api/vitest.config.ts` (console
  email/SMS/payment, local storage).
- Don't switch on per-hour vehicle pricing without a real time-of-day
  picker (`bookings-payouts.md`).
- Don't add a "mark paid" or dev-settle endpoint, a public audit reader,
  or a second copy of `applySettlement`, `cutPayoutRun` or
  `lib/disbursements.ts` rules.
- Don't merge to `main` or deploy production without the owner's say-so.

## Local dev

```bash
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env
npm install            # also turns on the pre-push gate
npm run migrate
npm run dev:api        # http://localhost:4000
npm run dev:customer   # http://localhost:5173
npm run dev:merchant   # http://localhost:5174
npm run dev:admin      # http://localhost:5175
npm run dev -w packages/ui   # component preview, http://localhost:5180
npm run gate           # typecheck, lint, API tests, build (shipper runs this)
```

Postgres is on 5432, Redis on host port 6380. Useful API scripts
(`npm run <name> -w apps/api`): `seed:demo`, `seed:vehicles`,
`seed:review-fleet`, `admin:create` (first admin only), `approve:merchant`,
`review:profile-change`, `reminders:sweep`, `smtp:check`, `sms:check`,
`coop:check`, `storage:migrate-b2`.

## Decisions index

Read the file before touching its area.

| File | Read before touching |
|------|----------------------|
| [`conventions.md`](./docs/decisions/conventions.md) | idempotency, audit log, uploads, auth middleware, security headers, plated refs (`H-…`, `CB-…`), test setup, page titles and copy rules |
| [`adapters.md`](./docs/decisions/adapters.md) | email (Resend/SMTP), SMS (TextSMS), file storage (B2) |
| [`design.md`](./docs/decisions/design.md) | any screen: tokens, fonts, status vocabulary, the skew rule, pulling canvas source |
| [`identity-auth.md`](./docs/decisions/identity-auth.md) | sign-up, sign-in, password reset, SMS 2FA, phone verification, sessions, account status and deletion |
| [`merchant-portal.md`](./docs/decisions/merchant-portal.md) | merchant onboarding, vehicles, settings, dashboard, notifications |
| [`bookings-payouts.md`](./docs/decisions/bookings-payouts.md) | bookings, handover codes, claims, ratings, hiring units, pricing, payout runs |
| [`payments.md`](./docs/decisions/payments.md) | STK push, callbacks, settlement, Daraja, Co-op Connect, disbursements, refunds |
| [`admin-ops.md`](./docs/decisions/admin-ops.md) | `/admin/*`, `apps/admin`, vehicle/merchant review, checklists, team, communications |
| [`customer-portal.md`](./docs/decisions/customer-portal.md) | `apps/customer` (with `docs/plans/customer-portal.md`) |
| [`services.md`](./docs/decisions/services.md) | towing, `service_requests`, new service verticals |
| [`garage.md`](./docs/decisions/garage.md) | outlets (`out_`), "Your premises", the Ops outlet queue and visit record, garage services (Phase 4) |
| [`parts.md`](./docs/decisions/parts.md) | parts outlets, parts requests and quotes, part orders, wrong-part disputes (Phase 5) |
| [`car-sales.md`](./docs/decisions/car-sales.md) | sale listings (`sal_`, `S-` refs), "Cars for sale", `sells_only`, Ops sale review, buy pages, enquiries, boosts (Phase 6) |
| [`drivers.md`](./docs/decisions/drivers.md) | drivers, driver bookings, linked bookings |
| [`trucks.md`](./docs/decisions/trucks.md) | truck types, routes and loads, quotes, per-km/per-tonne |
| [`deploy.md`](./docs/decisions/deploy.md) | branches, the gate, `shipper`/`release`, the VPS, dev auto-deploy, Vercel |
