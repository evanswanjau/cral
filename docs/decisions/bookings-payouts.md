# Bookings and payouts

Read before touching bookings, handovers, claims, ratings, hiring units,
pricing or payout runs. Money in and out (Daraja, Co-op, disbursements) is
in `payments.md`; truck quotes in `trucks.md`; driver bookings in
`drivers.md`.

## Bookings

Contract `openapi/merchant-bookings.yaml` (renter side
`openapi/customer-bookings.yaml`); code `apps/api/src/modules/bookings/`,
`modules/customer-bookings/`, `apps/merchant/src/pages/Booking*`. A
renter's request is a real `bookings` row the merchant sees in Bookings;
there is no separate customer-side table. `POST /bookings` prices
server-side.

- **Pricing**: `lib/booking-pricing.ts#computeBookingPricing(rate,
  quantity)` computes gross, commission and merchant net once, at booking
  time, and they are never recomputed, so a later rate change can't
  rewrite a past booking. The commission rate has one source
  (`COMMISSION_RATE` in `@cral/types`). The deposit is `DEPOSIT_RATE`
  (15%) of gross.
- **Every booking POST that moves money needs an `Idempotency-Key`**:
  confirm, decline, cancel, complete-handover, file-report, quote and
  accept-quote. A double-submit must not refund or claim twice.
- **Every reader names a booking through `lib/booking-subject.ts`** (a
  booking may be a car, a driver, or both). Don't add another "booking has
  a car" read.

### Handover

- **The pickup code is a separate secret from the booking ref.** The ref
  (`CB-260922-001`) is public and read aloud by both sides; the code is a
  one-time secret the hirer reads to the merchant to prove presence.
  Digits from the ref would prove nothing.
- **4 digits** (`PICKUP_CODE_DIGITS`; sign-in and 2FA codes stay 6). Only
  a hash is stored; the code only ever goes out by email, so neither app
  shows it. The renter's trip shows the handover's *state*. The hirer gets
  just that email - no extra "your code was emailed" notification.
- **The return leg has no code.** The merchant is taking their own car
  back, so there's nobody to authenticate. `createHandover` with
  `kind: "return"` opens at `otp_verified`, `required` =
  `["condition", "confirm"]`; `verifyHandoverOtp` on a return is 409
  `otp_not_required`. The client drives the modal off `handover.required`.
- **This is a reduced version of the spec's protocol** (QR for proximity +
  OTP for identity, both sides confirming a joint condition report). The
  QR step is skipped and confirmation is single-sided; `Handover.required`
  and `.state` are shaped so the full protocol slots in without a schema
  change.

### Deposit, claims and reports

- **The deposit hold is two clocks, not a bug**: 24h after return
  normally; filing a claim extends it to 48h from `bookings.returned_at`
  (`CLAIM_DEPOSIT_HOLD_HOURS`) while CRAL reviews.
- **Reports are `claim` (money) or `conduct` (no money).** A claim is
  capped at the deposit held; anything above escalates to a dispute
  (`dsp_`, no disputes table yet) instead of being dropped. All of this is
  server-side; the merchant never sees the deposit or the cap
  (`merchant-portal.md`). Merchant copy says "you have 14 days to report
  an issue"; the window error is `claim_window_closed`.
- **A damage claim needs pickup condition photos on file**
  (`has_pickup_condition_photos`).

### Ratings

`ratings` table (`rev_`, `ratee_type` = `hirer` | `merchant`, `stars` 1-5,
unique `(booking_id, rater_id, ratee_type)`).
`lib/ratings.ts#ratingSummaries` batches `AVG`/`COUNT` so a list stays one
query. Summaries are `{ average, count } | null` - **null, never
all-zero**, until someone rates. Merchants rate hirers
(`BookingSummary.hirer_rating`, `HirerHistory.average_rating` +
`rating_count`); `GET /merchant/profile` carries `merchant_rating`. The
renter-side flow that writes `ratee_type = "merchant"` isn't built yet
(only `seed-demo.ts` writes those). Shared
`components/portal/RatingBadge.tsx` (glyph + number, never colour alone).
The customer car page shows real per-car ratings.

### Hirer trust

**Never fabricate a trust signal.** An early pass hardcoded
`id_verified: true` on the hirer; that's exactly what this product says
never to do. Ops' booking view derives `hirer_id_verified` from the
renter's ID documents being accepted (`RENTER_DOC_KINDS`, all `ok`). The
merchant's `HirerHistory` has no such field; add one only from that same
real source.

### Hiring units (day / hour / trip)

Three units for cars (`vehicles.hiring_unit`): `day` (default), `hour`
(mainly machinery), `trip` (mainly trucks) - "mainly", nothing hard-locks
a unit to a category. Trucks add `km` and `tonne` (`trucks.md`).

- `daily_rate_amount` keeps its meaning and is always set;
  `hourly_rate_amount` / `trip_rate_amount` are nullable. Merchants set
  the unit in the Price & availability modal (`VehicleDetail.tsx`
  `PriceModal`), not at onboarding.
