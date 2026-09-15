# Customer portal - full scope to done

**Status tables refreshed 2026-09-15** against the tree - most of §1 still
described the pre-C4 state and called screens "placeholder" that are now
several hundred lines each. Remaining gaps are listed as such; the decisions
in §2 are unchanged except where marked.

**Original status note, 2026-09-11.** `apps/customer` is off its Phase-0 hold and
building as a real vertical slice: a booking a renter makes is a real
`bookings` row the merchant sees in their existing Bookings screen and Ops
sees in an admin lens. Design authority is the "Cruz Ride Auto - Website"
canvas bundle, plus `Cruz Customer Portal.dc.html` for the post-booking
screens (not yet pulled).

## 1. Where we are against the design

### Screens

| Design screen | State |
| --- | --- |
| `home` | **Done.** Hero, search bar, facts strip, 8 live collection rails, category tiles, deposit band, roadmap, CTAs, footer. Real data from `GET /catalog/collections`. |
| `browse` | **Built** (C4, 471 lines). |
| `detail` | **Built** (C4, 597 lines). "What CRAL checked on this car" is still outstanding. |
| `booking` | **Built** (C4, 460 lines). |
| `auth` | **Built** - CreateAccount/SignIn plus renter document upload (C3/C5), and sign-up now happens inline when sending a booking request rather than as a separate gate. |
| `list` (list your car) | **Built** (C10). Not from a canvas file - see C10 below. |
| 7 marketing pages | **Built** (C9), plus `parts` and `services` "coming soon" pages from the one-stop-shop pivot. Not from a canvas file. `legal` is still a holding page and needs real drafting before launch. |
| Customer Portal (trips, account, documents) | **Built** (C8) - trips, trip detail with handover state, renter notifications, account nav. Not from a canvas file. |

### Backend

| Capability | State |
| --- | --- |
| Catalog search / detail / photos / collections | **Done**, 10 tests, two-gate filter + PII allowlist |
| Payments: STK initiate + callback | **Scaffold.** Real: adapter interface, OAuth token exchange, `payment_requests` table, idempotent callback handling. **Not confirmed:** Co-op's STK path, request field names, callback shape - gated behind `COOPBANK_STK_PATH_CONFIRMED`. |
| `POST /bookings` (a renter creating one) | **Built** (C2) - `modules/customer-bookings/`, price computed server-side. |
| Customer trips: list, detail, cancel | **Built** (C8) |
| Renter's handover code | **Built** (C8) - and never shown in the customer app either, same rule as the merchant side: only a hash exists server-side and the code goes out by email. Trip detail shows the handover's state, not the code. |
| Renter ID + driving licence documents | **Built** (C5, Migration A - `documents.merchant_id` nullable + `user_id`) |
| Renter notifications | **Built** (C8, Migration B - `notifications.merchant_id` nullable + `user_id`) |
| Ratings / reviews | **Merged.** The `ratings` table and the merchant-facing hirer score are on `main`. Renter-facing reviews on the detail page are still outstanding. |
| Delivery / collection fees | Not modelled anywhere |
| Request expiry ("lapses in 4 hours") | **Done** (this row previously said nothing expired a request in the background - that was already untrue). `expireStaleBookingRequests` flips overdue `requested` bookings to `expired` with a full refund and zero commission, re-checks the status inside the transaction so a merchant answering mid-sweep wins, is covered by tests including a two-sweep race, and runs from `jobs/booking-expiry.ts`. Note the window is **12h** (spec §14), not the design's 4h copy - a real discrepancy, still unreconciled. |
| Admin renters queue | **Built** (C11, `modules/admin-renters/`) |
| Admin bookings lens | **Built** (C11, `modules/admin-bookings/`) - read-only |
| Hirer-documents gate on pickup handover | **Built** (C11) - pickup 422s unless the hirer's national_id and driving_licence both read `ok` |
| SEO: prerender, JSON-LD, sitemap | **Mostly built** (C9) - per-route meta, JSON-LD and a real `GET /sitemap.xml`. Build-time prerendering is still deliberately deferred. |
| Deploy: apex vhost, DNS, CORS | **Done** (C12) |

### Things the design requires that no plan has covered yet

1. **Handover location with a fee.** The booking review step offers
   "Collect from the owner in {area}", "Delivery to my address for
   KES 1,000", "JKIA arrivals for KES 1,500", "Wilson Airport for
   KES 1,200". There is no column for this and it is not in
   `computeBookingPricing`. It changes the total the renter pays and what
   the merchant is owed.
