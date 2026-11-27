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

## Drivers that work (owner's call, 2026-11-27)

Plan: [`docs/plans/drivers-that-work.md`](../plans/drivers-that-work.md)
(DR1-DR5). Drivers come before buy-and-sell cars.

- **`/drivers` is a search, like `/hire`**: results first, by county and
  dates; how-it-works, prices and questions go below the results. Menu
  order Buy and sell, Hire, Drivers, with Drivers its own top item.
- **A driver has a photo**, shown on the card and the driver's page. This
  reverses the 2026-10-18 "no photo" call. It is a picture, not a check:
  no badge or tick says it was verified.
- **The driver is told**: an SMS to `drivers.phone` when a job is paid,
  and for driver-only jobs the handover code runs driver to renter.
- **Local data**: about 40 seeded drivers, same safety rules as
  `seed:hire`, phones from a range no real phone uses, and the seed
  refuses to run unless SMS is `console`.
- Driver ratings stay out until renters can rate anyone.

### DR1 as built (2026-11-27)

- `GET /catalog/drivers` takes `county` (any case), `unit`
  (`day|hour|trip`, drivers who offer it), `pickup_at` + `dropoff_at`
  (a pair; a driver on a **confirmed or active** booking overlapping
  them is left out, the same `<` / `>` rule as `driver_unavailable`) and
  `sort` (`recommended` = newest; `price_asc|price_desc` order on the
  `unit` rate and 422 without one). Cursor paging, plus `total_count`.
  `GET /catalog/drivers/counties` feeds the county picker.
- The customer site builds the window the way the booking form does:
  by the day 09:00 first day to 17:00 last day (Nairobi); by the hour or
  trip, one day between the times picked. The card carries rate and
  dates to `/drivers/:id`, which opens filled in.
- Picking a price sort with no rate sets "Per day". No tags row: every
  filter is a pill, and "Clear all" sits by the count.

### DR2 as built (2026-11-27)

- **One optional photo per driver**, on `drivers` itself (`photo_id`
  `fil_…`, `photo_storage_key`, `photo_content_type`; all set or all
  null by CHECK). It is **not a `documents` row**: no review state, no
  Ops decision, not a checklist item, and setting, replacing or removing
  it never changes the driver's status (a live driver stays live, as
  with a vehicle photo added after approval).
- `POST /merchant/drivers/:id/photo` (multipart `file`) sets or replaces
  it; `DELETE` removes it; `GET` serves it to the merchant. JPEG, PNG or
  WebP only - `createUpload` lets a PDF through, so the route narrows to
  images (415 `unsupported_file_type`) before the byte check (422
  `file_content_mismatch`). Each change writes `driver.photo_set` /
  `driver.photo_removed` to `audit_log` in the same transaction; the old
  bytes are deleted after the commit.
- `photo_id` changes on every upload. The public URL carries it:
  `CatalogDriver.photo_url` = `/catalog/drivers/:id/photo/:photoId`,
  served like a listing photo (nosniff, allowlisted type, public cache
  1h) behind the same live-driver gate as the profile; an old id 404s,
  so a cached copy never outlives a replaced photo.
- Ops sees it at the top of the case (`photo_id` on the case,
  `GET /admin/drivers/:id/photo`), apart from the three documents.
  Nothing waits on it.
- Screens follow the `/hire` look (owner's call after a first pass he
  found poor, 2026-11-27). `/drivers` cards use the car card's frame
  (`cral-hire-grid`, photo panel with the county chip, name, "Driver ·
  drives for ...", the searched rate first). The driver's page uses the
  car page's two columns: a portrait photo beside the name (a face crops
  badly in a car's wide panel), the offered rates in the spec grid, a
  short "How hiring a driver works", and the request form in the car
  page's sticky panel. Merchant: a vehicle-style photo tile on Add a
  driver, and a PHOTO side card on the driver's page. Ops: a Photo panel
  above the documents, like a vehicle case's photos, marked "nothing to
  decide". **No badge, tick or "verified" word on or next to the photo**
  - unlike a car card, the driver card has no "Verified" pill.
