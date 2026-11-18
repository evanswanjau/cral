# Drivers

Owner's call, 2026-10-18 (Linear "CRAL - Drivers", COD-103 to COD-106).
What shipped: [`docs/plans/drivers.md`](../plans/drivers.md). Contracts
`openapi/merchant-drivers.yaml`, `openapi/admin-drivers.yaml`.

- **A driver is a record a merchant uploads, like a vehicle** (`drivers`,
  `drv_`). A merchant can have many; a driver belongs to one merchant -
  the normalised national ID and licence number are globally unique (409
  `driver_taken`). "This is me" (individuals) reuses the account's own ID
  and KRA PIN documents.
- **Three documents**: `driving_licence`, `national_id`, `kra_pin`
  (`documents.driver_id`). **Account-document queries must filter
  `driver_id: null` as well as `vehicle_id: null`** - a driver's ID also
  has `vehicle_id` null, and an unfiltered query reads it as the
  account's.
- **Gates**: account approved -> driver approved (Ops `drivers` queue) ->
  bookable. A lapsed licence is unbookable (derived, never stored); the
  daily expiry sweep warns 30 days ahead. `merchants.drivers_only` lets
  someone with no car finish onboarding.
- **Bookings**: `vehicle_id` is nullable and `driver_id` exists, with a
  CHECK that at least one is set. Car + driver = two legs priced and
  summed, same commission. Driver-only = the renter's own car
  (`hire_car_details`), and only the renter's ID is required. Every reader
  names a booking through `lib/booking-subject.ts`.
- **A self-drive car offers a driver, the owner's own first.**
  `GET /catalog/vehicles/:id/drivers` returns the owner's drivers
  (`source: owner`) when there are any; only when there are none, other
  owners' (`source: other_owners`). Picking another owner's driver splits
  the request into **two linked bookings** (`bookings.linked_booking_id`),
  each accepted, paid and paid out on its own, so **a booking always has
  exactly one payee**. Don't "simplify" this into one booking with two
  payees.
- **Renters see the driver's full name** - never the ID, KRA PIN, licence
  number or phone.
- **Money goes through CRAL**; the merchant is paid out at the usual
  commission, never the driver directly. Day, hour and trip rates; hourly
  is live for drivers (the driver booking page has time pickers).
