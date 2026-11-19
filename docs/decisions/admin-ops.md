# Ops console (`apps/admin`)

Read before touching anything under `/admin/*`, `apps/admin`, vehicle or
merchant review, team, communications or Ops payouts. Plans:
`docs/plans/admin-phase-3.md`, `admin-merchants-vehicle-review.md`,
`admin-review-checklist.md`, `admin-communications.md`.

## Identity and access

- **A separate identity store**: `admin_users` / `admin_sessions` /
  `admin_login_challenges`, not `users`/`sessions`. Spec §8 gives Ops a
  separate cookie domain, mandatory 2FA, a 10-minute access token, an
  8-hour absolute cap and a 20-minute idle timeout, none of which the
  public path has; separate tables mean a public-login compromise can't
  reach Ops and `authenticate()` never branches on audience.
- **Roles** are their own closed set: `admin_reviewer` / `admin_finance` /
  `admin_support` / `admin_sales` / `admin_super` (labelled Compliance
  reviewer / Finance / Support / Sales agent / Owner), plus per-admin queues (`drivers`, `renters`,
  `bookings`, `services`, …).
- **`aud: "ops"` tokens sign with `JWT_ADMIN_SECRET`**, a different key
  from the public one (`lib/jwt.ts#signAdminAccessToken` /
  `#verifyAdminAccessToken`, pinned to `aud` + HS256). A leak of one
  audience's key must not mint the other's.
- **`middleware/require-admin.ts` gates every `/admin/*` route**: the ops
  token **plus a live `admin_sessions` row**, the idle and absolute
  clocks, and `role`/`queue` where asked. `admin_super` clears every role
  and queue check. It bumps `last_seen_at`. Mount it **before**
  `requireIdempotencyKey()`.
- **2FA is SMS** (TextSMS). `admin_login` returns `{ challenge_token,
  next: "2fa" }` only; the session is created by `/admin/auth/2fa`. The
  challenge is addressed by an opaque token (only its hash stored), never
  a row id. Idle timeout means a full login (`idle_timeout_2fa_required`):
  stricter than the spec's "second factor only" re-prompt, which is
  deferred.
- The session pair lives in `sessionStorage` (shared Ops machines), no
  "keep me signed in".
- **The first admin** comes from `npm run admin:create -w apps/api --
  <email> <phone> <role> "<Name>" [queue,queue]` (prints a generated
  password once). Everyone after that is added in Settings -> Team.
  Contract `openapi/admin-identity.yaml`.

## Console conventions

- **Drawn light** (`#FAFBFC`/white), as every admin canvas screen is. The
  `ops` dark palette in `tokens.ts` is unused and carries a note pointing
  here; a dark console would be a redraw, not a swap.
- Follows the merchant portal's conventions: self-hosted fonts, canvas
  values inlined in `components/console/styles.ts`, `--r-sm/--r/--r-lg`,
  error boundaries, `usePageTitle` (suffix "CRAL Ops").
- **`SideNav` lists only built screens** (each item has a `built` flag;
  role-filtered, `admin_super` sees all). Unbuilt routes still resolve to
  `Placeholder` so a direct URL doesn't 404. `/` redirects to `/vehicles`.
  Collapsible groups (Communications) open when a child route is active.
- **The masthead bell is inert and badge-less**: it belongs to a
  staff-facing notification stream (SLA breach, dispute filed, invoice
  overdue) that has no generators yet. A count of nothing is worse than
  none.
- The Ops login and the payouts screens aren't from a canvas file (none
  exists); built in the console's own idiom and flagged.

## Two gates: the account and each car

Approving the merchant and approving a car are **separate decisions**
("Approving a vehicle does not verify the business").

- **Account approval** happens on the merchant file:
  `POST /admin/merchants/{id}/documents/{kind}/decision`, then
  `POST /admin/merchants/{id}/approve`, which sets
  `merchants.approved_at`, notifies the merchant and lights the
  `✓ VERIFIED` chip. `.../reopen` reverses it; `.../request-changes` sets
  `review_changes_requested_at` + `review_note` (badge
  `changes_requested`, cleared on approve). There is **no business-level
  reject**: that's account suspension, its own slice. Required account
  documents are `merchant_approval.required_document_kinds`
  (`national_id`, `kra_pin`, plus for a company
  `certificate_of_incorporation`, `company_kra_pin`, `cr12`).
