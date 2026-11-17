# Verticals roadmap - trucks, garage services, parts, car sales

Status: **plan only, nothing built** (2026-11-15). Owner's call: every
vertical the site advertises must be functional, not an "opening soon"
page. This is a deliberate deviation from `road-to-transactable.md` /
`pr-delivery-plan.md`, which list Parts/Services and selling as out of
scope, on the same footing as Drivers and towing.

Today only hire (cars, trucks, machinery, drivers) and towing are real.
`/services` and `/parts` are `VerticalPage` "OPENING SOON" templates, and
the "selling" door on `Home.tsx` and `AccountMenu`'s "Sell a car" row are
inert.

## Owner decisions (2026-11-15)

1. **Order:** trucks + sales agents first, then the rest.
2. **Suppliers are existing merchants.** One merchant account can list hire
   cars, drivers, garage services, parts and cars for sale. It reuses
   onboarding, the account gate in Ops and payouts. There are no separate
   seller sign-ups.
3. **Parts and garage services are paid through CRAL** - M-Pesa via
   Daraja, CRAL keeps its commission and the merchant is paid out, the
   same as hire. Not lead capture.
4. **Car sales are listings + enquiries** (`car-sales.md` option S-A). The
   price of the car is paid off-platform. No escrow.

## Build order

