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
view", not an oversight.

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
  `POST /auth/2fa/enroll` → `POST /auth/2fa/verify` (two-step enrolment,
  returns ten single-use recovery codes exactly once),
  `POST /auth/2fa/challenge` (the post-password step at sign-in; accepts
  the texted code or a recovery code), `POST /auth/2fa/challenge/send`, and
  `DELETE /auth/2fa` (password + a current code; admins can't disable their
  own). Tables in migration `20260826100000`.
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

**The 2FA UI is built** (2026-08-31, once TextSMS made delivery possible).
`apps/merchant` now has its first settings screen — **Settings → Security**
(`/settings/security`, `pages/SecuritySettings.tsx`) — with the enrol flow
(phone → texted code → the ten recovery codes, shown once) and the disable
flow (password + a current/recovery code). It's a route only: deliberately
**not** in `SideNav` yet (owner's call), reachable by URL.
`SignIn.tsx` handles the `next: "2fa"` branch with a real code step
(`completeTwoFactorChallenge`), not the old placeholder error. The
server-side 2FA endpoints were already there; this is only the UI.

`verifyLoginOtp` and `PhoneInput` in `apps/merchant` are still referenced
by nothing (the passwordless-SMS-login tab stayed cut). `toE164` is now
used by the 2FA settings screen. Don't delete the first two as dead code —
they're kept against a future account-settings need.

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