- **A car can't go live for an unverified merchant**: approve is 422
  `merchant_not_approved` until the account is approved, then needs the
  three car documents (`logbook`, `comprehensive_insurance`,
  `tracker_certificate`, from `vehicle_review.required_document_kinds`)
  accepted (422 `documents_not_all_accepted`). The case shows the account
  documents read-only, or links to the merchant file.
- Driver approval is a third gate (`drivers.md`).
- **Wording follows `owner_type`**: an individual is an "account", a
  company a "business" (`entityWord` in `console/status.ts` and
  `admin-merchants/service.ts`): "Approve account", "✓ Account verified",
  "Consistency and payout" vs "The business as a whole".
- The gates prompt each other: a car whose business isn't verified offers
  "Review the business" (`?from=<vehicle>`), the approved file offers the
  way back, and a decision offers `next_case` / `merchant_next_case`.

## Review checklists (checklist-first)

`lib/review-checklist.ts`. One checklist per vehicle case and one per
merchant approval. Item definitions live in `platform_settings`
(`vehicle_review.checklist` / `merchant_approval.checklist`); answers in
`vehicle_review_checks` / `merchant_review_checks` (`(entity_id,
item_id)` PK, `result` pending | pass | flag). `applies_when` (`company` /
`chauffeured` / `rate_over:<cents>`) filters items per case. Each item
carries a `document` it sits under (or none, for the account-wide
section).

- **Every item must be answered before any decision.** Approve, request
  changes and reject all return 422 `checklist_incomplete` until then;
  approve also needs zero flags (422 `checklist_flagged`). `severity` is
  stored but no longer read. `ChecklistBlock` carries `outstanding` +
  `complete`; items carry `skipped`.
- **A document's state follows its checklist**: every item under it
  passed -> `ok` (a silent accept, audit `after.via = "checklist"`); an
  `ok` document whose items stop being all-pass -> back to `pending`.
  Document decisions are `accept` / `reject` ("Ask for a new upload") /
  `reset` ("Undo", clears its answers). A manual accept needs that
  document's checklist passed.
- **Derived, never stored**: an answer older than its document's upload
  (`documents.created_at`; a re-upload deletes + inserts) reads `pending`
  again, and items under a `rejected` document are `skipped`. A document
  with no applicable items counts as one open check until accepted by
  hand (`undecidedUncheckedDocs`).
- **Flags build the note**: `checklist.suggested_note.{changes,reject}`
  pre-fills the request-changes / reject modal; `REASON_TEMPLATES` remain
  as quick-adds. The decision's `audit_log` `after` carries a checklist
  snapshot. `POST /admin/{vehicles,merchants}/{id}/checklist { item_id,
  result, note? }` sets one answer (idempotent upsert).
- **Working a case claims it**: answering a check or deciding a document
  on a `pending` or unassigned case assigns it and moves it to `review`
  ("With you"). It never takes a case from another reviewer; "Assign to
  me" does. All answered, nothing decided -> **Ready to decide**
  (`READY_TONE`, `READY TO DECIDE` badge).
- **UI** (`apps/admin/src/components/console/review/`): sections fold
  when complete, a decided section shows a chip + "Change" menu, decisions
  live in a sticky dock that shows progress until the checklist is done,
  "Open scan" puts a document beside its checklist. Deliberately departs
  from the canvas (the owner asked for a better review UI), in console
  tokens.
- **Automatic checks are advisory and hidden**: `lib/vehicle-checks.ts`
  still runs and `checks` still ships, but the panel is gone.
  `CHECK_GLYPH` is kept, unused. "Logbook name match" is **not** a check -
  there's no OCR, so the case shows the account name for a human to
  compare. Same rule as the fabricated `id_verified` badge.

## Vehicle review

Contract `openapi/admin-vehicles.yaml`; module `modules/admin-vehicles/`;
screens `pages/vehicles/{Queue,Case}.tsx`.

- **Five review buckets over seven listing states**: `pending ->
  needs_review`, `review -> with_you`, `action -> changes_sent`, `live`,
  `rejected`; `draft`/`paused` never enter the queue. The API returns raw
  `status` + `bucket`; `console/status.ts` maps labels.
- **`documents.review_state`** (`ok`/`pending`/`expiring`/`rejected`, with
  `review_note`/`reviewed_by`/`reviewed_at`) is set by Ops and is what the
  merchant portal renders.
- **Each decision is one transaction**: `vehicles`, `vehicle_events`
  (`actor_type: "reviewer"`), `audit_log` (`actor_type: "admin"`) and
  `notify(trx, {category: "review"})`, delivery enqueued after commit. A
  document accept is silent; a reject and every listing decision notify.
  The two decision POSTs need an `Idempotency-Key`.
