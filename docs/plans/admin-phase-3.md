# Admin (Ops) portal — Phase 3 scoping

## Context

`apps/admin` is a Phase-0 Vite shell: one route, `Overview.tsx`, an
`AppLayout`, its own Tailwind config, TanStack Query and React Router
already in `package.json`, dev server on **5175**. Nothing is wired to the
API. Per CLAUDE.md the merchant portal has been the sole priority, and
that portal's design is now fully built (Dashboard, 2026-09-04, was the
last screen). This doc scopes the admin portal so it can be sequenced —
it is a plan, not a PR, and building it needs the owner's explicit go per
"What NOT to do".

**What is already frozen.** `openapi/identity.yaml` §8 specifies the
admin auth surface — a *separate token audience* (`aud: "ops"`), separate
cookie domain, mandatory 2FA on every login, a 10-minute access token, an
8-hour absolute session cap and a 20-minute idle timeout that re-prompts
for the second factor only. Endpoints: `/admin/auth/{login,2fa,refresh,
me,logout,audit}`, `/admin/impersonate`, `/admin/team/{id}/reset-invite`.
Roles: `admin_reviewer`, `admin_finance`, `admin_support`, `admin_super`,
each with `assigned_queues`. `verifyAccessToken` already pins
`audience: "public"`, so an ops token is rejected by every merchant
endpoint today — that half of the boundary exists.

**Delivery-plan position.** Admin is Phase 3; the customer portal
(discovery/booking) is Phase 2 and does not exist. Several admin surfaces
are thin without a customer side generating real data — dispute
resolution, hirer records, ratings moderation. Whether admin genuinely
jumps ahead of customer is the owner's call (see Open decisions).

Branch work off `develop`. Freeze each `openapi/admin-*.yaml` before
writing its service — the contract-first ritual, same as every merchant
domain.

---

## The accumulated stubs this portal has to absorb

Every one of these is a `TODO(admin)` that shipped in the merchant work,
verified in the source, not assumed:

| Stub | Where | What admin owns |
|---|---|---|
| `merchants.approved_at` — nothing sets it | `20260827090000`, `approve-merchant.ts` script | Merchant account approval queue |
| `vehicles.status` `review`/`pending`/`action`, `reviewer_note{,_meta,_resolved}` | `modules/vehicles/service.ts` | Vehicle listing review queue |
| `effectiveDocState` has `accepted`/`pending`/`rejected` but nothing sets a reviewed state | `modules/vehicles/service.ts:100` | Per-document accept/reject |
| `profile_change_requests` + `reviewProfileChange()` | `modules/merchant/service.ts:584`, `review-profile-change.ts` script, `docs/plans/profile-change-review.md` | Profile-change review (design already done) |
| `bookings.escalated_dispute_id` — `dsp_` ids generated, **no disputes table** | `modules/bookings/service.ts:842`, `20260828090000` header | Dispute triage (resolution is Phase 6+) |
| `cutPayoutRun()` — only caller is the dev-seed | `modules/payouts/service.ts:210` | Payout-run management (cut / schedule / mark paid) |
| `payout_queries` — row + support email, no response surface | `modules/payouts` | Payout-query triage |
| `users.status` `suspended` — nothing sets it; login/refresh already reject it | `20260903100000`, `auth/service.ts` | Support: suspend / unsuspend |
| `pending_deletion` + 30-day sweep | `runAccountDeletionSweep` | Support: deletion oversight |
| `GET /audit-log` removed as public scaffolding — "belongs in the Phase-3 admin surface behind an `aud: ops` token" | `routes/health.ts:43` | Audit-log reader |
| `/admin/team/*` fallback returns "ships in Phase 3" | `auth/routes.ts:413` | Admin team management |
| notification generators for "document accept/reject", "booking requested" etc. have no real source | `modules/notifications/routes.ts:74` | Admin decisions become the real generators |

---

## Preconditions — do these first, they are not admin features

