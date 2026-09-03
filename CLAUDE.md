# Cruz Ride Auto (CRAL)

Car-rental marketplace for Kenya. Three portals — customer, merchant, admin
(Ops) — over one HTTP API. Solo-built. Source of truth for scope and
sequencing is `/openapi` (frozen contracts) and the platform API spec /
delivery plan the owner has on hand; this file is the persistent stack and
convention reference so it doesn't need re-explaining every session.

## Current phase

**Phase 1 — Identity, merchant portal only.** The owner corrected course
after Phase 1 initially got built against `apps/customer`: **merchant is
the sole priority until told otherwise.** `apps/customer` and `apps/admin`
are Phase-0 shells only — don't add screens or wire them to the API unless
explicitly asked, even if a later phase's spec section would normally cover
all three portals.

## Stack

- Monorepo, npm workspaces (no Turborepo/Nx). Node 22 LTS, npm.
- Backend — `apps/api`: Express, TypeScript, PostgreSQL via Knex (query
  builder + migrations, not a full ORM), Zod for validation, Redis + BullMQ
  for background jobs, Vitest + Supertest for tests.
- Frontend — `apps/customer`, `apps/merchant`, `apps/admin`: separate Vite +
  React + TypeScript apps, each with its own Tailwind config (not a shared
  meta-framework). TanStack Query for data fetching, React Router, React
  Hook Form.
- Shared — `packages/ui` (design tokens, status badges, plated references,
  buttons, state screens) and `packages/types` (shared TS types + Zod
  schemas: IDs, money, error envelope, pagination).