- Approve sets `live`, fills `listing_ref` via `nextListingRef` if null,
  clears `reviewer_note`. Request changes -> `action` + `reviewer_note`
  (`reviewer_note_resolved = false`); reject -> `rejected` + note. The loop
  closes because a merchant re-upload bumps `action`/`rejected` back to
  `review`.
- `vehicles.review_assignee` (`ON DELETE SET NULL`). "Decided today" is a
  count over `audit_log` since the Nairobi day start.
- `platform_settings` (key/value, typed reader `lib/platform-settings.ts`)
  holds `sla_days` (default 2, drives the overdue banner and age pill),
  the enabled automatic checks, required document sets and checklists.
  No UI edits it yet (Settings -> Review rules is a placeholder).
- `npm run seed:review-fleet -w apps/api` makes a throwaway merchant with
  submitted vehicles (dev only; doc bytes aren't stored, so "Open scan"
  shows the "file no longer stored" state).

## Merchants lens

Contract `openapi/admin-merchants.yaml`; module `modules/admin-merchants/`;
screens `pages/{Merchants,MerchantFile}.tsx`.

- `GET /admin/merchants`: merchants with at least one post-draft vehicle,
  most-waiting first (`pending` + `review`), keyset cursor `(waiting,
  id)`. Per-row counts and `total` are whole-set. The set is loaded and
  sorted in the service (small and bounded).
- The file returns `declared` (what the merchant typed, to compare with
  the scans), `events` (an Ops-only reader over `audit_log`), the
  fleet with links to each case, and `review_next`.
- **"Message merchant"** deep-links into Communications compose with the
  merchant pre-selected (`?merchant=&name=`).
- `lib/merchant-display.ts` (`merchantDisplayName`, `initials`) is shared.

## Other queues

Renters (`admin-renters`, renter ID/licence review), Bookings
(`admin-bookings`, the pickup gate), Drivers (`drivers.md`), Outlets
(`garage.md`, checklist-first, the `outlets` queue), Services
(`services.md`) and Payouts (`bookings-payouts.md`) each have their own
contract in `openapi/admin-*.yaml`. They use the simpler list-and-file
idiom of `Renters.tsx`/`RenterFile.tsx` unless they need a checklist.

## Settings and Team

- `/settings` is the canvas's six tabs: Review rules · Money ·
  Communication · Invoicing · Team · Audit log. **Only Team is built**;
  the rest show `Placeholder`. `/team` redirects to `?tab=team`.
- Team (`modules/admin-team/`, `admin_super` only): list, invite, edit,
  deactivate (`admin_users.status = "disabled"`), reactivate, reset
  invite. A super admin can't edit their own role/queues or deactivate
  themselves.

## Communications

`Cruz Admin Communications.dc.html`; contract
`openapi/admin-communications.yaml`; `admin_super` only (real money on
SMS, every merchant reachable at once).

- **A bulk send does not go through `notify()`**: that pipeline is
  per-category, honours each merchant's channel preferences and models
  product events. A broadcast has its own audience and channel controls,
  so `jobs/comms-bulk-send.ts` calls the SMS/email adapters directly. It
  honours `merchants.sms_opt_out` (no merchant-side toggle sets it yet).
- **Automatic templates are derived** from `NOTIFICATION_CATEGORIES`, with
  real usage counts and last-sent dates from `notifications`, not the
  design's fabricated fixture.
- **Audiences resolve live**: `verified`/`pending` off
  `merchants.approved_at`, `companies` off `owner_type`, `expiring` off
  comprehensive-insurance `expires_at` within `EXPIRING_WITHIN_DAYS`.
- One BullMQ job per run writes `sent_count`/`failed_count` once at the
  end.
- **No "Schedule" button**: there's no scheduler behind it. A one-off
  send to a merchant without the deep link means pasting an id.

## Sales agents (`admin_sales`, Phase 3 AG1, 2026-11-18)

Contract `openapi/admin-agents.yaml`, module `modules/admin-agents/`,
console `pages/agents/`, migration `20261118090000_sales_agents`. Full
reasoning: `docs/plans/trucks-and-sales-agents.md`, "B1 as built".

- **An agent never approves and never touches a password.** Add merchant
  creates `users` + `merchants` (`onboarded_by`, `onboarding_source =
  agent_invite`) with an unusable random argon2 hash and emails a 7-day
  invite: a `password_reset_tokens` row with `purpose = 'invite'`, opened by
  the merchant portal's existing `/reset-password` screen.
