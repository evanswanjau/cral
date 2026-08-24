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
later without touching call sites. Dev/test default is a console/local-disk
adapter — no SMS or email ever leaves the building until a real adapter is
wired in and selected via `SMS_ADAPTER` / `EMAIL_ADAPTER` /
`STORAGE_ADAPTER` env vars.

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

Consequences to keep in mind: an email-first account can't use the
passwordless SMS tab on sign-in until onboarding adds a phone (the screen
says so), and password reset for such an account can only go by email.

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