2. **Payment happens after acceptance, not at request.** The design is
   explicit: "Send request, pay nothing yet" -> owner accepts -> "Now the
   M-Pesa prompt". `POST /bookings/:id/pay` currently has **no status
   guard** - it would happily prompt for a `requested` or `declined`
   booking.
3. **A four-hour response window that actually lapses.** "REQUEST LAPSES
   IN {countdown}". Needs a sweep that flips overdue `requested` bookings
   to `expired`, notifies both sides, and frees the dates.
4. **Two requests for the same dates are allowed.** "Requesting two cars
   for the same dates is allowed; you only ever pay for the one you
   confirm." So the availability check must not block on the renter's own
   pending requests - only on `confirmed`/`active` ones.
5. **"What CRAL checked on this car"** on the public detail page - a ✓ per
   document kind. The catalog returns no document information today. It
   must say *that* the set cleared, never expose the documents.
6. **Reviews from completed hires only**, shown on the detail page.
7. **Hire-as-business + driver selection** for a merchant account hiring
   someone else's car.

## 2. Decisions needed before the affected PRs

These are genuine forks, not things to pick a default for.

### D1 - Deposit custody, now that a rail is being built

The 2026-09-10 decision ("the deposit is agreed with the owner, not held
by us") was made **because there was no payment rail**. The Co-op STK
scaffold changes that: one prompt can cover hire + deposit, which is what
the design says ("One prompt covers the hire and the refundable deposit.
The deposit is held by CRAL and returned the evening you bring the car
back"), and what the merchant-side claim flow was always built for.

Holding the deposit means CRAL must also be able to **return** it -
Co-op's STK is collection only. A refund path (B2C, or a manual
operations process) is a separate capability. Options:

- **(a) Collect hire + deposit, hold the deposit, refund via an
  operations process.** Matches the design and the existing claim flow.
  Needs a documented refund runbook and, eventually, a disbursement rail.
- **(b) Collect the hire only; the deposit stays owner-settled.** Keeps
  the current honest copy. The merchant claim flow then has nothing
  behind it and must be neutered.
- **(c) Collect hire + deposit but hold the deposit as credit** on the
  renter's account rather than refunding cash.

Everything in the booking flow, the home/protection copy, and the claim
path depends on this. **It blocks PR C4 and PR C7.**

### D2 - Co-op STK wire format **[resolved 2026-09-14]**

Pulled directly from the portal's own OpenAPI document for the
SafaricomSTKPush resource. `coopbank-adapter.ts` and
`payments/service.ts#handleCallback` now implement the real shape - not
Daraja-shaped. Five request fields (`MessageReference`, `TargetMSISDN`,
`CallBackUrl`, `TransactionAmount`, `TransactionNarration`), no
shortcode/passkey/timestamp - Co-op's proxy resolves the receiving account
server-side against the app's own registration. `MessageReference` is
*ours* (generated before the call, ≤27 chars - a raw `ulid()`), echoed
back verbatim in both the sync ack and the async callback, so that's what
correlates the callback - never a provider-issued id.
`COOPBANK_STK_PATH_CONFIRMED` still gates it (still `false` by default);
flipping it only asserts the shape is right, not that D3 is answered too.
Their portal's Callback URL still needs pointing at the real
`COOPBANK_CALLBACK_URL` before this can fire for real.

### D3 - Callback authentication

Still open. The confirmed OpenAPI document has nothing on this - no
signature header, no shared secret, no published IP range documented.
The callback endpoint currently trusts its own obscurity. Ask Co-op
support / the relationship manager directly (it isn't in the API docs).
**Do not point real money at this before it's done** - `COOPBANK_STK_PATH_
CONFIRMED=true` is not sufficient on its own.

### D4 - Delivery fees

Are the design's figures (1,000 / 1,500 / 1,200) platform-set, or does
each merchant set their own delivery options and prices? Platform-set is
one `platform_settings` key; per-merchant is a table plus merchant-portal
UI. **Blocks PR C4.**

### D5 - Reviews

`feature/portal-round-5-ratings` is unmerged. Merge it first, or defer
the detail page's review block and ship the rest.

## 3. The plan

Numbered `C*` so they don't collide with the earlier numbering. Each is
one PR. Contract-first: the `openapi/` file is written and frozen before
the code that implements it.

### C1 - Rebase and land what exists

`feature/payments-coopbank` carries the payment scaffold. Confirm the
catalog + home work is in `develop` (PR #15 merged), rebase payments onto
it, get the full suite green, merge. No new behaviour.

### C2 - `POST /bookings`: a renter can request a car

**The keystone.** Contract `openapi/customer-bookings.yaml`.

- `POST /bookings` - `Idempotency-Key` required. Body: vehicle id, dates,
  handover choice, note, hire-as (personal/business), driver.
  - **The server computes the quote.** `computeBookingPricing` from the
    vehicle's own `daily_rate_amount`. The client never computes money.
  - Gates: vehicle live + merchant approved (reuse `baseCatalogQuery`'s
    predicate - one copy); dates free of `confirmed`/`active` bookings
    (a renter's own pending requests do **not** block, per the design);
    minimum hire days; renter documents uploaded (see C5).
  - Writes `bookings` + `audit_log` + `notify(trx, {category:"booking"})`
    to the merchant in one transaction, delivery enqueued post-commit.
    **This is the real generator** for the booking notification the
    merchant portal has always rendered and never received.
  - Sets `response_due_at` to +4 hours.
- `GET /bookings`, `GET /bookings/{id}`, `POST /bookings/{id}/cancel`.
- `GET /bookings/{id}/handover` - the renter's pickup/return code.
- **Request-expiry sweep** in `runDailyReminderSweep`'s family (needs to
  run more often than daily - a dedicated short-interval job): overdue
  `requested` -> `expired`, notify both sides, free the dates.
- Migration: `bookings` gains the handover-location choice and its fee
  (pending D4).
- A deliberate pass over `serializeBooking` / `getHirerHistory` with
  real first-time-hirer data - the merchant screen has only ever seen
  curated `dev-seed` fixtures.

### C3 - Browse and car detail

- `/browse` - filters in the querystring, Cards/List switch, sort,
  result count, empty state, paging off the existing cursor.
- `/cars/:id` - gallery, spec grid, owner card, quote panel, "Request
  these dates" -> `/book/:id`.
- Catalog additions: a `documents_cleared` summary for "What CRAL checked
  on this car" (booleans per kind, never the documents), and review
  data if D5 says so.

### C4 - The booking flow, stages 1-2

`/book/:id`, auth-gated (`/sign-in?next=/book/:id`).

- **Review** - identity card, licence-pending warning, who-is-this-for,
  driver select, handover location + fee, note, money breakdown.
  "Send request, pay nothing yet."
- **Waiting** - "The clock is on the owner now", live countdown off
  `response_due_at`, SMS notice, keep-browsing copy.
- Depends on D1 (what the money breakdown says) and D4 (delivery fees).

### C5 - Renter identity: auth to the design + documents

- Rebuild the four auth screens to the canvas: two tabs, the "HOLDING FOR
  YOU" car panel when arriving from a booking, `?next=` resume. Email +
  password (the phone-OTP tab stays cut per the 2026-08-24 decision).
- **Migration A**: `documents.merchant_id` nullable + `user_id` +
  `CHECK` exactly one; `DocumentKind` gains `driving_licence`.
  `DocumentRow.merchant_id` becomes `string | null` - **the only change
  in this whole plan that touches merchant and admin code**; mechanical
  and compiler-caught.
- `POST /me/documents` via `createUpload()` (do not hand-roll a fourth
  multer), `GET /me/documents`, `GET /me/documents/{id}` with `nosniff`
  and `safeContentType`.
- Upload required before a booking request; Ops acceptance required
  before pickup keys (the design's own rule).

### C6 - Payment, stages 3-5

- Confirm D2/D3, flip `COOPBANK_STK_PATH_CONFIRMED`, point their portal
  at the real callback URL.
- **Add the missing status guard**: `POST /bookings/:id/pay` must require
  `confirmed`, and reject an already-paid booking.
- Client stages: "Now the M-Pesa prompt" (method, phone, total, the
  never-share-your-PIN warning), "Check your phone" with poll + resend,
  "Paid and confirmed".
- `GET /bookings/{id}/payment` for the client to poll while the callback
  lands.
- Reconciliation: a sweep that ages out `pending` payment requests past
  `expires_at`, and a "payment succeeded but callback never arrived"
  path.

### C7 - Deposit handling

Per D1. If (a): the prompt covers hire + deposit, `bookings.deposit_*`
becomes genuinely held, the refund runbook is written, the merchant claim
flow is switched back on, and the home/protection copy returns to the
design's wording. If (b): the claim flow is neutered and the copy stays
as it is now.

### C8 - Trips and account (the Customer Portal canvas) **[shipped]**

Trips list and trip detail already existed (built alongside C2); this slice
is Migration B and everything it unblocks. **Not pulled from
`Cruz Customer Portal.dc.html`** - no canvas tab was reachable this
session, same footing as C9/C10 - built from confirmed tokens and the
established visual idiom, flagged for a swap once that file is pulled.

- **Migration B**: `notifications.merchant_id` nullable + `user_id`
  (`20260914090000_notifications_add_user_id.ts`), same CHECK-one-owner
  shape as Migration A did for `documents`. `notify()` now takes exactly
  one of `merchantId` / `userId`.
- **A renter's own feed is real**: `GET /me/notifications`,
  `POST /me/notifications/read-all`, `POST /me/notifications/{id}/read`
  (`openapi/customer-notifications.yaml`) - the renter-scoped mirror of
  the merchant contract, minus a preferences endpoint (no renter Settings
  screen yet, so channel is always in-app + email). `ctaFor()` branches on
  `user_id` to link `/trips/:id` rather than the merchant portal's
  `/bookings/:id` for the same booking.
- **Real generators, closing a gap that predates this slice**: confirming,
  declining or merchant-cancelling a booking, and a pickup/return code
  going out, all now write the hirer their own in-app row - previously
  only `confirmBooking` and `createHandover` emailed the hirer at all, and
  *nothing* wrote to an in-app feed for them. Email for these events is
  sent inline at the call site (`bookings/service.ts`), not through
  `notification-delivery.ts`'s merchant-scoped preference/quiet-hours
  pipeline - a renter has no merchant row for that pipeline to key off.
- **Trip detail shows handover status, never the code** - `GET
  /bookings/{id}` gained a `handovers` array (kind, state,
  `masked_destination`, timestamps). The renter's real pickup/return code
  only ever exists as a hash server-side and only ever went out by email
  (unchanged); this is "is a code on its way / has pickup or return
  happened", not a second copy of the merchant's fuller handover UI.
- **The masthead's signed-in state is now wired up** - it previously
  showed "Sign in" unconditionally even to a signed-in renter, which meant
  trips, documents and account settings (all already built) had no way in
  except typing the URL directly. Added: My trips, a notification bell
  with a real unread badge, Account, Sign out (calls `POST /auth/logout`,
  not just a local token clear).
- Documents (`/documents`) and account/sessions (`/account`) already
  existed from earlier phases and needed no changes here.

### C9 - Marketing pages + SEO

- The seven pages. **Not pulled from a canvas file** - the design bundle's
  `isPages` block is an empty shell with no per-page copy, and the actual
  source (`Cruz Public Site Pages.dc.html`, named in the bundle's own
  manifest) wasn't reachable this session (no open canvas tab / project
  link). Written instead in the confirmed real token system and Home's
  established visual idiom - see `components/site/marketing.tsx`'s own
  comment. **Swap for the canonical canvas copy once that file is
  pulled.** `/legal` in particular is a holding page, not a real Terms of
  Service / Privacy Policy - fabricating legal text would be worse than
  the hardcoded `id_verified` badge; it needs actual drafting before
  launch.
- Per-route title/meta description/canonical/OG via `lib/use-seo.ts`, and
  JSON-LD - `Organization` (home, about), `FAQPage` (help, all 7
  questions), `Vehicle` (car detail, **`AggregateRating` only when
  `owner_rating` is non-null** - nothing writes a hirer-rates-merchant row
  yet, so this renders on real data or not at all).
- `robots.txt` (static, in `apps/customer/public/`) pointing at
  `https://cral.co.ke/sitemap.xml`; `GET /sitemap.xml` is a **real API
  route** (`apps/api/src/routes/sitemap.ts`), not a static file - the
  static marketing paths plus every currently live, publicly-visible
  vehicle, read through the same `baseCatalogQuery()` the catalog itself
  uses. Needs an edge rewrite in production so `/sitemap.xml` on the
  customer origin reaches the API - see DEPLOY.md.
- **Build-time HTML prerendering is still open**, deliberately deferred
  rather than half-built. What's done (title/meta/OG/JSON-LD, set
  client-side) covers what crawlers and link-preview scrapers actually
  read for a JS-executing crawler; a real prerender step is a separate,
  larger piece of infra.

### C10 - List your car

Earnings calculator, the three steps, "have these ready", then hand off
to the merchant app. Cross-origin, so it is a fresh sign-in on the
merchant side - the copy must not imply one session.

### C11 - Admin: renters queue + bookings lens **[shipped]**

- `POST /admin/renters/{userId}/documents/{kind}/decision` + the queue
  (`GET /admin/renters`, `admin_reviewer` role + `renters` queue).
  `requireAdmin` before `requireIdempotencyKey`. Documents + `audit_log`
  in one transaction; **email after commit**, not an in-app notification
  - `notifications.merchant_id` is still `NOT NULL` (Migration B, still
    open), so email is the only real channel a renter has. A bounced
    email must not lose the decision, same pattern as the payout-query
    email.
- Bookings directory, read-only (`GET /admin/bookings` +
  `GET /admin/bookings/{id}`) - the Merchants-lens precedent, no decision
  endpoint. Scoped to `admin_support` + the `bookings` queue - the console
  nav had already scoped "Bookings" to support staff before this module
  existed, kept in step rather than silently diverging to
  `admin_reviewer`.
- **The pickup-handover gate is live**: `completeHandover`'s pickup leg
  now 422s `hirer_documents_not_accepted` unless the hirer's `national_id`
  **and** `driving_licence` both read `review_state = 'ok'` - the same two
  rows admin-renters reviews. `getHirerHistory`'s `id_verified` is real
  now too, off the identical check (contract updated in
  `merchant-bookings.yaml`).
- `SideNav`: "Renters" added (`admin_reviewer`, `built: true`); "Bookings"
  flipped from `built: false` to `true` - the nav item already existed.
- Verified as a real admin, not just tests: signed in through 2FA,
  accepted a renter's National ID in the browser, watched the state flip
  to "Accepted" with no reload, confirmed the row and its `audit_log`
  entry in Postgres, and loaded the (correctly empty) Bookings directory.
  Full `apps/api` suite: 27 files, 247 tests, all passing. Workspace
  typecheck + lint clean; both `apps/api` and `apps/admin` build green.

### C12 - Deploy

- `cral.co.ke` apex vhost serving `apps/customer/dist`; customer build
  added to `~/redeploy.sh`.
- DNS A record on the apex - **careful, it carries the Resend TXT/MX
  records; add alongside, never replace**.
- `CORS_ORIGINS` += the customer host. An explicit `CORS_ORIGINS`
  *replaces* the built-in default, so omitting the customer origin fails
  every fetch with no `Access-Control-Allow-Origin`. Hit this in local
  dev on 2026-09-10.
- The callback URL must be publicly reachable before payments can
  complete.

## 4. Suggested order

C1 -> C2 -> C3 -> C5 -> C4 -> C6/C7 -> C8 -> C11 -> C9 -> C10 -> C12.

C2 first because everything downstream needs a booking to exist. C5 moves
ahead of C4 because the booking review step renders the renter's identity
and licence state. C6 and C7 land together once D1/D2/D3 are answered.
C12 can happen earlier for a marketing-only launch if that is wanted -
the home page and the seven pages do not need any of the booking work.

## 5. Cross-cutting rules (unchanged)

- Money: server-computed, integer cents, `{amount, currency}`. The client
  never computes a total.
- One copy of every rule: the two-gate catalog predicate, the pricing
  function, the payout position. A second copy is how two screens
  disagree.
- `Idempotency-Key` on every POST that moves money or commits a booking.
- Audit rows in the same transaction as the change they describe.
- No em dashes in customer-facing copy; `usePageTitle` on every page;
  two-level `ErrorBoundary`; `queryClient` does not retry 4xx.
- Brand: self-hosted fonts, Archivo wdth+wght, tokens from
  `packages/ui/src/tokens.ts`, canvas screens reproduced with their own
  inline styles. Status colour never alone - always glyph + word.
- Nothing fabricated. No rating, badge, count or verification state that
  isn't backed by real data.

## 6. Verification gate (every PR)

`npm run build`, `npm run typecheck`, `npm run lint` across the
workspace, plus the `apps/api` suite. CI is billing-locked, so local is
the gate. After C5 specifically, smoke merchant and admin - that is the
migration that touches their code.

End-to-end proof when the plan is done: renter signs up -> uploads ID and
licence -> Ops accepts -> browses -> requests a car -> **merchant sees the
request** -> accepts -> renter pays by M-Pesa -> handover blocked until
documents are accepted -> hire completes -> **admin sees the booking** ->
payout run includes it.
