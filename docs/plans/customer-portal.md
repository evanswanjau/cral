# Customer portal - fully integrated

**Owner's call, 2026-09-10.** `apps/customer` is released from its Phase-0
freeze and built as a **real vertical slice**, not a UI shell: a booking
made by a renter is a real `bookings` row that the merchant sees in their
existing Bookings screen and Ops sees in a new admin lens.

Design source is the "Cruz Ride Auto - Website" canvas bundle. Pull the
canonical `.dc.html` from the canvas via the Chrome MCP ritual in
CLAUDE.md (`ListFiles` -> `GetFile`) rather than reverse-engineering the
export; the export was unpacked only to confirm the screen inventory.

## Decisions taken

| Question | Call |
| --- | --- |
| Integration depth | **Full vertical.** Real bookings, visible to merchant and admin. |
| Customer auth | **Email + password**, same as merchant. The design's phone-OTP tab is dropped. |
| `verifyOtp` login hole | **Patched first**, as its own change, before anything else. |
| Renter documents | **ID + driving licence required.** Uploaded before a booking request; Ops-accepted before pickup keys. |
| Document storage | **Extend `documents`** with a nullable `user_id`. One review vocabulary, one decision path. |
| Payment | **No payment concept yet.** Money is settled offline. M-Pesa screens are dropped from the flow. |
| SEO | **Build-time prerender + JSON-LD + sitemap.** No meta-framework. |

## What the existing schema already gives us

Verified against the code, and it is more than expected:

- **`bookings` is already shaped for the customer side** -
  `hirer_id -> users`, `status` defaults to `requested`, `response_due_at`
  (the design's "the clock is on the owner now"), `note_from_hirer`,
  gross / commission / merchant_net / deposit money pairs,
  `rating_open_until`. A customer-created `requested` row appears in the
  merchant Bookings screen **with no change to that screen**.
- **`handovers`** already carries `otp_code_hash`, `otp_attempts`,
  `masked_destination` - the renter's side of the pickup code needs a read
  endpoint, not a schema change.
- **`getHirerHistory`** deliberately omits an `id_verified` field with a
  comment saying no pipeline exists. This slice **builds that pipeline**,
  so the field can finally be added and be true.

## Blockers and honesty risks - read this first

### 1. The deposit is now a promise nothing keeps

This is the most serious consequence of "no payment concept yet".

- The public design's core trust line is **"Nobody holds your deposit but
  us."** With no rail, CRAL holds nothing.
- `bookings.deposit_amount` is still computed and stored, and the
  **merchant's claim flow is built on it** - a claim is capped at the
  deposit and the overflow escalates to a dispute. That would be claiming
  against money that does not exist.
- `cutPayoutRun` pays merchants for completed bookings. With nothing
  collected, a payout run schedules payment of money never received.

**Resolved (owner, 2026-09-10): the deposit copy changes to what is
true.** Across the customer portal - the home page, `/how-we-protect-you`,
the car detail page and the booking review - the deposit is described as
**agreed between the hirer and the owner and settled directly at
handover**, not held by CRAL. "Nobody holds your deposit but us" and any
equivalent line is removed. What CRAL still does and can still say: read
the renter's ID and licence once, show the owner a verified name, run the
booking record, keep every receipt in one place. `bookings.deposit_amount`
stays computed and stored as the agreed figure both sides see; nothing in
this slice claims CRAL custody of it. When a real rail lands, the copy and
the custody move together.

### 2. `notifications.merchant_id` is `NOT NULL`

The notifications table is merchant-scoped, so **a renter cannot receive
an in-app notification at all**. "Your request was accepted" needs either
the same nullable-`merchant_id` + `user_id` treatment as `documents`, or
renter-facing messages go by email only. Recommendation: mirror the
`documents` change so there is one notification system, not two.

### 3. Real bookings will exercise untested merchant paths

The merchant Bookings screen has only ever run against `dev-seed`, whose
fixtures are curated. Real data hits cases the seed never produces: a
first-time hirer with zero completed hires, a hirer with no rating
history, a request that expires unanswered. Worth a deliberate pass over
`serializeBooking` / `getHirerHistory` with empty-state data.

### 4. Notification cost becomes real

`category: booking` notifications currently have no generator. Once
renters create requests, every one texts and emails a merchant subject to
their preferences. That is real TextSMS and Resend spend, per booking.

### 5. The public catalog must not leak merchant PII

`vehicles` becomes publicly readable for the first time. The catalog
serializer needs a strict allowlist projection - no owner phone, KRA PIN,
payout details, document rows or `reviewer_note`. Treat this as the
security-critical file in the slice.

## Backend work

### Migration A - renter documents

- `documents.merchant_id` -> nullable; add nullable `user_id` (FK
  `users`, `ON DELETE CASCADE`); `CHECK` that exactly one of the two is
  set; index `user_id`.
- `DocumentKind` gains **`driving_licence`** (previously omitted as
  "never collected").
- `DocumentRow.merchant_id` becomes `string | null`. **This is the one
  change that touches merchant and admin code** - the compiler flags every
  read site. All of them already filter `where merchant_id = ...`, so
  behaviour is unchanged; the churn is mechanical and compiler-caught.

### Migration B - renter notifications

Same treatment for `notifications.merchant_id` (nullable + `user_id` +
CHECK), so `notify(trx, {...})` can address a renter.

### `openapi/customer-catalog.yaml` (public, unauthenticated)

- `GET /catalog/vehicles` - cursor-paginated search. Filters: city/county,
  dates, max price, category, seats, transmission, owner type, verified,
  delivery, sort.
- `GET /catalog/vehicles/{id}` - detail.
- `GET /catalog/collections` - the eight curated rails (popular,
  roadtrip, weekend, budget, family, executive, airport, upcountry),
  rules defined server-side.
- **The two-gate filter lives in exactly one place**: `vehicles.status =
  'live'` **and** `merchants.approved_at IS NOT NULL`. A second copy of
  that predicate is how a paused or unapproved car ends up public. Same
  rule as `cutPayoutRun` and `payoutPosition`.
- Availability excludes vehicles with an overlapping `confirmed`/`active`
  booking.
- Public rate limiting; no auth; strict PII projection (risk 5 above).

### `openapi/customer-bookings.yaml`

- `POST /bookings` - **`Idempotency-Key` required**. A double-submit
  creating two requests is exactly what the middleware is for, money or
  not.
  - **The server computes the quote.** Gross from
    `daily_rate_amount x days`, commission at `COMMISSION_RATE`, deposit
    at `DEPOSIT_RATE` (0.15 of gross). The client never computes money -
    the design's `rate x 1.5` deposit rule is wrong and is discarded.
  - Gates: both renter documents uploaded; vehicle live + merchant
    approved; dates available.
  - Writes the booking, an `audit_log` row and
    `notify(trx, {category:'booking'})` to the merchant **in one
    transaction**; delivery enqueued post-commit. This is the **real
    generator** for the booking notification the merchant portal already
    renders and has never received.
- `GET /bookings` (my trips, cursor), `GET /bookings/{id}`.
- `POST /bookings/{id}/cancel` - `Idempotency-Key`.
- `GET /bookings/{id}/handover` - the renter's pickup/return code, which
  they read aloud to the merchant. Distinct from the public booking ref.
- `POST /bookings/{id}/rating` - off the existing `rating_open_until`.

### `openapi/customer-account.yaml`

- `POST /me/documents` (multipart) - **through `createUpload()` in
  `lib/uploads.ts`**; do not hand-roll a fourth `multer({...})`.
- `GET /me/documents`, `GET /me/documents/{id}` - with `nosniff` and
  `safeContentType` / `safeDisposition`, same as the onboarding route.
- Renter verification state surfaced on `/me` and
  `/auth/registration-state`.

### Admin

- `openapi/admin-renters.yaml` - a **real queue** (unlike the Merchants
  directory), because Ops must accept or reject:
  `GET /admin/renters`, `GET /admin/renters/{id}`,
  `POST /admin/renters/{id}/documents/{kind}/decision`
  (`requireAdmin` **before** `requireIdempotencyKey`; writes `documents`,
  `audit_log` and a renter notification in one transaction).
- `openapi/admin-bookings.yaml` - a **read-only directory**, following
  the Merchants-lens precedent ("approving a vehicle does not verify the
  business - those are two separate decisions"). No intervention
  endpoints; cancel / refund / dispute belong to Phase 6.
- `platform_settings` gains `renter_approval.required_document_kinds`
  (`national_id` + `driving_licence`) and an SLA, alongside the existing
  `vehicle_review` / `merchant_approval` blocks.
- `SideNav` gains **Renters** and **Bookings** with `built: true`.

### Handover gate

`completeHandover` for `kind: 'pickup'` requires the hirer's
`national_id` **and** `driving_licence` at `review_state = 'ok'`, else 422
`hirer_documents_not_accepted`. The merchant's booking detail shows the
hirer's verification state up front so they are not surprised at the car,
and `getHirerHistory` finally gains a **real** `id_verified`.

## Frontend - `apps/customer`

Conventions are the merchant portal's, verbatim: self-hosted
`@fontsource` fonts via a copied `fonts.css` (Archivo **wdth+wght**
variable cut, `font-variation-settings:'wdth' 110` / 106 on sub-heads),
tokens from `packages/ui/src/tokens.ts`, canvas screens reproduced with
their own inline styles, `usePageTitle` on every page, two-level
`ErrorBoundary`, `queryClient` that does not retry 4xx, **no em dashes**.
Add the three `@fontsource*` packages and `@phosphor-icons/react` to
`apps/customer/package.json` only.

### Routes

Public: `/`, `/how-it-works`, `/how-we-protect-you` (subject to the
deposit-copy decision), `/corporate`, `/about`, `/help`, `/contact`,
`/legal`, `/list-your-car`, `/browse` (filters in the querystring),
`/cars/:id`.

Auth: `/sign-in`, `/create-account`, `/forgot-password`,
`/reset-password` - email + password, `?next=` resume.

Gated: `/book/:id` (review -> confirm request, no payment step),
`/trips`, `/trips/:id` (with the handover code), `/documents`,
`/account`.

**`/trips` and `/documents` are now required**, which reverses the earlier
"this design file only" call - a real booking has to be visible to the
renter who made it. Their screens live in `Cruz Customer Portal.dc.html`,
so that canvas file needs pulling as part of PR 6.

### SEO

- Build-time prerender of the static marketing routes to real HTML via a
  small post-`vite build` script using `react-dom/server` (already
  available; not a meta-framework, no new runtime).
- Per-route `title` / description / canonical / OG through a small head
  context that the prerenderer collects.
- JSON-LD: `Organization`, `BreadcrumbList`, `FAQPage` on `/help`,
  `Vehicle`/`Product` on car pages. **`AggregateRating` only where real
  ratings exist** - emitting it over seeded data is structured-data spam
  and the same fabrication mistake.
- `robots.txt`; `sitemap.xml` generated from live listings (served by the
  API, mapped at the edge - see deployment).

## Deployment

- New `cral.co.ke` apex vhost alongside the existing merchant / admin /
  api hosts. **Careful with DNS**: that apex carries the Resend TXT/MX
  records for `noreply@cral.co.ke`.
- **`CORS_ORIGINS` must include the customer origin.** `apps/api`'s
  built-in default already lists `http://localhost:5173`, but the moment
  `CORS_ORIGINS` is set explicitly it *replaces* the default - a local
  `.env` carrying `CORS_ORIGINS=http://localhost:5174,http://localhost:5175`
  (merchant + admin only) makes every customer-app fetch fail CORS with
  no `Access-Control-Allow-Origin`. Hit this in local dev on 2026-09-10;
  fixed by adding `:5173` to `.env`. Production/staging `CORS_ORIGINS`
  needs the real customer host added the same way.
- nginx rewrite for `/sitemap.xml` -> the API route.
- `~/redeploy.sh` gains the customer build.

## PR breakdown

1. **`verifyOtp` security patch** - status + 2FA checks on the OTP login
   branch, so a texted code cannot bypass account suspension or opt-in
   2FA. Standalone, ships first, independent of everything else. Tests:
   `apps/api/src/modules/auth/__tests__/otp-login-gates.test.ts` (its own
   file rather than `security.test.ts`, which is scoped to the 2026-09-03
   review). **[shipped - PR #14, base `develop`; full `apps/api` suite +
   workspace typecheck/lint green]**
2. **Public catalog API** - `openapi/customer-catalog.yaml` frozen first,
   then the read endpoints (`GET /catalog/vehicles`,
   `/catalog/vehicles/{id}`, `/catalog/vehicles/{id}/photos/{photoId}`,
   `/catalog/collections`) with the two-gate filter in one place and the
   PII allowlist projection. **No migration** - the catalog reads only
   existing columns, so this PR is a pure addition and touches no merchant
   or admin code. Migrations A and B move to the PRs that first need them
   (4 and 6), where the compiler fallout is reviewed next to the code
   that depends on it. **[built - branch `feature/customer-catalog`;
   module `apps/api/src/modules/catalog/`; 10 tests green, full `apps/api`
   suite 207 green, workspace typecheck/lint green]**
3. **Customer app foundation + marketing** - fonts, tokens, shell,
   routes, prerender pipeline, the static pages. Deposit-copy decision
   lands here. **[home page built - branch `feature/customer-home`:
   foundation (fonts/tokens/query-client/use-page-title/ErrorBoundary
   ported from merchant), `SiteShell` (masthead + footer), `Home` wired
   to `GET /catalog/collections`, `ComingSoon` placeholder for the
   unbuilt routes. Deposit copy corrected. Verified end-to-end in the
   browser against a seeded fleet. Remaining: `/browse`, `/cars/:id`,
   the seven marketing pages, the prerender step.]**
4. **Auth + renter documents** - email/password screens, plus **Migration
   A** (renter documents: `documents.merchant_id` nullable + `user_id` +
   CHECK, `DocumentKind` gains `driving_licence`, `DocumentRow` type +
   compiler fallout across merchant/admin), document upload, verification
   state.
5. **Browse + detail** - wired to the real catalog.
6. **Booking + trips** - `POST /bookings` end to end, plus **Migration B**
   (renter notifications: `notifications.merchant_id` nullable + `user_id`
   + CHECK), the merchant notification generator, `/trips` and the
   handover code. Pull `Cruz Customer Portal.dc.html`.
7. **Admin renters queue + bookings directory** - Ops review path, the
   handover gate, real `id_verified`.
8. **Docs** - CLAUDE.md updated (freeze released, phone-OTP dropped for
   customer, deposit position, renter pipeline, notification scoping),
   memory note.

## Verification

- `npm run build` / `typecheck` / `lint` green across all workspaces after
  every PR (CI is billing-locked - local is the gate).
- `apps/api` test suites green, plus new suites per module.
- Merchant and admin smoke after PR 2 specifically - that is the migration
  that touches their code.
- End-to-end: renter signs up -> uploads ID + DL -> Ops accepts -> renter
  books -> **merchant sees the request** -> confirms -> handover blocked
  until documents accepted -> completes -> **admin sees the booking**.
- Archivo width-axis check (`wdth 100` vs `110` measured).
