# Admin Bookings + Payouts

> **STATUS: PLAN. Only the groundwork below is built.**
>
> Corrected 2026-09-15. An earlier version of this file was written in the
> past tense ("BUILT 2026-09-16") describing a module, two screens and two
> test suites that do not exist in the codebase — no
> `modules/admin-payouts/`, no `apps/admin/src/pages/Payouts.tsx`, no
> `openapi/admin-payouts.yaml`. The session that wrote it laid the
> service-layer groundwork and stopped. Do not trust a plan doc's tense;
> check the tree.
>
> **Built so far:** the `payout_held` migration, `payableBookings`
> excluding held bookings, `merchantsWithPayableBookings`,
> `markPayoutRunPaid`, and `destinationFor` exported. Everything else in
> this document is still to do — see
> [`pr-delivery-plan.md`](./pr-delivery-plan.md) phases G1/G2, which
> requires the contract to be frozen *before* the service this time.
>
> Scoped after the owner asked "are we done with bookings merchants and
> vehicles?" — no: Vehicles/Merchants were done relative to their design,
> but `modules/admin-bookings/` was a read-only list+detail only (Admin
> C11), and admin Payouts didn't exist. Pulled
> `Cruz Admin Bookings and Payouts.dc.html` from the design bundle to scope
> the real gap.

## What the design shows, and where it doesn't map onto the real system

One screen, two tabs sharing a nav group (Bookings / Payouts), plus a
booking detail and a payout-run detail.

- **Bookings**: tiles (money in flight / waiting on us / commission this
  month), a dispute banner, status filters, a table. Detail: money
  breakdown, timeline, merchant/renter cards, and three actions — **Hold
  the merchant payout**, **Refund the renter**, **Settle** (opens the
  payout run it's in, or "message both sides").
- **Payouts**: a "next run" summary, a table of runs, each a *batch*
  containing several merchants' lines sent together Mon/Thu 09:00; a run
  detail lets you hold/release/retry a line, export the M-Pesa batch
  file, and send the batch.

Three things the design assumes that the real system doesn't have:

1. **A payout run is per-merchant in the real schema** (`payout_runs.
   merchant_id`), not a multi-merchant batch — `cutPayoutRun(trx,
   merchantId, destination, options)` is already the single decider of
   what one merchant's run contains (`modules/payouts/service.ts`). The
   design's "batch of many merchants sent together" is presented here
   truthfully as a list of individual per-merchant runs instead of
   fake-grouping them — there is nothing in the schema to group by.
2. **Nothing has ever cut a real payout run.** `cutPayoutRun`'s only
   caller today is the dev-seed. Building the admin "cut" action is this
   slice's biggest real win — it's the first production trigger for a
   system that has otherwise been entirely inert outside fixtures.
3. **"Refund the renter" has no money behind it to move**, for two
   separate reasons, and it isn't mine to default around either one:
   - There's no online renter-payment collection today — a booking
     settles directly between hirer and merchant off-platform (per the
     2026-08-31 Bookings decision, still current). CRAL never held the
     hire amount to refund it from.
   - `bookings.refund_amount` already exists and is already set for
     real — but by the *merchant's own* `declineBooking`/`cancelBooking`
     (bookkeeping: what's owed back when a request never happened or
     a confirmed hire is cancelled before pickup), not by an admin
     action, and not a live transfer.
   - An *admin-triggered* version of that (stepping in on the merchant's
     behalf mid-dispute) is real and buildable, but only by extracting
     `cancelBooking`'s late-fee math into something both the merchant
     route and an admin route call — forking that arithmetic a second
     time is exactly the "second copy of `cutPayoutRun`'s rules" mistake
     CLAUDE.md warns about. **Deferred, not built this pass**, flagged
     for whoever does that refactor.
   - Separately, `docs/plans/customer-portal.md`'s **D1 (deposit
     custody) is still an open, unresolved product decision** — "genuine
     forks, not things to pick a default for." A held, CRAL-refundable
     deposit is what the design's copy actually assumes; that doesn't
     exist yet either way.