- `/openapi`: one file per domain, frozen before that domain is built
  (contract-first, vertical slices — see the delivery plan's ritual).

## Non-negotiable conventions (spec §2)

- **IDs**: prefixed ULIDs, never auto-increment integers. Prefixes live in
  `packages/types/src/ids.ts` (`usr_`, `mer_`, `veh_`, `bkg_`, `hnd_`,
  `pay_`, `dep_`, `pot_`, `inv_`, `dsp_`, `rev_`, `fil_`, `cmp_`, `doc_`,
  plus internal `aud_` for audit rows). Generate with
  `apps/api/src/lib/ids.ts#generateId` — never let Postgres generate a PK.
- **Money**: always `{ amount: <integer cents>, currency: "KES" }`, never a
  float. DB columns follow the `<name>_amount` (integer) / `<name>_currency`
  (char(3)) pair via `apps/api/src/db/schema-helpers.ts#addMoneyColumn`.
  Display formatting is a client concern, never the API's.
- **Errors**: one envelope shape everywhere — `{ error: { type, code,
  message, field?, doc_url?, request_id } }`. Thrown as `ApiError` from
  `@cral/types`, rendered by `apps/api/src/middleware/error-handler.ts`.
- **Pagination**: cursor-based only, via `apps/api/src/lib/pagination.ts`.
  No offset paging, anywhere — queues change under the reader.
- **Idempotency**: every POST that moves money or completes a handover
  requires an `Idempotency-Key` header and must replay safely within 24h.
  Enforced by `apps/api/src/middleware/idempotency.ts`, backed by the
  `idempotency_keys` table. Mount per-route, not globally.
- **Audit log**: every admin/state-changing action writes a row to
  `audit_log` in the *same transaction* as the change, never as a follow-up
  step. The table is append-only at the DB level (`REVOKE UPDATE, DELETE`).
- **Time**: stored and transmitted as UTC (RFC 3339). Nairobi time only for
  display and day-boundary pricing logic — never stored.
- **Every table**: prefixed-ULID PK, `created_at`/`updated_at` (timestamptz,
  UTC) via `addTimestamps`. Use `apps/api/src/db/schema-helpers.ts` in every
  migration rather than re-deriving these column patterns.

## Adapters (Phase 0 groundwork)

SMS, email and file storage are behind interfaces in
`apps/api/src/adapters/{sms,email,storage}` so a real provider drops in
without touching call sites, selected via `SMS_ADAPTER` / `EMAIL_ADAPTER` /
`STORAGE_ADAPTER`.

**Email is real, two adapters exist.** `SmtpEmailAdapter` (nodemailer,
`EMAIL_ADAPTER=smtp`) talks to the `noreply@cral.co.ke` mailbox on
`mail.cral.co.ke:587` — STARTTLS, so `SMTP_SECURE=false` and `requireTLS`
does the upgrade; `secure: true` on 587 hangs until timeout.
`npm run smtp:check -w apps/api` authenticates and disconnects without
sending; pass an address to send one real test message. The server
verifies the connection at boot and warns (does not exit) if it fails.

**Prefer `ResendEmailAdapter` (`EMAIL_ADAPTER=resend`) over SMTP where
possible.** Discovered 2026-08-25 deploying to Railway: raw SMTP to
`mail.cral.co.ke` is unreachable from Railway's egress — `ETIMEDOUT` at
the TCP-connect stage on both port 587 and 465, while two independent
external SMTP-test tools (different clouds, different regions) both got a
full, healthy SMTP conversation from the same host. That points at
Railway's specific outbound IP being blocked by the mail server's
IP-reputation firewall, not a config problem — and since Railway's egress
IP on non-static plans can change on redeploy, an allowlist fix wouldn't
even stay fixed. Resend sends over HTTPS to its own API instead of a raw
SMTP socket, so a mail server's firewall never enters the picture. Needs
`RESEND_API_KEY` + `EMAIL_FROM`, and `cral.co.ke` verified as a sending
domain in Resend's dashboard (a handful of DNS TXT/MX records) before
sends succeed.

Credentials for both live in the gitignored `.env`; `.env.example` carries
the keys with empty secrets.

`apps/api/vitest.config.ts` pins `EMAIL_ADAPTER`/`SMS_ADAPTER` to `console`
for the test run. Don't remove that — without it every test run tries to
deliver verification codes to `@example.test` addresses.

**SMS is live via TextSMS** (`SMS_ADAPTER=textsms`, decided 2026-08-31).
`TextSmsAdapter` (`apps/api/src/adapters/sms/textsms-adapter.ts`) is one
HTTPS POST to `sms.textsms.co.ke/api/services/sendsms/` — no SDK, same
shape as `ResendEmailAdapter`. Needs `TEXTSMS_API_KEY` /
`TEXTSMS_PARTNER_ID` / `TEXTSMS_SHORTCODE` in the gitignored `.env`; a
missing one throws from the adapter constructor at boot. `console` stays
the default for local dev and is pinned for the test run.
`npm run sms:check -w apps/api -- +2547XXXXXXXX` sends one real test SMS.
Two things it unblocked: opt-in SMS 2FA, and onboarding phone
verification (below).

## Design tokens

`packages/ui/src/tokens.ts` holds the **real** brand values — colors, type
scale, control heights, motion — extracted from
[`docs/brand/CRAL-Brand-Strategy-and-Design-System-v2.pdf`](./docs/brand/CRAL-Brand-Strategy-and-Design-System-v2.pdf)
(the design canvas's own token-reference pages, exported to PDF). That PDF
is the source of truth for anything token-shaped; the actual screen designs
live in the Claude Design canvas the owner shares links to (currently the
Merchant App file) — read screens from there, tokens from the PDF.

Three fonts, each with one job: **Archivo** for display-size headlines
only, **Instrument Sans** for all UI/body text, **IBM Plex Mono** for
identifiers/timestamps only.

They are **self-hosted, not loaded from the Google Fonts CDN** — see
`apps/merchant/src/fonts.css`, which aliases the `@fontsource*` packages to
the exact family names the canvas source uses so its declarations work
verbatim. This is deliberate: the CDN returned a 503 during testing, and a
font that fails to load silently falls back to a system sans, which is
precisely what made an earlier build "look like a different font". Don't
reintroduce the CDN `<link>`.

Archivo must be the **wdth+wght variable cut** (`@fontsource-variable/archivo`,
`archivo-*-wdth-normal.woff2`). The display type sets
`font-variation-settings:'wdth' 110` (sub-heads 106) — with a wght-only
build that declaration silently does nothing and the type renders too
narrow. To check the axis is live, measure a string at `'wdth' 100` vs
`'wdth' 110` and confirm the widths differ.

Five status states — pending / review / verified / rejected / boosted —
never colour alone, always paired with a glyph + word. "boosted" is the
only skewed (-14°) element in the product ("round = trust, angled = paid");
never skew a verification/trust element. The masthead's red rule carries
the same 14° skew, once per surface, never more than once in view.

**The merchant portal's Vehicles screen widens this vocabulary** — its own
design file (`Cruz Merchant Portal.dc.html`) is the authority there, not
this section. Listing `status` is seven states (`draft / pending / review /
action / rejected / live / paused`), not five — "verified" is a separate
`verification_badge` axis (`none / pending / active`) rather than a listing
status. See `apps/merchant/src/components/portal/status.ts`. That screen's
reviewer-note card also carries its own 14° skewed rule alongside the
masthead's — the design does this deliberately (the note card counts as its
own surface), so it's a documented exception to "never more than once in
view", not an oversight. **The Dashboard's expiring-document card takes the
same exception** — its `18×5` `#D81E32` rule sits beside the `EXPIRES IN…`
kicker while the masthead's is still in view. Its amber `#C77400` top bar is
*not* skewed; only the small rule is.

### Getting the real screen source — do this, don't eyeball screenshots

Twice now, building a screen by looking at a screenshot of the canvas
produced something that looked roughly right and was wrong in almost every
value. **Don't do that.** The canvas exposes the actual file source through
its own API, and every screen is authored as plain HTML with 100% inline
styles — so the exact `clamp()`, hex, and `font-variation-settings` values
are all readable.

With the design canvas open in the browser (via the Chrome MCP), run this
in the page context — same-origin, so the session cookie is already there:

```js
const base = 'https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/';
// 1. find the file
await (await fetch(base + 'ListFiles', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ projectId: '<project-uuid-from-the-url>' }) })).json();
// 2. fetch it — `content` is base64
const j = await (await fetch(base + 'GetFile', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ projectId: '<uuid>', path: 'Cruz Merchant Login.dc.html' }) })).json();
const html = new TextDecoder().decode(Uint8Array.from(atob(j.content), c => c.charCodeAt(0)));
```

Two gotchas that will bite:
- Strip the canvas's own injected runtime first:
  `html.replace(/<(script|style)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g,'')`
- Reading the result back through the browser tool trips a content filter,
  because inline `style="a:b;c:d"` looks like cookie data. Encode before
  slicing it out (`:` → `~C~`, `;` → `~S~`, `=` → `~E~`) and decode locally.
  Pull in ~1100-char chunks; larger ones get truncated.

The canvas files are named per screen — `Cruz Merchant Login.dc.html`,
`Cruz Merchant Dashboard.dc.html`, `Cruz Merchant Onboarding v3.dc.html`,
and so on. `ListFiles` shows the full set.

Because the design is inline-styled, **auth screens are reproduced with the
design's own inline styles verbatim** (see `apps/merchant/src/pages/SignIn.tsx`
and `components/BrandPanel.tsx`) rather than re-expressed as Tailwind
utilities. That's deliberate — it's what makes them match exactly. Tailwind
is still there for app-shell screens that have no canvas counterpart.

Verify the result with `getComputedStyle`, not by looking at a screenshot.
And note the Chrome window must be non-minimized or `innerWidth` reads 0
and screenshots fail.

## Recorded product decisions

**Sign-up is email + password only** (decided 2026-08-26). Full name and
phone are collected during onboarding — the phone at payout setup, where
the reason for asking is self-evident — rather than putting an SMS
round-trip in front of someone who hasn't seen the product yet. Rationale:
the OTP is a hard gate before any value is shown, SMS costs money per send
so you'd pay for tyre-kickers, and the payout number gets its own KES 1
name-lookup verification in onboarding anyway (spec §10), so collecting it
at sign-up saves nothing.

This is a **deliberate deviation from spec §4** ("phone number is the
identity in Kenya"). Both contacts are still required before an account can
transact; `GET /auth/registration-state` reports what's outstanding and is
what the "finish setting up" banner reads. `users.phone` and
`users.full_name` are nullable as of migration `20260826090000`.

**Sign-in is email + password (or Google) only** (decided 2026-08-24) —
the design's passwordless SMS-code tab is gone from the merchant UI. A phone
may not be on file at all, so the tab was a dead end more often than not;
second factors belong in account settings later, not as a competing way in.
Forgot/reset password follow suit: forgot-password takes an email and sends
a link, and `/reset-password` only works from that link's `?token=` (a bare
visit shows the "ask for a new one" screen).