From the 2026-09-03 review (`docs/plans/merchant-review-2026-09-03.md`
#19) and the shape of the work:

1. **`requireRole` / `requireScope` middleware.** No route checks
   `req.auth.roles` today; merchant safety comes entirely from
   `getOrCreateMerchant(userId)` scoping. Admin needs real authorization:
   a middleware that checks the ops audience, the reviewer's `role`, and
   `assigned_queues` for queue-scoped routes.
2. **Split `getMerchant` (read, 404s) from `getOrCreateMerchant`** (write
   path only). Right now any authenticated GET mints a merchant row for
   the caller. An admin impersonating a customer, or a customer once
   Phase 2 lands, must not create merchant records by browsing.
3. **Admin identity store decision** (Open decision #1) resolved before
   `openapi/admin-identity.yaml` is reconciled with the frozen §8.
4. **Seed path for the first `admin_super`** — a script on the same
   footing as `approve:merchant`, since there is no admin to invite the
   first admin.

---

## Architecture

- **Separate Vite app, already scaffolded.** `apps/admin`, its own
  Tailwind, dev port 5175. Do not share a frontend framework with
  merchant/customer ("What NOT to do").
- **Separate token audience.** `aud: "ops"`, issued only by
  `/admin/auth/*`. `verifyAccessToken` gains an ops-audience verifier
  (or a parameter); the merchant path stays pinned to `"public"`.
- **Mandatory 2FA, no "remember this device".** Reuse the TextSMS
  adapter and the `otp_codes` table with a new purpose, or TOTP — §8
  says a 6-digit code; SMS is consistent with the 2026-08-24 decision.
  10-minute access token, 8-hour absolute cap, 20-minute idle → re-2fa
  only (not full re-login).
- **RBAC by `role` + `assigned_queues`.** `admin_reviewer` → review
  queues; `admin_finance` → payouts; `admin_support` → account lookup +
  impersonation; `admin_super` → team management + everything. Queue
  assignment gates the review lists, not just the role.
- **Every admin state change writes `audit_log` in the same
  transaction**, `actor_type: "admin"`, both actor ids on impersonated
  requests — the existing non-negotiable convention, now with a real
  actor type. The table is genuinely append-only since `20260905090100`.
- **Idempotency-Key on every admin POST that moves money or commits a
  review decision** — approve/reject double-clicks, payout-run cuts,
  mark-paid. Per-user scoped keys already exist (`20260905090000`); the
  actor is the admin.
- **Merchant-facing effects go through `notify(trx, {...})`** in the
  decision's transaction, delivery enqueued post-commit — the
  `submitVehicle` shape. Admin decisions become the real generators for
  notification kinds the merchant portal already renders but nothing
  currently produces.
- **Cursor pagination only**, `lib/pagination.ts`, on every queue.

---

## Proposed scope — vertical slices, each independently shippable

### Slice 0 — Auth, RBAC, shell

- Preconditions 1–4 above.
- `openapi/admin-identity.yaml` — reconcile the frozen §8 into a
  standalone contract (or extend `identity.yaml`); freeze it.
- `modules/admin-auth/` — login → 2fa → ops token pair, refresh with the
  idle/absolute rules, `/admin/auth/me`, logout (immediate revoke +
  audit), `/admin/auth/audit` (this admin's own actions).
- `apps/admin`: login screen, 2FA screen, app frame, role/queue-gated
  nav, `lib/api.ts` with ops-token refresh (adapt merchant's).
- Tests: an ops token is rejected by merchant routes and vice versa;
  role/queue middleware denies out-of-scope routes; idle timeout
  re-prompts for 2fa only; revoked admin session dies immediately
  (the `authenticate()`-checks-the-session rule from the reliability PR).

### Slice 1 — Document + vehicle listing review  *(highest existing wire-in)*

`submitVehicle` already fires a review-queue notification, so this queue
has real inputs the day it ships.

- `openapi/admin-vehicles.yaml`.
- `GET /admin/vehicles?status=review&queue=&cursor=` — queue list joined
  to a merchant summary.
- `GET /admin/vehicles/{id}` — the listing, its three documents
  (logbook / tracker / insurance) with the stored file behind
  `safeContentType`/`nosniff` (the upload-policy rules), current
  `reviewer_note`.
- `POST /admin/vehicles/{id}/documents/{kind}/{accept,reject}` — sets the
  real reviewed doc state `effectiveDocState` already understands.
- `POST /admin/vehicles/{id}/{approve,request-changes,reject}` —
  `approve` → `live`; `request-changes` → `action` + `reviewer_note`;
  `reject` → `rejected`. Idempotency-Key. `notify()` the merchant in-trx.
- Tests: doc/listing state transitions, reviewer note round-trips to the
  merchant's Vehicles screen, notification enqueued post-commit,
  queue-assignment gating.

### Slice 2 — Merchant account approval

Depends on Slice 1's document-decision endpoints.

- `openapi/admin-merchants.yaml`.
- `GET /admin/merchants?status=pending&cursor=` and
  `GET /admin/merchants/{id}` — the account, its entity type, the
  document groups (company docs / personal docs), listing count.
- `POST /admin/merchants/{id}/{approve,reject}` — `approve` sets
  `approved_at`; **define the reject path** (there is none today — new
  column or a status, plus merchant-facing copy). Idempotency-Key,
  in-trx audit + `notify()`.
- Replaces `npm run approve:merchant`.
- The `✓ VERIFIED` merchant chip and the dashboard MERCHANT STATUS card
  light up for real once this ships — both already read `approved_at`.

### Slice 3 — Profile-change review

Design already written: `docs/plans/profile-change-review.md`. Small.

- `openapi/admin-profile-changes.yaml`.
- `GET /admin/profile-change-requests?status=pending&cursor=`,
  `GET .../{id}` (before/after per field), `POST .../{id}/{approve,
  reject}` calling the existing `reviewProfileChange`. Idempotency-Key.
- Handle the edges that doc lists: merchant withdraws while open;
  `owner_type` change forces a fresh document review; approving a
  name change flips affected `live` vehicles back to `review`.
- Replaces `npm run review:profile-change`.

### Slice 4 — Support: accounts, sessions, suspension, impersonation

- `openapi/admin-accounts.yaml`.
- `GET /admin/accounts?q=` — search users/merchants; `GET
  /admin/accounts/{id}` — profile, sessions, status, deletion timer.
- `POST /admin/accounts/{id}/{suspend,unsuspend}` — sets `users.status`;
  login/refresh already enforce it, so suspension takes effect within a
  refresh cycle (or immediately, via the session check). In-trx audit.
- `POST /admin/impersonate` per §8 — 30 min, `read_only: true` default,
  forced banner, both actor ids on every request, merchant notified
  afterward. This needs an impersonation-token type and middleware that
  tags `actor_id` + `impersonator_id`.
- Deletion oversight: list `pending_deletion`, see the 30-day sweep's
  next run.

### Slice 5 — Finance: payout runs and queries

- `openapi/admin-payouts.yaml`.
- `GET /admin/payout-runs?status=&cursor=`, `GET .../{id}` (the
  denormalised lines).
- `POST /admin/payout-runs` — cut a run for a merchant via the exported
  `cutPayoutRun` (the single decider — do not fork its rules).
  Idempotency-Key.
- `POST /admin/payout-runs/{id}/mark-paid` — stand-in for the Daraja B2C
  callback that does not exist; sets `paid` + `provider_code`. **Still
  no payment rail** — this is a manual reconciliation action, flagged.
- `GET /admin/payout-queries`, `POST .../{id}/respond` — triage the
  merchant "Query this payout" tickets that today only send an email.
- Tests: the admin-cut run's totals equal what `/merchant/payouts`
  reports (payout-position parity, already asserted merchant-side);
  a booking still pays out exactly once under the global unique
  constraint.

### Slice 6 — Settings

`Cruz Admin Settings.dc.html` is one tabbed screen: `Review rules · Money
· Communication · Invoicing · Team · Audit log`. **The audit reader and
team management are tabs inside it, not standalone nav items** — an
earlier version of this doc had them as separate slices.

- **Review rules** — a UI over the `platform_settings` rows that slice 1
  already seeds (required documents incl. the conditional `tracker`/`dl`
  rules, the review-day promise, the automatic-check toggles).
- **Audit log** — `GET /admin/audit-log?actor=&entity=&action=&cursor=`,
  cursor-paged, `admin_super` only. This is the reader that
  `GET /audit-log` was removed to make room for — **never expose it
  without the ops audience + role check**.
- **Team** — `admin_super` only: list admins, invite (single-use, the
  `/admin/team/{id}/reset-invite` flow — admins never self-reset), assign
  role + queues, deactivate. Replaces the "ships in Phase 3" fallback in
  `auth/routes.ts:413`.
- **Money / Communication / Invoicing** tabs cover commission, payout
  rhythm, payout holds, sender identities, quiet hours and invoice terms —
  most of which have no backing yet and should be scoped with the finance
  and communications slices, not here.

### Slice 7 — Staff notification feed

The masthead bell is a **staff-facing** stream (new submission, SLA
breach, dispute filed, invoice overdue, payout run failed), categorised
Vehicles / Disputes / Invoicing / Payouts. Entirely separate from the
merchant-facing `notifications` table. Its own table + generators; the
bell stays inert and badge-less until then.

---

## Explicitly deferred, and why

- **Full dispute resolution with money movement** — the original plan's
  Phase 6. Phase 3 gets a read-only dispute *triage* view over
  `bookings.escalated_dispute_id`; a real `disputes` table, resolution
  states and deposit-release instructions wait. Shipping a resolve button
  that can't move money would fabricate a capability.
- **Anything that needs the customer portal** — ratings moderation,
  hirer ID-verification review, real booking-request generation. No
  customer app, no real inputs. Same footing as the merchant portal's
  deferred `id_verified` badge.
- **A real payment rail** (Daraja B2C). `mark-paid` stays manual.
- **`admin` in `users.roles`** as the authorization mechanism — if
  Open decision #1 lands on a separate `admin_users` table, the flat
  `text[]` role on `users` is not extended.

---

## Open decisions — owner's call

1. **Separate `admin_users` table, or admins as `users` rows with an ops
   audience?** §8's separate cookie domain, mandatory 2FA, 8-hour cap and
   distinct role enum all point at a separate store. Recommendation:
   separate `admin_users` + `admin_sessions`, so a compromise of the
   public auth path can't touch Ops and the session rules don't have to
   branch on audience.
2. **Does admin actually precede the customer portal (Phase 2)?** Admin
   review queues are real and useful now (merchant onboarding is live);
   dispute/rating/hirer surfaces are hollow without customers.
   Recommendation: build Slices 0–3 now (they have real inputs), hold
   4–7 until after a Phase 2 slice or until a specific need bites.
3. **Is there an admin design canvas?** The merchant portal's whole
   visual fidelity came from reading `.dc.html` sources off the design
   canvas. CLAUDE.md references only Merchant App files. Either the owner
   produces an Ops design file, or admin ships functional-first in
   Tailwind (acceptable for an internal tool — state it as a deliberate
   choice, not a shortcut).
4. **2FA channel for admins** — SMS (consistent with 2026-08-24, reuses
   TextSMS) or TOTP (stronger, an authenticator app is a reasonable ask
   of staff). §8 only says "6-digit code".
5. **Merchant-account reject path** — new `rejected_at` column, or a
   `merchants.review_status` enum? And what the merchant sees.

---

## Cross-cutting verification (every slice)

1. Contract frozen in `openapi/admin-*.yaml` before the service.
2. `npm run test -w apps/api` — new suites: RBAC denial (wrong role,
   unassigned queue), ops/public audience isolation both directions,
   audit row written in the decision's own transaction, Idempotency-Key
   replay is safe, merchant `notify()` enqueued only post-commit,
   impersonation tags both actor ids.
3. `npm run typecheck` and `npm run lint` at the root — both exit 0.
4. Browser on **port 5175**. Expect a CORS gotcha: `.env`
   `CORS_ORIGINS` must include `http://localhost:5175` or every call
   fails as an opaque "Failed to fetch" (the merchant portal hit the
   identical trap on 5174).
5. End to end against real merchant data: onboard a merchant in the
   merchant portal → it appears in the admin approval queue → approve →
   the merchant's `✓ VERIFIED` chip and dashboard status card flip →
   the merchant gets the notification.

---

## Docs to update when this lands

- A **Recorded product decisions** block in CLAUDE.md per slice, as with
  every merchant screen — especially the admin identity-store choice, the
  RBAC model, `mark-paid` being manual, and every deferral above.
- `apps/admin`'s stale shell comments, mirroring the `SideNav` cleanup
  the dashboard PR did on the merchant side.
- Fold `docs/plans/profile-change-review.md`'s "admin side" section into
  Slice 3 rather than leaving two sources.
- `.env.example` — the admin CORS origin and any `ADMIN_*` / 2FA vars.
- Retire `approve:merchant` and `review:profile-change` from
  `apps/api/package.json` once Slices 1–3 replace them.