## The plan

> Everything under this heading is **to build**, except the four items
> marked **[built]**.

### Payouts (net new)
- **[built]** `bookings.payout_held` (migration `20260917090000_admin_payouts.ts`) —
  a real hold: `payableBookings` now excludes it, so an admin can keep a
  completed, deposit-released booking out of the *next* cut. There's no
  "un-cut" once a run already exists (a booking pays out exactly once,
  by the existing unique index) — holding only works pre-cut, same
  window the design's own "assembling" state implies.
- **[built]** `modules/payouts/service.ts` — `destinationFor` exported (was
  module-private) so the admin cutter uses the exact same M-Pesa-only
  destination resolution the merchant-facing reads do, not a second copy.
  New `markPayoutRunPaid(trx, runId, {providerCode, paidAt})` —
  manual reconciliation (no Daraja B2C exists, per the original payouts
  build's own note), writes the same "payout sent" notification shape
  `cutPayoutRun` writes for its own `markPaid` path.
- **[built]** `merchantsWithPayableBookings` — the set the future
  `cut` endpoint iterates.
- **To build.** `openapi/admin-payouts.yaml` must be frozen first.
  `modules/admin-payouts/` — `GET /admin/payout-runs` (cursor-paged, every
  merchant's runs), `GET /admin/payout-runs/{id}` (with lines),
  `POST /admin/payout-runs/cut` (Idempotency-Key — loops every merchant
  with a payable booking, cuts one run each via the real `cutPayoutRun`,
  one transaction per merchant so a mid-loop failure doesn't half-cut),
  `POST /admin/payout-runs/{id}/mark-paid` (Idempotency-Key), `GET
  /admin/payout-runs/{id}/export.csv` (an M-Pesa-bulk-ready line export —
  the design's "Export batch file"). `admin_finance` + `payouts` queue.
- `apps/admin`: `Payouts.tsx` (runs list + a "cut today's runs" action)
  and `PayoutRunDetail.tsx`. `SideNav`'s Payouts item flips to `built`.
- **Deferred, flagged**: a platform-wide "download statement" (the
  per-merchant one already exists merchant-side; an admin passthrough is
  a small follow-up, not core to this slice).

### Bookings (enhanced) — none of this is built yet
- Real tiles (money in flight, waiting-on-us value + flagged count,
  commission this month) and real filter buckets — **Needs us**
  (`requested`) / **In flight** (`confirmed`/`active`) / **Disputed**
  (an open `booking_reports` row) / **Completed** / **Declined or
  cancelled** (the design's fictional "Refunded" bucket renamed to what
  the real status enum actually holds — nothing is refunded for real).
- The dispute banner and "Open the case" are **read-only triage** —
  navigates into the booking detail, which now shows its `booking_
  reports` as timeline context — per `docs/plans/admin-phase-3.md`'s own
  original call: full dispute resolution with money movement waits for a
  real `disputes` table (Phase 6+); a resolve button that can't move
  money would fabricate a capability.
- **Hold the payout / Release** — real, via the new `payout_held` flag;
  notifies the merchant (`category: "payout"`), audited.
- **"Message the merchant"** replaces the design's "Settle → message both
  sides" — deep-links into Communications with that merchant pre-selected
  (real, reuses what's already built). There's no renter-messaging
  surface in the console, so the renter half of "both sides" is dropped
  rather than faked.
- CSV export of the (filtered) bookings list.
- **Not built**: "Refund the renter" (see above).

## Tests to write

None of these exist yet.

`modules/admin-payouts/__tests__/` — RBAC, cutting creates a real
`scheduled` run per eligible merchant and skips ones with nothing payable,
a held booking is excluded from the cut and released back in, mark-paid
sets `paid`/`provider_code`, the CSV export shape.
`modules/admin-bookings/__tests__/` gains hold/release + bucket tests.
