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

### DR3 as built (2026-11-27)

- `npm run seed:drivers -w apps/api` adds **40 live drivers** to the 12
  `seed:hire` owners (run `seed:hire` first; it adds no accounts) across
  11 counties: 27 offer a day rate, 18 an hour rate, 22 a trip rate.
  Licences 1-4 years ahead; licence, ID and KRA PIN accepted (fixture
  PDFs that say "not a real document"). Data in
  `apps/api/src/scripts/seed-drivers-data.ts`; append, never reorder.
- **Same safety as `seed:hire`** (refuses production, any database but
  `cral_dev`/`cral_test`, the `/srv/cral` checkout, and a non-local host
  without `--server`), and **refuses unless `SMS_ADAPTER` is `console`**.
  Locally `.env` says `textsms`, so run it as
  `SMS_ADAPTER=console npm run seed:drivers -w apps/api`; add
  `STORAGE_ADAPTER=local STORAGE_LOCAL_DIR=./.local-storage` when the
  running API reads local storage, or the photos land where the API
  can't see them.
- **Phones are Ofcom's drama range**, `+447700900001` to `+447700900040`
  (the UK keeps `+44 7700 900000-900999` for fiction; Kenya publishes no
  such range, so a Kenyan-looking number could ring a stranger). The
  phone is never shown to renters; live drivers' phones are locked, so
  the non-Kenyan format never meets the edit form.
- Found again by licence number `SEED-DL-001`..`040` (IDs `9800nnnn`); a
  re-run updates in place and puts back missing documents and photos;
  the seed stops if those numbers sit on a non-seed merchant.
  `--clear` removes only those drivers (and their stored files) and
  refuses while any has a booking - it never deletes a booking.
  `seed:hire --clear` now refuses while seeded owners have drivers, so
  their files are not left in storage.
- **Photos** are set the way DR2 sets one (`fil_` id in the key and on
  the row). 29 photos (18 men, 11 women) of ordinary people from
  Wikimedia Commons ("Men of Kenya" / "Women of Kenya"), CC BY 2.0,
  CC BY-SA 3.0/4.0, credited in
  `apps/api/src/scripts/seed-assets/drivers/CREDITS.md`. Owner's pick
  (2026-11-27) over drawn faces or none. Photos whose title names the
  person in full were left out, so no public figure stands in for a
  made-up driver. Cropped to 640x800 with the face in the band the card's
  `center 30%` shows.

### DR4 as built (2026-11-27)

- **The driver is texted once a booking with a driver is paid.**
  `applySettlement` queues `text-driver-job` on the notification-delivery
  queue after commit (only the booking id goes to Redis); the worker
  (`jobs/driver-job-sms.ts`) sends one SMS to `drivers.phone` through the
  SMS adapter. Plain words: ref, start and end (Nairobi time), pickup
  point, the renter's **first name**, the car when known. Never money, the
  commission or the deposit. Paid means paid and still `confirmed`; a
  cancelled or unpaid booking texts nothing. `bookings.driver_sms_sent_at`
  stops a redelivered job texting twice. The merchant's timeline shows
  "Job texted to <first name>" (`driver_texted`).
- **A booking with no car of the merchant's** - a driver alone, or the
  driver half of a linked booking (its car is the other owner's, and
  their driver is not on that owner's login either) - **runs the code
  driver to renter**. The worker mints the 4-digit code (stored hashed on
  a `handovers` row, `code_holder = 'driver'`, valid until `dropoff_at`;
  a retry mints a fresh one and expires the old row) and puts it in the
  same SMS. The renter enters it on the trip page ("Start the job",
  `POST /bookings/{id}/driver-code`, Idempotency-Key, audit row
  `booking.activated` with `via: driver_code`); a right code completes the
  pickup and the booking goes `active`, and the owner gets a "job started"
  notification. Papers must be cleared, as for any pickup.
- **Five wrong codes spend it**; the trip page then says to ask the owner,
  whose handover in the merchant portal still works for these bookings as
  the fallback (code emailed to the renter, as before). Whichever path
  finishes first expires the other's open code.
- Car and car + driver bookings: the SMS has no code, and the owner runs
  the handover exactly as before. "This is me" drivers get the SMS too.
- **The return stays with the owner** (merchant portal, no code - nobody
  to authenticate). It needn't happen at the roadside.
- Not built: no SMS to the driver when a paid job is later cancelled or
  changed. Flagged as a follow-up.

### DR5 as built (2026-11-27)

- **`npm run walk:hire` walks both kinds of driver booking** after the
  nine hire walks, one line each, so the summary reads `11 of 11 passed`
  (`tools/hire-walk.mjs`, checklist `docs/review/hire-walk.md`). Driver
  only: "I only drive" owner, driver by the hour found in the dated
  search, the pickup started with the code read from the console SMS to
  the driver's phone. Car + driver: the owner's own driver on a
  self-drive car, one booking, the driver's SMS with no code, the owner's
  handover.
- Same safety as the hire walk (own API, console adapters, Redis db 7,
  local database only, never production). The walk forces
  `WORKERS_ENABLED=true` on its own API, since the driver's SMS goes out
  from the notification-delivery worker.