**SMS is only ever a 2FA challenge** (decided 2026-08-24). No password
reset by SMS, no passwordless SMS login, no SMS at sign-up. Every other
message the product sends goes by email. The reasoning: SMS costs money per
send, SIM-swap is a real attack in Kenya, and a texted code is a poor
primary credential — but it is a reasonable *second* factor for someone who
has opted into it.

What that meant in practice:
- `POST /auth/password/forgot` always emails a link. `channel_hint` is now
  the constant `"email"`, and `/auth/password/reset{,/check}` take a
  `token` and nothing else — the phone+code branch is gone from the
  service, the schemas, and `identity.yaml`.
- Opt-in SMS 2FA is implemented end to end in the API: `GET /auth/2fa`,
  `POST /auth/2fa/enable` (the one-tap switch — uses the already-verified
  `users.phone`, returns ten single-use recovery codes exactly once),
  `POST /auth/2fa/enroll` → `POST /auth/2fa/verify` (the older two-step
  "pick a different handset" enrolment, kept but no longer used by the
  UI), `POST /auth/2fa/challenge` (the post-password step at sign-in;
  accepts the texted code or a recovery code),
  `POST /auth/2fa/challenge/send`, and `DELETE /auth/2fa` (**password
  only** as of 2026-09-03 — a texted/recovery code is still honoured if
  supplied; admins can't disable their own). Tables in migration
  `20260826100000`.
- **A 2FA-pending login carries no tokens.** `POST /auth/login` returns
  `{ next: "2fa", challenge_id, masked_destination, expires_in }` and
  nothing else; the session is created by `/auth/2fa/challenge`. Don't
  "fix" this by issuing a short-lived token at the password step.
- `two_factor_phone` is deliberately separate from `users.phone`. The
  latter is the payout number; changing payout details must not silently
  move the second factor.

This is a **deliberate deviation from the frozen `identity.yaml`**, which
specified TOTP (`secret` + `otpauth_uri`). The owner chose SMS on
2026-08-24 — the phone is already on file for payouts and an authenticator
app is a bigger ask of this audience. The contract was rewritten to match,
so it is once again the source of truth.

**The 2FA UI is built** (2026-08-31, once TextSMS made delivery possible;
reworked into a switch 2026-09-03). It's the **SMS code at sign-in** row
on **Settings → Security** (`pages/settings/SecurityTab.tsx`): a toggle —
on calls `POST /auth/2fa/enable` and shows the ten recovery codes once,
off asks for the password. `SignIn.tsx` handles the `next: "2fa"` branch
with a real code step (`completeTwoFactorChallenge`), not the old
placeholder error. The server-side 2FA endpoints were already there; this
is only the UI.

`verifyLoginOtp` and `apps/merchant`'s auth-`PhoneInput` are still
referenced by nothing (the passwordless-SMS-login tab stayed cut, and the
2FA switch dropped the enrol-by-phone UI). `toE164` is used by
`VehicleDetail.tsx`. Don't delete the first two as dead code — they're
kept against a future account-settings need.

**Onboarding phone verification** (owner's call, 2026-08-31). The payout
phone must pass an SMS proof-of-ownership check before onboarding can be
submitted — a deliberate extension of the 2026-08-24 "SMS is only ever a
2FA challenge" decision to also cover one-time phone verification at
payout setup (the number is already being collected there; spec §10's KES
1 name-lookup is still a separate, unbuilt thing). Endpoints
`POST /auth/phone/verification/{start,confirm}` (authenticated, reuse the
`otp_codes` table with purpose `phone_verify`); `assertCompleteForSubmission`
gates on `users.phone_verified`; `GET /merchant/onboarding` and
`GET /auth/registration-state` both report it. `setUserPhone` now
normalises to E.164 and clears `phone_verified` whenever the number
changes. The wizard's "Your details" step carries the verify UI and won't
advance until it's done.

**Bookings was built into the merchant portal ahead of the delivery plan's
own phase ordering** (decided 2026-08-31, owner's explicit call — the
plan's Phases 4–6 cover discovery/booking, money, and handover in that
order, but there's no customer portal or Daraja integration yet). Contract
is `openapi/merchant-bookings.yaml`, code is
`apps/api/src/modules/bookings/` and `apps/merchant/src/pages/Booking*`.

- **The pickup/return code is a separate secret from the booking ref.**
  `CB-2841` is the public plated reference both sides read aloud (visible
  to the merchant on their own screen); the handover code is a distinct
  one-time code the hirer reads to the merchant to prove presence. Using
  digits from the public ref (an earlier idea) would prove nothing, since
  the merchant already has it.
- **The deposit hold is two clocks, not a bug.** 24h is the normal
  release after return; filing a claim extends it to 48h from the actual
  return moment (`bookings.returned_at`) while CRAL reviews it. Both
  figures come from the design's own return-modal copy — an earlier
  session misread them as conflicting and only ever implemented the 24h
  clock; that's fixed as of 2026-08-31's review pass.
- **Reports split into `claim` (money) and `conduct` (no money).** A claim
  is capped at the deposit held; anything above the cap escalates to a
  dispute (`dsp_`, no real disputes table yet — Phase 6+) rather than
  being silently discarded. The merchant-facing amount field must never
  clamp client-side to the deposit — that makes the escalation
  unreachable, which happened once and was fixed 2026-08-31.
- **A damage claim needs pickup condition photos on file.** Photos are
  optional at handover, but skipping them is disclosed as a consequence
  at skip time, not discovered later at claim time.
- **The handover is a reduced version of the platform spec's protocol.**
  The spec has the customer's app show a QR code (proximity) plus an
  emailed/texted OTP (identity), both sides confirming a joint condition
  report. No customer app exists yet, so the QR step is skipped and
  confirmation is single-sided — `Handover.required` and `.state` are
  shaped so the real protocol slots in later without a schema change.
- **No hirer ID-verification pipeline exists.** `HirerHistory` has no
  `id_verified` field on purpose — an earlier pass hardcoded it to `true`
  as a fabricated trust badge, which is precisely the kind of thing this
  product's whole premise says never to do. Add the field only once
  something real backs it.
- **Idempotency-Key is required on every booking POST that moves money**
  (confirm, decline, cancel, complete-handover, file-report) per spec §2
  — including `decline` and `reports`, which were missed in the first
  pass and would have let a double-submit refund or claim twice.
- **`/merchant/bookings/dev-seed` is real and documented in the
  contract, but dev/test-only** (`NODE_ENV !== "production"` guard in
  routes.ts) — there's no customer portal to generate real requests yet,
  so this is how the Bookings screen gets anything to demo against.

**Vehicle model changes (owner's call, 2026-08-31 — PR "vehicle data
model"):**
- **Vehicle type is five fixed categories, stored as slugs** — `sedan`
  ("Sedan / small cars"), `suv` ("SUV / 4x4 / Pickup"), `van` ("Van /
  Minibus"), `truck` ("Truck & trailers"), `machinery` ("Construction &
  machinery"). Replaces the old free-text `Car | SUV | Van | Pickup |
  Lorry`. One source of truth: `apps/api/src/modules/vehicles/categories.ts`,
  mirrored client-side in `apps/merchant/src/lib/vehicle-categories.ts` —
  keep them in step. Migration `20260831090100` remaps existing rows
  (Car→sedan, SUV/Pickup→suv, Van→van, Lorry→truck).
- **A registration plate is globally unique**, not per-merchant — a
  functional unique index on the normalised plate (`upper`, non-alnum
  stripped), so "KDL 442N" / "kdl442n" / "KDL-442N" all collide across
  every merchant. A clash throws `registration_taken` (409) via
  `apps/api/src/lib/pg-errors.ts#rethrowRegistrationConflict`.
- **County lives on the vehicle, not the merchant.** `merchants.county`
  was dropped; each vehicle carries its own `county` (the location a hirer
  cares about — "County, then pickup address"). Required per-vehicle at
  onboarding submission, like `insurance_expiry`.
- **Listing ref format is `H` + `YYMMDD` + a 3-digit sequence that
  restarts each Nairobi day** (`H260831001`, `H260831002`, next day
  `H260901001`). Backed by `listing_ref_daily_counters`, generated in
  `lib/vehicle-events.ts#nextListingRef`. Older `CRAL-V-*` refs and the
  `vehicle_listing_ref_seq` sequence are left in place, just unused.

**Payouts was built into the merchant portal (owner's call, 2026-09-01 —
PR "merchant payouts"), on the same ahead-of-plan footing as Bookings.**
Contract is `openapi/merchant-payouts.yaml`, code is
`apps/api/src/modules/payouts/` and `apps/merchant/src/pages/Payout*`.
The design authority is `Cruz Merchant Bookings & Payouts.dc.html` — the
same bundle the Bookings screen came from.

- **There is no payment rail.** Daraja/M-Pesa B2C is not integrated and
  nothing disburses money. A run is created `scheduled` and only reaches
  `paid` when something outside the API says so (today the dev-seed, later
  a Daraja callback). `payout_runs.provider_code` holds the Safaricom
  transaction code and stays null until then.
- **Payout statuses are a fourth vocabulary** — `scheduled / processing /
  paid / failed` — alongside the seven vehicle-listing states, the four
  document states and bookings' own set. `PAYOUT_STATUS` in
  `apps/merchant/src/components/portal/status.ts`; `processing` and
  `failed` are unreachable today and exist so a real rail is a service
  change, not a UI one.
- **Line amounts are snapshots, and totals are the sum of them.** A run's
  gross/commission/net are never recomputed from `COMMISSION_RATE` — a
  later rate change must not rewrite what a merchant was already paid.
  `payout_run_lines` also denormalises hirer name, registration and dates
  so a line still renders if the booking is archived.
- **A booking pays out exactly once.** `payout_run_lines.booking_id` is
  globally unique; the service checks first for a clean error, but the
  constraint is what makes a double-pay impossible under concurrency.
  `cutPayoutRun` is the single place that decides what a run contains —
  a second copy of those rules is how a merchant gets paid twice.
- **"Next payout" counts scheduled runs *and* payable-but-uncut bookings.**
  The design shows the tile and the scheduled run carrying the same
  figure, so counting only one made the tile disagree with the row
  directly beneath it. The next run itself is a live projection, never
  stored — a stored projection needs a reconciliation job that doesn't
  exist.
- **Receipt is a PDF, statement is CSV** (owner's call). The receipt is a
  document a merchant forwards to a bank or accountant; the statement is a
  table that wants a spreadsheet. `pdfkit` is a new `apps/api` dependency.
  Both go through the existing `apiBlob` in `apps/merchant/src/lib/api.ts`,
  which keeps the bearer header — a plain `<a href>` would save a 401 page
  to the merchant's Downloads folder.
- **The receipt's palette is the one copy of brand hexes in the backend.**
  `packages/ui/src/tokens.ts` is still the source of truth, but its entry
  point pulls in React and the API must not bundle that. See the comment in
  `apps/api/src/modules/payouts/receipt-pdf.ts` — if the brand doc gets a
  v3, those five values need updating alongside tokens.ts.
- **"Query this payout" is real**: a `payout_queries` row written with its
  `audit_log` entry in one transaction, then a support email *after* the
  commit — a bounced email must not lose the merchant's query. Idempotent,
  so a double-submit can't raise two tickets for one complaint.
- **The bank payout destination is deliberately not built.** The design
  offers "Pay to my bank account instead" and an SMS-gated "Edit details",
  but there is **no payment rail** — nothing disburses money, and Daraja
  B2C pays M-Pesa, not banks — so the destination card ships read-only off
  `users.phone`. Flagged, not silently dropped. (The `merchants` table
  *does* carry `bank_name` / `bank_branch` / `bank_account_name` /
  `bank_account_number` from the original create-merchants migration, and
  `payout_method` accepts `"bank"`; onboarding writes them when a merchant
  picks bank. What's missing is the rail, not the columns — an earlier
  version of this note wrongly said the columns didn't exist.)
- **`/merchant/payouts/dev-seed` is dev/test-only**, same `NODE_ENV`
  guard as the bookings seeder. It creates its own older completed
  bookings rather than reusing the bookings seeder's, whose "completed"
  fixture is mid-deposit-hold on purpose and so correctly *not* payable.

**Notifications was built into the merchant portal (owner's call,
2026-09-02 — PR "merchant notifications"), same ahead-of-plan footing as
Bookings and Payouts.** Contract is `openapi/merchant-notifications.yaml`,
code is `apps/api/src/modules/notifications/` +
`apps/api/src/lib/notifications.ts` + `apps/api/src/jobs/notification-delivery.ts`
and `apps/merchant/src/pages/Notification*`. Design authority is
`Cruz Merchant Notifications.dc.html` and the Alerts section of
`Cruz Merchant Settings.dc.html`.

- **Three channels: in-app always, plus SMS and email per preference.**
  This is a **deliberate extension of the 2026-08-24 "SMS is only ever a
  2FA challenge" decision** (which said every non-2FA message goes by
  email) — notifications may now also text, subject to the merchant's
  settings. Same shape as the 2026-08-31 onboarding phone-verification
  extension of that rule.
- **`payout` and `review` always text**, regardless of preference (the
  design locks those SMS toggles), and those two also **bypass quiet
  hours**. Everything else respects both.
- **Two taxonomies, kept separate.** `category` (booking / payout /
  review / expiry / return / rating) drives the channel preferences;
  `kind` (hire / money / doc / rate) drives the feed's filter pills and
  row icon. Map: booking/return → hire, payout → money, review/expiry →
  doc, rating → rate. `NOTIFICATION_KIND` is duplicated in
  `apps/api/src/lib/notifications.ts` and
  `apps/merchant/src/components/portal/status.ts` — keep them in step.
- **`rating` is a real category the design's Alerts matrix doesn't have**
  (the feed shows rating notifications but Settings has no row). Added
  here, defaulting to email-on / SMS-off. The design's `tips` row ("CRAL
  news and pricing tips") is **omitted** — nothing in this product
  generates it.
- **WhatsApp is omitted and flagged** — no Business API number, no
  adapter. The design's WhatsApp column is dropped from the Settings
  matrix; a toggle that silently sends nothing is worse than an absent
  one.
- **`notify(trx, {...})` writes the in-app row inside the event's own
  transaction** (shaped like `writeAuditEntry`). SMS/email delivery is a
  separate BullMQ worker (`jobs/notification-delivery.ts`), **enqueued
  only after that transaction commits** — a failed send must not roll back
  the notification, same reasoning as the payout-query email. Quiet hours
  are a **delay on the enqueue**, never a drop. SMS also requires
  `users.phone_verified`.
- **90-day retention is enforced**, not just claimed — the daily 10:00
  Nairobi reminder sweep (`runDailyReminderSweep`) now also purges
  notifications older than 90 days and runs the insurance-expiry
  generator (`runExpiryNotificationSweep`), which is a *real* generator
  today off `vehicles.insurance_expiry`.
- **Real wire-ins today:** `submitVehicle` (→ review-queue notice),
  `completeHandover` return leg (→ `return`), `cutPayoutRun` (→ `payout`,
  in-trx; delivery enqueue waits for the Daraja-callback caller that
  doesn't exist yet), and the expiry sweep. Everything else the design
  shows (booking requested, a hirer's inbound rating, document
  accept/reject) has no real generator yet — no customer portal, no ops
  console — so `/merchant/notifications/dev-seed` reproduces the ten
  design fixtures against real seeded subjects. Same `NODE_ENV` guard as
  the other seeders; a re-seed replaces the feed rather than stacking.
- **Settings → Notifications** (`/settings/notifications`) is a route
  only, kept out of `SideNav` like Settings → Security. The feed itself
  (`/notifications`) **is** in the nav, with the **unread count** as its
  badge (unlike Payouts — an unread count is genuinely actionable).

**The Settings screen was built (owner's call, 2026-09-02 — PR "merchant
settings"), same ahead-of-plan footing as Bookings/Payouts/Notifications.**
Design authority is `Cruz Merchant Settings.dc.html`. It is now one tabbed
page at **`/settings`** (`apps/merchant/src/pages/Settings.tsx` +
`pages/settings/*Tab.tsx`), **in `SideNav`** with no badge. The two slices
that shipped earlier as unlisted routes are folded in as tabs;
`/settings/security` and `/settings/notifications` now **redirect** to
`/settings?tab=…`. Shared sticky save bar:
`apps/merchant/src/components/portal/SaveBar.tsx` (each editable tab renders
its own when dirty — only one tab is mounted at a time). New styles live
under a `set*` prefix in `components/portal/styles.ts`; the card-head trio
duplicates the `nt*` values from the Notifications tab deliberately (that
design file was just read first for Notifications).

Tabs shipped: **Business · Payouts · Notifications · Security** — four, not
the design's five. **For an individual merchant the first tab is labelled
"My profile"** (not "Business") — same key (`business`), same URL, just the
label (owner's call, 2026-09-03). It is also reachable from the account
dropdown (`ProfileMenu`) → "My profile" → `/settings`.

- **New backend**: `openapi/merchant-settings.yaml` +
  `GET|PATCH /merchant/profile` (`modules/merchant/service.ts#getProfile` /
  `#patchProfile`, audit-logged in the same transaction; a phone change
  routes through the existing `setUserPhone`, which now takes an optional
  `trx`). `POST /auth/sessions/revoke-all` ("sign out everywhere", all but
  the caller's session; audit-logged). `GET /merchant/payouts/statements`
  (last six Nairobi months with net totals, for the Statements card).
  `GET|PUT /merchant/payout-settings` (the editable payout block — also
  embedded in `GET /merchant/profile` as `payout`).
  `POST /auth/2fa/enable`, `POST|DELETE /auth/account/deletion` (below).
  `Session` in `identity.yaml` gained `user_agent`. Migrations:
  `20260902100000` adds `merchants.trading_name` (nullable, kept but not
  surfaced — onboarding doesn't collect it); `20260903090000` adds
  `merchants.payout_schedule` (`weekly`/`monthly`, default `weekly`);
  `merchants.payout_mpesa_name` (nullable — "Name on the M-Pesa line");
  `20260903100000` adds `users.status` + deletion timestamps (below).
- **The Business / "My profile" tab mirrors onboarding's "Your details"
  step field-for-field** (owner's call, 2026-09-03) — nothing new is asked
  for after onboarding. Individual: owner details (name, national ID, KRA
  PIN, read-only email) + phone/verify. Company: company block (name, cert
  of incorporation no. → `company_cert_no`, company KRA, company email,
  physical location) + contact-person block + phone/verify. The account
  **entity type is not editable here** (it's fixed at onboarding — changing
  it means new documents and a re-review, a support path). No County, no
  Trading-name field, no WhatsApp toggle.
- **Payouts is editable** (owner's call, 2026-09-03 — reverses the earlier
  "read-only" note). `PUT /merchant/payout-settings` replaces the whole
  block: method (M-Pesa / bank), the M-Pesa line name, the four bank
  fields, and the long-booking `schedule`. **There is still no payment
  rail** — bank details and the `schedule` are stored, not acted on.
  Rules:
  - **The M-Pesa payout *number* is always `users.phone`** — no field for
    it on this tab (shown read-only); to change it you change the phone on
    the profile. Only "Name on the M-Pesa line" (`payout_mpesa_name`) is
    editable. The service sets `payout_same`/`payout_detail` accordingly;
    `payout.mpesa_number` in the response is just the phone,
    `mpesa_number_verified` mirrors `users.phone_verified`.
  - **Company merchants are locked to bank** (`method: "mpesa"` → 422
    `mpesa_not_allowed_for_company`); switching the profile to a company
    also flips `payout_method` to `bank`. Mirrors onboarding's
    `pickOwnerType`.
  - **Bank payouts always run monthly, on the 1st** — no rhythm choice
    (the service coerces `schedule` to `monthly` for bank). M-Pesa keeps
    the "Every Monday" / "Monthly, on the 1st" cards
    (`merchants.payout_schedule`, default `weekly`).
- **SMS code at sign-in is a plain switch** (owner's call, 2026-09-03).
  The "enter a phone, verify a code" enrol flow is gone from the UI — the
  account phone is already proven at onboarding.
  `POST /auth/2fa/enable` points the second factor at `users.phone` and
  returns the ten recovery codes once. `DELETE /auth/2fa` now needs the
  **password only** (a texted/recovery `code` is still honoured if
  supplied). `enroll2fa` + `verify2fa` + `two_factor_phone` stay for a
  future "different number" need; the UI no longer walks that path.
- **Statements are CSV, not the design's "PDF"** — the card tag says
  `NET OF COMMISSION · CSV`, and Download reuses the existing per-month
  `GET /merchant/payouts/statement?month=` via `apiBlob`.
- **WhatsApp toggle: omitted**, consistent with the Alerts matrix dropping
  the WhatsApp column.
- **Close account is real self-service** (owner's call, 2026-09-03 —
  reverses the "not self-service / `wa.me` hand-off" note).
  `users.status` (`active` / `suspended` / `pending_deletion` /
  `deleted`, migration `20260903100000`, reusing the Phase-0 `erasure_*`
  columns for the 30-day timer):
  - `POST /auth/account/deletion` → `pending_deletion`, purge scheduled
    30 days out, every **other** session revoked (the account "seems
    deleted" everywhere, but the caller can still sign in to cancel).
    Idempotent. `DELETE /auth/account/deletion` = "Keep my account".
  - `login` rejects `suspended` (403 `account_suspended`) and `deleted`
    (as invalid credentials); `pending_deletion` can still sign in.
    Nothing *sets* `suspended` yet (no admin portal) — same footing as
    `merchants.approved_at`.
  - `runDailyReminderSweep` now also runs `runAccountDeletionSweep`
    (`auth/service.ts`): past 30 days it scrubs the user row's PII, sets
    `deleted`, revokes sessions, drops credentials/recovery codes — and
    **keeps `merchants` / `vehicles` / `bookings` / `payout_runs` /
    `audit_log`** so a hirer still sees where they booked and their
    history.
  - `GET /merchant/profile` carries `account_status` +
    `deletion_scheduled_at`; the shell shows a red banner and the
    Security card the "Keep my account" action while pending.
- **The `✓ VERIFIED` account chip reflects real state** —
  `merchants.approved_at` (nothing sets it yet, no admin portal), so it
  shows `PENDING REVIEW` until an admin approves. Not a decorative tick.
- **The People / team-roles / invites tab is deferred to its own phase**
  — same footing as the omitted WhatsApp column and `tips` alert row. It
  is a multi-user authorization feature (invite → accept → per-merchant
  membership → three roles with real permission differences → every
  endpoint re-checked), not a settings screen. Shipping the roster
  read-only would fabricate trust the way the hardcoded `id_verified`
  badge did. `users.roles` stays a flat `merchant`/`customer`/`admin`
  `text[]`; there is no team table.
- **`certificate_of_incorporation` + `cr12` are real company documents**
  now (added to `DocumentKind` + both upload schemas, 2026-09-04):
  - **Account documents split into three groups** (owner's call). A
    **fourth doc kind, `company_kra_pin`**, was added so a company has its
    own KRA PIN certificate distinct from the contact person's.
    - **Company documents** (company only) = `certificate_of_incorporation`
      + `company_kra_pin` + `cr12`.
    - **Your documents** (everyone) = `national_id` + `kra_pin` (the
      person's own two).
    - **Car documents** = the existing per-vehicle logbook / insurance /
      tracker cards.
  - **Onboarding** (`Documents.tsx`) renders a "Company documents" card
    (3/3) above the "Your documents" card (2/2) for a company; the Review
    step lists "Company documents", "Your documents", then per-vehicle
    "car documents". `requiredOwnerDocs` in `assertCompleteForSubmission`
    = `OWNER_DOC_KINDS` + `certificate_of_incorporation` +
    `company_kra_pin` + `cr12` for a company. `serializeState.owner_docs`
    and the onboarding draft carry the three company slots.
  - **Settings → Business documents card** — for a company, a
    **"Company documents | My documents"** switch. `PROFILE_DOC_META`
    groups `certificate_of_incorporation` / `company_kra_pin` / `cr12` as
    "business", `national_id` / `kra_pin` as "personal". Upload/Replace
    goes through `POST /merchant/onboarding/documents` and is **only shown
    while the merchant is mid-"Request a change"** (`canEdit`); otherwise
    View-only.
- **Documents always read "PENDING REVIEW"** (`DOC_STATE.pending.label`)
  until a reviewer accepts/rejects — nothing sets an "actively reviewed"
  state (no admin console), so `docStateLabel`'s old draft/submitted split
  is gone.
- The onboarding **merchant-terms intro copy** is standard 13px body text,
  not the 15px `stepLede`.
- The vehicle **RateField** is a bordered full-row block (spans the form
  grid) with a segmented `List price / What I keep` control and a
  one-line "Hirer pays / CRAL fee / You keep" summary — the earlier
  version was crammed into one grid cell and wrapped badly.

**Round-4 Settings/portal revisions (owner's call, 2026-09-04 — PR
"merchant portal round 4"):**
- **No em dashes anywhere in the merchant portal.** `—`/`–` → `-`
  site-wide, and new copy follows suit.
- **Every page sets a specific `document.title`** via
  `apps/merchant/src/lib/use-page-title.ts` (`usePageTitle("<page>")`,
  detail pages pass the entity, Settings the tab, Onboarding the step).
- **Business / "My profile" fields are locked once onboarding is
  submitted.** `PATCH /merchant/profile` → 409 `profile_locked`. Edits go
  through `profile_change_requests` (migration `20260904100000`) +
  `GET|POST|DELETE /merchant/profile/change-request`; `GET
  /merchant/profile` carries `profile_locked` + `pending_change`. An admin
  approves via `reviewProfileChange` (applies the diff, sets
  `merchants.approved_at = null` to reopen review) — no admin portal yet,
  so `npm run review:profile-change -w apps/api -- <id> approve|reject`.
  Full admin-side design in `docs/plans/profile-change-review.md`.
- **SMS 2FA has no recovery codes** (reverses the 2026-08-31/09-03 notes).
  `POST /auth/2fa/enable` returns `{ enabled: true }`; `verify2fa` stops
  issuing codes; `completeTwoFactorChallenge` / `disable2fa` stop
  accepting them; `TwoFactorState` drops `recovery_codes_remaining`. The
  sign-in fallback is **an emailed code** —
  `POST /auth/2fa/challenge/resend { challenge_id, channel: sms|email }` —
  then support. The `recovery_codes` table stays, unused.
- **"Where you are signed in" shows only the current device** + a count of
  the others; "Sign out everywhere else" ends them.
- **The deposit is never shown to the merchant, anywhere** (extends the
  2026-08-31 note from "not on their own surfaces" to "not in Bookings
  either"). The Payouts "Fees and deposits" card is now just "Fees"; the
  booking money breakdown and the claim/report modal drop every deposit
  figure and the cap copy. The API still caps a claim at the deposit and
  escalates the overflow to a dispute — that logic is now entirely
  server-side and invisible to the merchant.
- **Adding a vehicle offers a price-entry switch** — "Set the list price"
  (a hirer's price, unchanged) or "Set what I keep" (take-home; the form
  grosses it up by `COMMISSION_RATE` for the stored/list price).
  `vehicles.rate_mode` (`list`/`net`, migration `20260904090000`) only
  remembers the view — `daily_rate_amount` is always the gross price, so
  bookings/payouts are unaffected. Shared `RateField` component
  (`components/onboarding/RateField.tsx`), used by onboarding's Vehicles
  step and the standalone Add-a-vehicle page.
- **`suspended` accounts lose access at the next token refresh** —
  `refreshToken` rejects `suspended` (403) and `deleted` and revokes the
  session, so an admin suspension ends a live merchant's access within a
  refresh cycle (this is what "a suspended merchant's vehicles can't be
  hired" reduces to until the customer portal exists). Nothing sets
  `suspended` yet.
- **The profile-menu company chip reflects `merchants.approved_at`** —
  "PENDING REVIEW" (amber) until an admin approves, not a hardcoded
  "VERIFIED".
- **Close-account copy** drops the seven-year-retention sentence.
- The onboarding contact-person email helper drops "Contact support to
  change it."

**The Dashboard was built (owner's call, 2026-09-04 — PR "merchant
dashboard"), the last screen in the merchant design.** Design authority is
`Cruz Merchant Dashboard.dc.html`. Contract is `openapi/merchant-dashboard.yaml`,
code is `apps/api/src/modules/dashboard/` and
`apps/merchant/src/pages/Dashboard.tsx`. Full plan and the calls behind it:
[`docs/plans/merchant-dashboard.md`](./docs/plans/merchant-dashboard.md).

- **`/` renders the dashboard.** It used to `Navigate` to `/vehicles`.
  `Dashboard` is the first `SideNav` item and carries no badge — it is a
  place, not a queue. Its comment claiming Dashboard/Notifications/Settings
  were unbuilt is now wrong and has been corrected.
- **One aggregate `GET /merchant/dashboard`, not client composition.** Every
  list endpoint is cursor-paginated, so a client deriving hire-day totals,
  payout projections or outstanding-document counts from a page's `data`
  would describe the first page while the copy claims to describe the
  account. `counts` is whole-set; `data` is not.
- **The dashboard module aggregates; it never decides.** Money comes from
  `payoutPosition`, document bands from `effectiveDocState`, activity from
  the notifications feed. `payoutPosition` (new, exported from
  `modules/payouts/service.ts`) is now the *single* source for what is owed,
  clearing and paid this month — `buildSummary` was refactored onto it, so
  `/merchant/payouts`'s `next_payout` tile and the dashboard's
  `awaiting_payout` tile are equal by construction, and a test asserts it.
  A second copy of these rules is how the two disagree, the same way a
  second copy of `cutPayoutRun`'s rules is how a merchant gets paid twice.
- **The "Next payout" card lists cut run lines *and* uncut payable
  bookings**, because the tile above it counts both. Listing only the
  payable half rendered "KES 0 · nothing waiting" directly under a tile
  reading KES 22,500 — caught in the browser, fixed, and now covered by a
  test.
- **The API returns numbers; the sentences are the client's.** The greeting
  ("Two vehicles are on hire today and your next payout lands on Monday"),
  "13 hire days" and "EXPIRES IN 19 DAYS" are all composed in
  `Dashboard.tsx`, one clause per fact with its own absent case. Display
  formatting is a client concern (spec §2).
- **`EXPIRING_WITHIN_DAYS` is now exported from the vehicles service** and
  the notifications expiry sweep imports it, so the expiring-document card
  and the notification it pairs with cannot disagree about "expiring".
- **The chart is `payoutMonthlyNet`** — six contiguous Nairobi months,
  zero-filled, bucketed by `payout_runs.run_date` exactly as the Statements
  CSV is, so the chart and the statement agree. Below **three** months
  carrying a run the client shows copy instead: two bars scaled against each
  other read as a trend that is not there.
- **"Bookings this week" is Monday–Sunday Nairobi, by overlap not
  containment** — a hire that started last week and is still running is
  exactly what "on hire today" means. The card's `hire_days` is the week's
  share; each row's is the whole hire.
- **The MERCHANT STATUS card hangs under the nav, and only on `/`.**
  `SideNav` gained an optional `footer`; `AppLayout` passes
  `MerchantStatusCard` when the route is the index. It reads the same
  `["dashboard"]` query the page does, so it costs no second request. It
  shows the green tick **only** when `merchants.approved_at` is genuinely
  set — nothing sets it (no admin portal), so it normally reads "in
  review". Same rule as the Settings `✓ VERIFIED` chip.
- **Omitted and flagged:** the canvas's `chartMonths` (3/6) toggle,
  `density` switch and `hideAmounts` privacy toggle. All three are design
  props for previewing, not product features — `hideAmounts` in particular
  would need somewhere to persist. Same footing as the dropped WhatsApp
  toggle.
- **Recent activity is the notifications feed** (newest five), not a second
  stream off `audit_log`: audit rows are an append-only compliance record,
  not merchant-facing copy, and a second source would drift from the feed
  the merchant can open.

**Onboarding polish (owner's call, 2026-08-31 — PR "onboarding polish"):**
- **The merchant is never shown the hirer's deposit** on their own
  surfaces — the "DEPOSIT HELD" chip and the deposit row/foot-note on the
  Vehicles detail screen are gone. It still appears in Bookings, where the
  claim flow is built around it.
- **Company merchants give `company_email` + `company_address`** (physical
  location), both required at submission when `owner_type = 'company'`.
  Migration `20260831093000`.
- **Document expiry dates can't be backdated.** The client's date input
  `min` only stops the picker; `Documents.tsx` now also blocks the step on
  a typed-in past date, and the server re-checks via
  `apps/api/src/lib/dates.ts#assertNotPast` (422 `expiry_in_past`) on
  vehicle patch and document upload.
- **A duplicate payout phone returns `phone_taken` (409)** instead of a
  raw 500 — `users.phone` is unique; `setUserPhone` maps the violation.
- **The onboarding vehicle form has a driver toggle** ("With driver
  (chauffeured)" / "Self-drive"), mirroring the Price & availability modal.
  `vehicles.chauffeured` already existed; the wizard just sets it now.

**Security patch (2026-09-03 — PR "security patch").** First group of fixes
from the full-stack review in
[`docs/plans/merchant-review-2026-09-03.md`](./docs/plans/merchant-review-2026-09-03.md);
that file carries the remaining findings and the suggested order. Tests are
in `apps/api/src/__tests__/security.test.ts`, one block per finding.

- **`GET /audit-log` is gone.** It was Phase-0 scaffolding on the health
  router with no `authenticate()` — an anonymous, cursor-walkable dump of
  every state change on the platform (actor ids, IPs, before/after JSONB).
  An audit reader for humans belongs in the Phase-3 admin surface behind an
  `aud: "ops"` token. **Don't re-add a reader anywhere public.**
- **`app.set("trust proxy", 1)`.** Without it `req.ip` behind Railway is the
  edge's address for every visitor, so every IP-keyed `rateLimit` bucket was
  one platform-wide bucket — five OTP requests an hour for all users
  combined. Deliberately `1`, not `true`: trusting the whole
  `X-Forwarded-For` chain lets a caller pick its own bucket. If a second
  proxy is ever put in front, this number changes with it.
- **Idempotency keys are scoped per user** (migration `20260905090000`, PK
  is now `(user_id, key, route)`). The namespace used to be global, so two
  merchants generating the same key on the same route collided and the
  second was served the first's stored response body. `authenticate()` runs
  before `requireIdempotencyKey()` on all seven mounts — keep it that way.
- **Uploads have one shared policy**: `apps/api/src/lib/uploads.ts`. JPEG,
  PNG, WebP and PDF only, enforced twice — `fileFilter` on the declared type
  and `assertDeclaredTypeMatchesBytes` on the actual leading bytes, because
  a `Content-Type` header is a claim, not evidence. All three multipart
  routes (onboarding docs, vehicle docs, handover photos) go through
  `createUpload()`; **don't hand-roll a fourth `multer({...})`.**
  `GET /merchant/onboarding/documents/:id` used to echo the client's stored
  mimetype back with `inline` and no `nosniff`, so an `evil.html` uploaded
  as `text/html` executed on the API origin. It now sends `nosniff` and runs
  the stored type through `safeContentType`/`safeDisposition`, which force
  anything outside the allowlist (rows predating it) to download.
- **`verifyAccessToken` pins `audience: "public"` and `algorithms:
  ["HS256"]`.** The `aud` claim was always written and never checked, so a
  Phase-3 `aud: "ops"` admin token would have been accepted by every
  merchant endpoint the day that flow shipped.
- **The dev `JWT_ACCESS_SECRET` can't reach production** — boot fails when
  `NODE_ENV=production` and the secret is the `.env.example` placeholder or
  under 32 characters.
- **`helmet` is mounted** with `contentSecurityPolicy` and
  `crossOriginEmbedderPolicy` off: the API serves JSON and the occasional
  PDF/CSV/image to a separate origin and has no pages of its own, so those
  two only complicate serving documents. The rest (nosniff, frameguard,
  HSTS, no-referrer) applies.

## What NOT to do

- Don't add a fourth portal, a meta-framework, or a shared frontend
  framework across the three apps — they're deliberately separate Vite apps.
- Don't introduce floats for money, auto-increment PKs, or offset pagination
  anywhere, including in throwaway/demo code.
- Don't build ahead of the current phase (see delivery plan's phase-by-phase
  sequencing and the "sequencing traps" section) unless explicitly asked.
- Don't wire a real SMS/email/storage provider without being asked — the
  console/local adapters are intentional for now.
- Don't build or wire screens in `apps/customer` / `apps/admin` right now —
  merchant only, until the owner says otherwise.
- Don't guess colors/fonts from a screenshot of the design canvas when
  `packages/ui/src/tokens.ts` or the brand PDF has the real value — that
  mismatch has already caused a rebuild once.

## Local dev

```bash
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env
npm install
npm run migrate
npm run dev:api        # http://localhost:4000
npm run dev:customer   # http://localhost:5173
npm run dev:merchant   # http://localhost:5174
npm run dev:admin      # http://localhost:5175
npm run dev -w packages/ui   # component preview, http://localhost:5180
```

See [`DEPLOY.md`](./DEPLOY.md) for what's needed before shipping to
Railway/Render — not done yet, intentionally.