- **Invite pending = `users.invited_at` set, `invite_accepted_at` null.**
  Any emailed-link password set accepts it and marks the email verified;
  the "password was reset" notice is skipped; terms are recorded then.
  Onboarding reminders skip invite-pending accounts.
- **Scoping**: `requireAdmin({ role: "admin_sales" })` + `onboarded_by = me`
  in every query; another agent's merchant is 404, not 403. `admin_super`
  sees all agent-brought merchants ("Agent sign-ups"). Agents get no queues
  and 403 on every other `/admin/*` router; the console keeps them on
  `/my-merchants`.
- **Status chip is derived**: verified -> changes_requested -> submitted ->
  invited -> onboarding (step n of **5**, the wizard's real count).
- Existing email/phone -> 409 `account_exists`. Rate limits per admin: add
  30/h, resend 5/h per merchant. Both POSTs keyed. Audit:
  `merchant.agent_invite`, `merchant.invite_resent`, `user.invite_accepted`.
- Screens not from a canvas file (none exists); console idiom, phone-first.

### Attribution (AG2, 2026-11-19)

Migration `20261119090000_agent_signup_codes`; `lib/agent-codes.ts`. Detail:
`docs/plans/trucks-and-sales-agents.md`, "B2 as built".

- **Personal link `<merchant portal>/join?a=<code>`.** `admin_users.signup_code`,
  six characters without 0/O/1/I, issued on the agent's first
  `GET /admin/agents/link` (conditional write, audited
  `admin.signup_code_issued`), never changed. The portal keeps `?a=` from
  any page in `localStorage` for 30 days and sends it as `agent_code` on
  `POST /auth/register`.
- **Credit is fixed at sign-up and first credit wins.** A code naming an
  active `admin_sales` / `admin_super` creates the `merchants` row at
  register with `onboarded_by` + `onboarding_source = agent_link` and
  `merchant.agent_link_signup` audit, one transaction. Unknown, disabled or
  customer-side codes are ignored silently (same response). An existing
  account is never re-credited (409 `account_exists`), so an owner another
  agent invited stays theirs; nothing reassigns `onboarded_by`.
- **Who sees it**: attribution is the owner's report. Ops Merchants shows
  the Agent column and `?agent=<id>|none` filter to `admin_super` only;
  other roles get no `agent` field and 403 on the filter.
  `GET /admin/agents` (the filter's roster) is owner-only.

### Assist session (AG3, 2026-11-19)

Migration `20261119100000_assist_sessions`; `lib/assist.ts`,
`modules/admin-agents/assist.ts`. Detail:
`docs/plans/trucks-and-sales-agents.md`, "B3 as built".

- **Consent is a code to the owner's verified phone**, read out in person.
  Not verified -> `409 phone_not_verified`; the agent never consents via a
  number they typed. Code: 10 min, 5 tries, single-use, hash only, bound
  to one agent + merchant.
- **The assist token reaches onboarding only.** The allowlist in
  `lib/assist.ts` (`METHOD + route pattern`) is enforced in
  `authenticate()`; everything else is `403 assist_scope`. Inside it the
  agent can't set the phone, payout or terms, can't submit, and reads or
  deletes only documents it uploaded. A route-walk test guards it; add a
  route to the allowlist only on purpose.
- **Agents still never approve, and now never submit.** The owner adds the
  payout, accepts the terms and submits.
- Every write audited as the agent with `after.assisted_for`; the owner is
  emailed at start, sees it on the setup page and can end it.

## Code anchors

- Contract for `/admin/auth/*`: `openapi/admin-identity.yaml`. Team: `GET/POST/PATCH /admin/team`, `.../deactivate`, `.../reactivate`, `.../reset-invite`.
- Vehicle review: `POST /admin/vehicles/{id}/{assign,documents/{kind}/decision,decision}` and `.../checklist` (`setChecklistItem`); `decideListing`; `serializeCase` returns per-document `documents[].checklist` and `photos_checklist`. Queue rows show a `n/3` car-doc chip; `mine` / `decided_today` stay in the queue response for a future Dashboard. Screens `apps/admin/src/pages/vehicles/{Queue,Case}.tsx`, `pages/{Merchants,MerchantFile}.tsx` (cross-linked: queue row -> `/merchants/:id`, file -> `/vehicles/:id`), `pages/payouts/{Queue,Run}.tsx`.
- Merchant file `GET /admin/merchants/{id}`; badges `new_merchant` / `verified` / `changes_requested`.