- **`hour` is switched off for vehicles.** The booking flow only collects
  dates and `hire-dates.ts#hireInstants` turns a range into 09:00-to-close
  across every day, so an hourly listing would bill the nights between.
  `updatePriceAvailability` refuses it (422 `hiring_unit_unavailable`);
  the modal offers day/trip (`SELECTABLE_UNITS`). The column, rate and
  pricing branch stay. To switch it on: build a real time-of-day picker,
  then drop the 422 - never the other way round. (Drivers have hourly
  live, with time pickers: `drivers.md`.)
- **A trip listing needs its trip rate** (422 `trip_rate_required`), or it
  would go live at KES 0.
- `customer-bookings/service.ts#unitPricingBasis` is the one place that
  picks rate + quantity: `day` = `daysBetween` (the only unit with a
  minimum-hire gate), `hour` = `hoursBetween` rounded up (min 1), `trip` =
  quantity 1 whatever the dates.
- `bookings.rate_unit` / `rate_quantity` are a **display-only snapshot**
  ("8 hours"). `BookingSummary.days` stays the calendar-day span.
- Pre-submit totals are shown only where honest
  (`apps/customer/src/lib/hiring-units.ts#quoteTotal`): day = rate ×
  inclusive days, trip = the flat rate. The unit label (`KES X / trip`)
  follows the listing everywhere.
- The public catalog's price sort/filter uses `daily_rate_amount` across
  units: an approximate signal, not a price claim.

## Payouts

Contract `openapi/merchant-payouts.yaml` (+ `openapi/admin-payouts.yaml`
for Ops); code `modules/payouts/`, `modules/admin-payouts/`,
`apps/merchant/src/pages/Payout*`, `apps/admin/src/pages/payouts/`.

- **Runs are cut on a schedule and paid by Finance in Ops.**
  `modules/payouts/schedule.ts` + `jobs/payout-cut.ts` (06:00 Nairobi
  daily) cut one run per approved, active merchant with payable bookings
  whose day it is: M-Pesa `weekly` = Monday, `monthly` = the 1st, bank
  always the 1st. The destination is read then and frozen on the run
  (M-Pesa = verified `users.phone`; bank = the merchant's account). A
  merchant with no valid destination is skipped and logged. **Cutting
  never moves money**; Finance pays a run from Ops
  (`POST /admin/payout-runs/{id}/pay`, Idempotency-Key, audited
  `payout_run.pay`), which goes out through `lib/disbursements.ts`
  (`payments.md`). `POST /admin/payout-runs {merchant_id}` cuts one now
  (API only).
- **`cutPayoutRun` is the single place that decides what a run
  contains.** A second copy of those rules is how a merchant gets paid
  twice.
- **Garage orders join the same runs** (Phase 4 GS3): a completed order
  becomes a line with `order_id` (unique too) through the same
  `cutPayoutRun`; `payoutPosition` counts them (`garage.md`).
- **A booking pays out exactly once**: `payout_run_lines.booking_id` is
  globally unique. The service checks first for a clean error; the
  constraint is what holds under concurrency.
- **Line amounts are snapshots and totals are their sum**, never
  recomputed from `COMMISSION_RATE`. Lines denormalise hirer name,
  registration and dates so they render if a booking is archived.
- **Statuses**: `scheduled / processing / paid / failed` (`PAYOUT_STATUS`
  in the merchant `status.ts`). `settleDisbursement` moves a run to `paid`
  or `failed` and notifies the merchant; `payout_runs.provider_code` holds
  the provider's transaction code.
- **"Next payout" counts scheduled runs and payable-but-uncut bookings**,
  so the tile and the run beneath it agree. The next run is a live
  projection, never stored (a stored projection needs a reconciliation
  job). `payoutPosition` is the one source (`merchant-portal.md`,
  Dashboard).
- **Receipt is a PDF, statement is CSV**: a receipt is forwarded to a bank
  or accountant, a statement wants a spreadsheet. `pdfkit`. Both download
  through `apiBlob` in `apps/merchant/src/lib/api.ts`, which keeps the
  bearer header; a plain `<a href>` would save a 401 page.
- **The receipt's palette is the one copy of brand hexes in the backend**
  (`modules/payouts/receipt-pdf.ts`): `@cral/ui` pulls in React, which the
  API must not bundle. A brand v3 means updating those five values with
  `tokens.ts`.
- **Payout copy names the real destination** (`destinationPhrase`), not
  "M-Pesa" for a bank run.
- **"Query this payout" is real**: a `payout_queries` row + its
  `audit_log` row in one transaction, then a support email after commit
  (a bounced email must not lose the query). Idempotent.
- The "Fees" card shows fees only (no deposits, no percentage).

## Code anchors

- Merchant serializers drop the deposit: `serializeDetail`, contract `BookingDetail`, client `bookings-api.ts`; the column `bookings.deposit_amount` stays.
- `merchant_net` is the merchant's share; `bookings.rate_quantity` was backfilled for day bookings made before units existed.
- Ratings written by `rateHirer`.
