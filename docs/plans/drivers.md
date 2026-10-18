# Drivers - feature review and plan

Status: **built** (2026-10-18, branch `feature/drivers`, merged to
`develop`; Linear project "CRAL - Drivers", COD-103 to COD-106). See
"9. What shipped, and where it differs" at the end. Car sales is parked
in [`car-sales.md`](./car-sales.md).

This is a **deliberate deviation from `road-to-transactable.md` /
`pr-delivery-plan.md`**, which don't list drivers. It needs its own
recorded owner call in CLAUDE.md when the first PR lands, same footing as
Services (2026-09-23).

## Owner's calls (2026-10-18)

1. **A driver needs three documents: driving licence, national ID, KRA
   PIN.** Nothing else - no PSV badge, good-conduct certificate, photo or
   operator certificate.
2. **Drivers are records a merchant uploads**, like vehicles. Any
   merchant can add drivers: an individual who only drives (adds
   themselves, owns no car), a fleet merchant adding their own driver, a
   company adding several.
3. **A driver belongs to one merchant only.** The same person (national
   ID / licence number) can't be listed by two merchants - globally
   unique, same rule as a registration plate.
4. **All driver money goes through CRAL**, paid in-app via Daraja, at the
   same commission as car hire. The merchant is paid, through the
   existing payouts, never the driver directly.
5. **Every hiring unit is supported**: day, hour and trip.
6. **Keep it light.** Few fields, no canvas - built from
   `packages/ui/src/tokens.ts` in the portal's existing look.
7. **A driver drives either car.** A customer can add a merchant's driver
   to that merchant's car, or book just a driver for their own car.

---

## 1. What exists that this reuses

| Piece | Used for |
|---|---|
| Merchant account, onboarding, account gate (`approved_at`) | The merchant who owns the drivers - unchanged |
| `documents` table + one `review_state` | Each driver's three documents (`documents.driver_id`, new) |
| `driving_licence`, `national_id`, `kra_pin` kinds | All three already exist |
| Vehicle review case + checklist-first components | Driver review case |
| Bookings, handover, ratings, payouts | Driver jobs |
| `computeBookingPricing`, hiring units | Driver rates |
| Expiry sweep, `EXPIRING_WITHIN_DAYS` | Licence expiry |
| Plate-uniqueness pattern (normalised functional unique index) | One-merchant-per-driver rule |

---

## 2. Data model

```
drivers  (drv_ PK)
  merchant_id          FK merchants, NOT NULL
  full_name
  phone                E.164 (normalizePhone) - for the handover code
  national_id          unique, normalised
  kra_pin
  licence_number       unique, normalised
  licence_expiry       date
  daily_rate_amount / hourly_rate_amount / trip_rate_amount   (nullable money pairs)
  status               draft | pending | review | action | rejected | live | paused
  reviewer_note, review_assignee, submitted_at, created_at, updated_at

documents.driver_id    nullable FK drivers (beside vehicle_id)
```

- **Many drivers per merchant**; **one merchant per driver** (unique
  `national_id` and `licence_number`). A clash throws 409 `driver_taken`,
  mirroring `registration_taken`.
- **Documents per driver**: `driving_licence`, `national_id`, `kra_pin`,
  each a `documents` row with `merchant_id` + `driver_id`.
- **An individual merchant adding themselves**: "This is me" prefills
  name, phone, ID and KRA from the account and reuses the account's ID +
  KRA documents, so they only upload the licence.
- **Rates**: the merchant sets any of the three; at least one is required
  before submit (422 `driver_rate_required`). Commission applies the same
  way as car hire; take-home shows "after CRAL's service fee", **never
  the percentage**.
- **Status**: the vehicle listing set, so pills and Ops screens carry
  over. `expired` is **derived** when `licence_expiry` passes: the daily
  sweep makes the driver unbookable and notifies the merchant.
- **`offers`**: not needed any more - a merchant "drives" by having
  drivers, the way they "rent cars" by having vehicles. Onboarding just
  stops requiring a vehicle when a driver is added instead.

New ID prefix: `drv_` (`driver` in `packages/types/src/ids.ts`).

### Hourly hire

`hour` is switched off for vehicles today because the booking form only
collects dates (CLAUDE.md, hiring cadence). Supporting hour for drivers
means **building the time-of-day picker** in the customer booking form
in the same PR - the 422 doesn't lift without it. Once built, hourly can
be switched on for vehicles too.

---

## 3. Booking a driver