| # | Vertical | Plan | PRs |
|---|----------|------|-----|
| 1 | Trucks | [`trucks-and-sales-agents.md`](./trucks-and-sales-agents.md) Part A | T1 type + capacity (**built**, `27ca88c`, PR #70 into develop, in `main` via PR #71), T2 route + load (**built**, `feature/truck-route-load`), T3 quote step + km/tonne (**built**, `feature/truck-quotes`) |
| 2 | Sales agents | same file, Part B | AG1 role + invite + My merchants, AG2 sign-up link, AG3 assist session |
| 3 | Garage services | this file, below | GS1-GS4 |
| 4 | Parts | this file, below | PT1-PT2 (on top of GS1-GS3) |
| 5 | Car sales | [`car-sales.md`](./car-sales.md) | CS1-CS4 |

The trucks file calls the agent PRs S1-S3. They are renamed AG1-AG3 here
so they can't be confused with car sales.

### Every phase ends deployed (owner's call, 2026-11-15)

A phase is not done until it is live. Each phase ends with these steps,
using the ritual in `pr-delivery-plan.md` Part 3:

1. **Each PR** branches off `develop` and passes the local gate
   (`npm run typecheck && npm run lint && npm run test -w apps/api &&
   npm run build`). It then merges to `develop`.
2. **Dev deploy after each PR:** run `ssh cral@46.202.128.68
   '~/redeploy-dev.sh'` (dev API + `cral_dev` migrations). Vercel
   (`app-cral.vercel.app`) builds from the push. Smoke-test the PR there.
3. **Production at the end of the phase:** add any new env keys to
   `/srv/cral/.env` first. If the phase has a migration, take the
   database dump. Then open a PR from `develop` to `main` and merge it.
   Finally run `ssh cral@46.202.128.68 '~/redeploy.sh'`.
4. **Verify in the browser** on `cral.co.ke`, `merchant.cral.co.ke` and
   `admin.cral.co.ke`, not only `/readyz`. The next phase starts only
   after this check passes.

Services goes before parts because parts reuses everything services
builds (outlets, the customer's own cars, quotes, orders, order payouts).
Car sales goes last: it moves no money, so it is the least risky, and it
shares nothing with the order engine.

## Shared foundation for services and parts

Both verticals are the same shape: a customer describes what their car
needs, a verified business quotes, the customer accepts and pays CRAL, the
business delivers, the customer confirms, the business is paid out. So
they share one engine rather than two copies.

### Outlets (`out_`)

The canvas promises "Garages are visited" and "A dealer with no premises
does not get listed". A merchant's physical premises is therefore a record
of its own, like a driver: `outlets` with `kind` (`garage` | `parts`),
name, address, county, opening hours, photos and, for a garage, the
service types it does (service, diagnostics, mechanical repair, bodywork,
tyres, electrical, AC). A merchant can have several.

- **Gates:** account approved -> outlet approved -> can quote. Same two-gate
  rule as vehicles and drivers.
- **Ops review** uses the existing checklist components, in a new
  `outlets` queue (`admin_reviewer`). One checklist item is "premises
  visited by" with the visit date. A person ticks it after a real visit,
  so the "visited" claim is backed by a record, never a decorative badge.
- A merchant offers garage services or parts by having an approved outlet
  of that kind. No `offers` column (the same choice drivers made).

### The customer's own cars (`car_`)

The canvas promises "One service record per car" and parts "quoted against
your chassis". So a renter gets **My cars** in their account: make, model,
year, plate, chassis number (VIN), optional logbook photo. Every request
names one of these cars, and every completed job stays on it, which is
the service record.

- Plate is normalised but **not** globally unique here: a car can change
  hands, and two people may both drive it. Uniqueness is per user.
- The chassis number is shown to the outlet that quotes, never publicly.
- `bookings.hire_car_details` (driver-only bookings) can move onto this
  later. Not in scope.

### Request for quote (`rfq_`) and quotes (`quo_`)

- A customer opens a request: `kind` (`service` | `part`), car, what's
  needed (text + optional photos), county, and either one chosen outlet
  or "ask outlets near me" (up to 5 approved outlets of that kind in the
  county). Rate-limited like towing.
- Each outlet answers with a **quote**: itemised lines (part / labour /
  delivery / other, each a money amount), for parts the condition
  (`genuine` / `oem` / `used`) and `fitted` or `delivered`, for services
  the days needed. A quote is valid 48 h, the same window as truck quotes.
- Accepting one quote expires the others and creates an order.
- Commission is taken on the order total. The merchant's quote modal shows
  "you keep KES X after CRAL's service fee". The % is never shown.

### Orders (`ord_`)

One payee per order, the same rule as bookings.

```
awaiting_payment -> paid -> in_progress -> ready -> completed
        |            |                       |
     cancelled    refunded (Ops)          disputed (Ops)
```

- **Paid upfront, held by CRAL.** The STK push runs on accept through the
  existing `payment_requests` / `applySettlement` path. The outlet starts
  only once the order is `paid`.
- **Paid out on the customer's confirmation**, or automatically 72 h after
  the outlet marks it ready/delivered if the customer says nothing. This
  is the parts canvas's "paid once the part is in your hands" promise.
- **Extra work is a second quote** on the same order (services only).
  The customer accepts and pays it separately, or the garage finishes
  the original scope. Nothing is added to a bill without a yes. This is
  the canvas's "a second quote, not a bigger bill at the gate".
- **Refunds** go through `executeRefund` (Send to M-Pesa), the existing
  rail.
- Every transition is a conditional update on the checked status (409 if it
  moved). Pay, accept-quote, confirm and refund take an `Idempotency-Key`.
  Each writes `audit_log` in the same transaction and `notify()` the other
  side.

### Payouts

`payout_run_lines` today keys on `booking_id` (globally unique, which is
what stops a double pay). Orders need the same guarantee, so the line gets
a nullable `order_id` with its own unique index and a CHECK that exactly
one of `booking_id` / `order_id` is set. `cutPayoutRun` stays the single
place that decides what a run contains, and learns to pick up completed
orders past their confirmation window. The rest of the payout pipeline
(schedule, Finance pay, disbursements) is unchanged.

## Garage services - PRs

| PR | What | Size |
|----|------|------|
| GS1 | Outlets: merchant "Your premises" screen, Ops outlet queue + case | M |
| GS2 | My cars (customer) + request for quote + quotes (merchant inbox, quote modal) | L |
| GS3 | Orders: accept + pay, in progress, ready, confirm, extra-work quote, payout lines | L |
| GS4 | Service record on My cars, `/services` page made real, garage listing pages | M |

## Parts - PRs

Parts reuses GS1-GS3. Only the differences are new work.

| PR | What | Size |
|----|------|------|
| PT1 | Parts outlets, condition + fitted/delivered on quotes, delivery address on the request, "Right part" confirm, wrong-part dispute to Ops | M |
| PT2 | `/parts` page made real, broadcast to dealers in the county | S |

There is **no stock catalog** in v1. Dealers quote against the chassis on
request, which is what the canvas promises. A browsable catalog can come
later as its own owner call.

## Car sales - updates to `car-sales.md`

That plan stands, with these changes:

- **S-A (classifieds) is confirmed.** S-C escrow stays out.
- **Merchants only** in v1, behind the account gate.
- **No `merchants.offers` column.** `car-sales.md` assumed drivers would add
  one, but drivers dropped it (see `drivers.md`). A merchant sells by
  having a sale listing, the same way they drive by having drivers.
- Its PRs are renamed CS1-CS4 (listings, Ops review, buy pages +
  enquiries, fees and boosts). Assisted sale (S5) stays later.

## New ID prefixes

`out_` (outlet), `car_` (customer car), `rfq_` (request for quote), `quo_`
(quote), `ord_` (order), `sal_` (sale listing), `enq_` (sale enquiry).
None collide with `packages/types/src/ids.ts` today.

## Open questions for the owner

1. **Garage payment timing.** Upfront and held (recommended above), or
   pay on completion? Upfront protects the garage; on completion is
   friendlier to the customer but leaves the garage unpaid if they vanish.
2. **Auto-confirm window** for orders: 72 h after ready/delivered?
3. **Parts delivery:** the dealer's own delivery only (priced as a quote
   line), or does CRAL arrange riders?
4. **Car sales:** free listings at launch, or a listing fee from day one?
5. **Commission rate** for services and parts: the same as hire, or its
   own setting?
