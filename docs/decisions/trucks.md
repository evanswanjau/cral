# Trucks: types, routes, quotes

Phase 1 of `docs/plans/verticals-roadmap.md` (PRs T1-T3); plan
`docs/plans/trucks-and-sales-agents.md`.

## Truck type and capacity (T1)

- `vehicles.truck_type` (10 slugs, `categories.ts#TRUCK_TYPES`, repeated in
  the migration's CHECK and mirrored in the merchant and customer
  `vehicle-categories.ts`) and `vehicles.payload_kg` (integer kg, shown as
  tonnes). Kept only for `type = 'truck'`: `categories.ts#truckColumns`
  nulls both on any other category, including when a draft switches away.
- Required at submission, not at save: `submitVehicle` and onboarding's
  `assertCompleteForSubmission` 422 `truck_details_required`.
- Catalog filters `truck_type` / `payload_min_kg`; Browse shows them once
  "Truck & trailers" is picked. A truck's card reads "Tipper · carries
  14 t" (`specLine`), not seats/gearbox. Ops humanises the slug rather than
  carrying a third label list.

## Route and load (T2)

- `bookings.route_from` / `route_from_county` / `route_to` /
  `route_to_county` / `cargo_description` / `cargo_kg`; a CHECK keeps the
  route all-four-or-none. Required on a truck request (422
  `route_required` naming the field, `cargo_required`), refused on
  anything else (422 `route_not_applicable`) rather than dropped. Cargo
  above the truck's `payload_kg` is 422 `cargo_over_capacity`. Counties
  are the 47 in `lib/counties.ts` (mirrored in the merchant and customer
  `kenya.ts`).
- `pickup_location` / `dropoff_location` are filled from the route
  ("address, county") so existing readers keep working. A car + other
  owner's driver split puts the route on both halves.
- `lib/booking-route.ts#routeAndLoadOf` is the one serializer: renter,
  merchant and Ops all return `route` / `cargo` (null on non-truck
  bookings). The request notification names the route.
- No loaders/labour field (client's call), no time picker yet. Customer
  form `components/site/TruckRouteFields.tsx` (not from a canvas file).

## Quotes, per km, per tonne (T3)

- **Two statuses in front of the usual flow**: `quote_requested -> quoted
  -> confirmed`. A request starts as `quote_requested` when the listing's
  unit is `km` / `tonne` or the merchant switched on "Always quote me
  first" (`vehicles.quote_required`); `hiring-units.ts#needsQuote` is the
  one rule. Money columns stay zero until priced, and every reader shows
  "price it" / "price on its way" instead of that zero.
- **`km` / `tonne` are trucks only** (422 `hiring_unit_trucks_only`), each
  needs its rate (422 `km_rate_required` / `tonne_rate_required`), plus an
  optional `minimum_charge`. Per tonne is flat per tonne. **We never
  compute a distance**: the rate is a guide, the price is always the
  quote.
- `POST /merchant/bookings/{id}/quote` (Idempotency-Key) sets gross /
  commission / net once via `computeBookingPricing(amount, 1)`, moves to
  `quoted`, `quote_expires_at` = 48 h (`lib/booking-quote.ts`). Confirming
  a `quote_requested` booking directly is 409 `quote_required`; declining
  works. `POST /bookings/{id}/accept-quote` (keyed) goes straight to
  `confirmed`, then payment as usual. "No thanks" is the ordinary
  withdraw. Both transitions are conditional updates.
- The expiry sweep lapses `quote_requested` on the 12 h window and
  `quoted` on `quote_expires_at`. Merchant and Ops lists count both as
  requests; the renter's "upcoming" includes them.
- On a quoted truck the owner's own driver is priced into the quote;
  another owner's driver is still a separately priced linked booking.
- The commission percentage is never shown in the quote modal, only
  shilling amounts. Quote modal and trip quote card aren't from a canvas
  file.