Two kinds of booking (owner's call 7):

- **Car + driver**: the customer books a merchant's car and adds one of
  that merchant's drivers.
- **Driver only**: the customer books a driver to drive their own car.

Both share one shape:

- **Generalise `bookings`**, don't add a second table: `driver_id`
  nullable FK; `vehicle_id` becomes nullable (CHECK at least one set). A second table would be a second copy of
  pricing, overlap, handover and payout rules.
- **One payee**: `bookings.merchant_id` is the merchant who owns the
  driver (and the car, if any). Because a driver belongs to one merchant,
  a car-plus-driver booking is always one merchant - **payouts don't
  change**; `payout_run_lines.booking_id` stays globally unique.
- **Price**: car + driver = two `computeBookingPricing` legs summed into
  the booking's gross/commission/net; driver only = one leg. Snapshot at
  booking time like every other money path.
- **Overlap**: a driver can't be on two overlapping bookings, checked in
  the insert's transaction.
- **Payment**: the existing Daraja STK flow, unchanged.

### Handover

- Car + driver from the merchant: the existing pickup leg, nothing new.
- Driver only (customer's own car): direction flips - the driver gets a
  4-digit code by SMS on `drivers.phone` and reads it to the customer,
  who enters it in the customer app. `Handover.required` already lets the
  leg's steps vary.

---

## 4. Merchant portal - `apps/merchant`

- **Drivers** in `SideNav`, beside Vehicles, with a count badge only for
  drivers needing action.
- Drivers list: name, licence expiry, status pill, rate.
- **Add a driver**: one short form - name, phone, national ID, KRA PIN,
  licence number + expiry, rates - plus three upload slots. "This is me"
  shortcut for individuals. Submit for review.
- Driver detail: status, reviewer note, Message the reviewer after
  `action` / `rejected`, edit while `draft` / `action` / `rejected`,
  pause / resume.
- Onboarding: the Vehicles step becomes "Vehicles and drivers" - a
  merchant can submit with a driver and no car.
- Vehicle Price & availability: on a chauffeured listing, pick which of
  the merchant's own live drivers drives it.
- Dashboard: drivers on a job today; licence expiring (expiring card).
- Notifications use the existing `booking` / `expiry` / `review`
  categories. No em dashes, `Merchant:` titles.

## 5. Customer - `apps/customer`

Both booking kinds:
- **Driver only**: `/drivers` - filter by county and date; card shows
  first name + initial, rating, rate / unit, the merchant's name. Booking
  form: dates (+ times for hourly), pickup point, the car (free text).
- **With a car**: on a listing, "With driver" shows the merchant's driver
  rate, and the booking total includes it.
- Trips include driver jobs; rate the driver after (`ratee_type =
  'driver'`).

## 6. Admin (Ops) - `apps/admin`

- New `drivers` queue (`admin_reviewer`), `modules/admin-drivers`,
  `openapi/admin-drivers.yaml`, on the checklist-first review components.
- Case: three documents, a short checklist under each - name matches the
  details typed, number matches, licence in date. All passed -> accepted
  (existing auto-accept rule).
- Gate order: merchant account approved -> driver approved -> bookable,
  same three-gate shape as vehicles.
- Merchant file gets a Drivers section beside Fleet.
- Bookings oversight shows the driver on a booking.

---

## 7. PR sequence

Contract frozen in `openapi/` first; local gate (typecheck, lint, api
tests, build) on each.

1. **D1 Merchant drivers** - `drivers` table, `documents.driver_id`,
   add / list / detail screens, onboarding "Vehicles and drivers".
   `openapi/merchant-drivers.yaml`. Not bookable yet.
2. **D2 Driver review in Ops** - queue, case, checklist, expiry sweep.
3. **D3 Bookings + driver** - `bookings.driver_id`, pricing legs, overlap,
   the time-of-day picker for hourly. Car-hire behaviour tested unchanged.
4. **D4 Customer** - "With driver" on listings and `/drivers` for
   driver-only hire, ratings, reversed handover code.

## 8. Open questions

None - all answered 2026-10-18.

## 9. What shipped, and where it differs from the plan above

Built as four commits on `feature/drivers` (D1 to D4). Contracts:
`openapi/merchant-drivers.yaml`, `openapi/admin-drivers.yaml`, plus
additions to `customer-bookings`, `customer-catalog`, `merchant-bookings`,
`merchant-onboarding`, `admin-merchants` and both notifications contracts
(`subject_type: driver`). Migrations `20261018090000_create_drivers` and
`20261018100000_bookings_with_driver`.

- **No `merchants.offers` column.** A merchant "drives" by having drivers,
  the way they "rent cars" by having vehicles. The only onboarding change
  is `merchants.drivers_only`: a toggle on the Vehicles step ("I don't
  have a vehicle - I only drive") that waives "at least one vehicle".
- **Ops review has no checklist** - three documents to accept or reject,
  then approve / request changes / reject. Lighter than the vehicle case,
  per "keep it light". Queue slug `drivers` (added to Team's queue picker).
- **Driver-only merchants show in the Merchants directory** - it used to
  list only merchants with a submitted vehicle, so their account could
  never have been approved, and a driver can't go live without that.
- **One booking-subject helper** (`apps/api/src/lib/booking-subject.ts`)
  names every booking - car, car with driver, or driver alone - for the
  merchant's Bookings, the emails, payout lines (`DRIVER` in the plate
  column), the dashboard and Ops bookings.
- **Hourly is live for drivers only.** The driver booking page has date +
  start/end time pickers; vehicles keep `hour` switched off because the
  car booking flow is still date-only.
- **The handover is not reversed yet.** Driver jobs use the existing
  pickup code (the renter reads it to the driver). Proving the driver to
  the renter with a code is a follow-up.
- **No driver ratings.** There is no renter-side rating flow at all yet
  (nothing writes `ratee_type = 'merchant'` either), so a rating shown on a
  driver would be "null forever". Add both together.
- **The car booking page offers the car's own merchant's drivers** as an
  "Add a driver" select (`?driver=` preselects). The car listing page
  itself does not advertise drivers yet.
