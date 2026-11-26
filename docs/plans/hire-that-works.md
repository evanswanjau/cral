# Hire that works - check and plan

Session 1 of `docs/prompts/hire-that-works.md`, 2026-11-26, on `develop`
at `5ee8bd6`. Plan only: no application code was changed.

**Owner's decisions (2026-11-26).** Build sessions read these first.

1. **Photos:** free-licence photos (Wikimedia CC0/CC BY/CC BY-SA,
   Unsplash), downloaded once in H2, about 120 images at 150 KB max, kept
   in the repo under `seed-assets/vehicles/<model>/` with author, source
   and licence in `_manifest.json` and `CREDITS.md`. The owner's own photos
   replace them where supplied.
2. **Masthead:** one "Hire" entry, and its menu holds only Cars, Trucks
   and Machinery. Drivers, Towing, Garage and Parts stay their own entries.
3. **Renter papers:** by hire type: ID only when a driver or operator
   comes with the hire, ID + licence for self-drive. Payment is refused
   until Ops has cleared the papers the hire needs (H5).
4. **Machinery:** add `machine_type` (filter + required at submission) and
   allow a serial number in place of a plate for machinery. Hourly hire
   stays off (H1).
5. **Seeded listings:** **no "Sample listing" label.** Seeded listings look
   like real ones on dev. The seed still refuses production (Part 3), so
   they can never reach `cral.co.ke`.

---

## One screen for the owner

**What works today** (each cell: merchant lists it, Ops approves it, a
customer finds, books, pays and gets it back):

|                 | Car | Truck | Machine |
|-----------------|-----|-------|---------|
| **Merchant: sign up, onboard, list** | Works | Works | Works with help: no machine type, a plate is required (most excavators have none), seats default to 5 |
| **Ops: approve owner, review, go live** | Works | Works | Works |
| **Customer: find, book, pay, hand over, return** | Works with help: "Find a car" also lists trucks and excavators; pickup is blocked after payment until Ops accepts the renter's ID and licence | Works with help: card shows "KES 30,000 / trip" for a quote-only truck; asks for a driving licence although the truck comes with a driver | Works with help: per day only (no hourly), dates only, licence demanded although an operator comes with it |

Nothing in the grid is "broken" end to end: on all three, a booking went
from request to completed. What hurts is around the edges, and the
listing pages are not yet one "Hire" place.

**What the client will see when this is done**

- The home page opens with a **Hire** block: three photo doors, "Cars on
  hire · 60 listed · from KES 3,500 / day", "Trucks on hire · 25 listed ·
  from KES 9,000 / trip", "Machinery on hire · 15 listed · from KES 18,000
  / day". Counts and prices are live from the catalog.
- Each door opens a listing page already filtered to it, with a
  Cars / Trucks / Machinery switch at the top and the filters that type
  needs. A truck card reads like a truck, a machine card like a machine.
- The masthead shows **Hire** once (instead of three tabs), then Drivers,
  Towing, Garage, Parts - it fits on a phone.
- On the dev site (`app-cral.vercel.app`) there are **100 vehicles with
  real photos**: 60 cars, 25 trucks, 15 machines, from 12 owners, in 10
  counties.
- A renter knows before paying whether their papers are cleared, and is
  only asked for a driving licence when they drive themselves.

**How many PRs:** 7 (H1-H7), one fresh session each. About 8-10 sessions'
work in all with fixes.

---

## How this was checked

- Ran my own API copy on port **4100** with `EMAIL_ADAPTER`,
  `SMS_ADAPTER`, `PAYMENT_ADAPTER`, `DISBURSEMENT_ADAPTER` = `console`,
  `STORAGE_ADAPTER=local` and **Redis db 7**. The servers already running
  on 4000/5173-5175 were started from a desktop terminal and their
  adapters could not be confirmed, so they were not used. A separate Redis
  db matters: on a shared queue the other API's workers could pick up my
  SMS jobs and send them through `textsms`.
- Customer app copy on **5273** pointed at 4100. Local database is
  `cral_dev` in Docker.
- Ops: created `hireplan.ops@example.test` (admin_super) with
  `admin:create`; sign-in code read from my API log.
- **Merchant and Ops jobs were driven through the API** - the same calls
  the portals make, in the same order (register, onboarding PATCHes, phone
  verify, uploads, submit; Ops checklists, document decisions, approve).
  Scripts: scratchpad `merchant.mjs`, `ops.mjs`, `customer.mjs`,
  `handover.mjs`, `finish.mjs` (they become H7's tool). **The merchant and
  Ops screens were not clicked through in a browser this session**; the
  last session walks them by hand.
- **Customer discovery was checked in Chrome** at 1280 and inside a
  375px frame (the window would not resize below 1920): home, `/cars/search`,
  `/trucks/search`, `/machinery/search`, and the truck and machine detail
  pages, including the `/cars/<machine>` redirect.
- Payment: the console rail never settles on its own; I posted the
  console-shaped callback to `/payments/daraja/callback` (it took it:
  `DARAJA_CALLBACK_USER` is empty in the local `.env`).

**Left in the local database** (delete whenever you like): merchants
`hire.{car,truck,machine}.owner@example.test`, renter
`hire.renter@example.test`, admin `hireplan.ops@example.test`, vehicles
`KHP 101A` (RAV4, `H-261126-002`), `KHP 202B` (Isuzu FSR, `-003`),
`KHP 303C` (CAT 320, `-004`), bookings `CB-261126-002/003/004` (completed).
Nothing was seeded.

---

## Part 1 - What works today

Local data before the walk: 29 live sedans, 1 pending SUV, **no trucks and
no machinery**, 12 vehicle photos in all. So every truck and machine step
below ran on listings I created through onboarding.

### The walk

| Job | Type | Step | Result | Evidence | Smallest fix |
|---|---|---|---|---|---|
| Merchant | all | Register, email code | Works | `POST /auth/register` 201, code in log | - |
| Merchant | all | **Onboard with email never verified** | Works, but shouldn't | `hire.car.owner` has `email_verified = false`, logged in, onboarded, got approved, listing live | Submit refuses until email verified (422) |
| Merchant | all | Details + phone SMS verify | Works | PATCH `/merchant/onboarding` 200; phone verify 200 | - |
| Merchant | car | Add vehicle (SUV) | Works | `POST /merchant/onboarding/vehicles` 201 | - |
| Merchant | car/van | Seats | Not built in onboarding | `merchant/schemas.ts:36` `VehicleInputSchema` has no `seats`; DB default 5. A 14-seat van lists as "5 seats" until edited later in Vehicles | Seats field for sedan/SUV/van in the onboarding vehicle form |
| Merchant | truck | Truck type + payload | Works | 422 until set (`trucks.md`); flatbed 10 t saved | - |
| Merchant | truck | Per trip, "Always quote me first" | Works | `PATCH /merchant/vehicles/:id` 200, stays `live` | - |
| Merchant | machine | Add machine | Works with help | `type: machinery`; asks transmission, fuel, colour, **plate** like a car. No machine type exists (`categories.ts` has `TRUCK_TYPES` only). Catalog shows `seats: 5` | Machine type (excavator, backhoe, ...) and "no plate: serial number" |
| Merchant | machine | Per hour | Not built (switched off) | `PATCH` `hiring_unit: hour` -> 422 `hiring_unit_unavailable` (`bookings-payouts.md` "hour is switched off") | Stays off until a time picker exists |
| Merchant | all | 3 photos, 2 owner docs, 3 vehicle docs, expiry, terms, submit | Works | all 201/200; submit 200. Exactly-3-photos rule still applies (F28) | - |
| Ops | all | Sign in (password + SMS code) | Works | `/admin/auth/login` + `/2fa` 200 | - |
| Ops | all | Accept owner ID + KRA, approve account | Works | 200; works even with the merchant's checklist untouched | - |
| Ops | all | Vehicle checklist, then 3 documents | Works | 24 checks (car), 30 (truck, machine). Accepting a document before its checks is 422 `checklist_incomplete` | - |
| Ops | all | Approve listing, live | Works | `decision approve` -> `live`; refs `H-261126-002/003/004`, public catalog 200 with 3 photos | - |
| Customer | car | Find from home | **Works with help** | Home door "Hire a car" -> `/cars` -> `/cars/search` | see next row |
| Customer | car | "Find a car" list | **Broken (wrong results)** | `/cars/search` with "Any type" shows the CAT 320 excavator and the Isuzu truck first (Chrome, 1280 and 375). `Browse.tsx:291` sends no `category`; `catalog/service.ts:294` then returns every type | Catalog accepts a group (`category=cars`); the cars page always sends it |
| Customer | truck | Find from home | Works | `/trucks/search` shows only the truck, route filters | - |
| Customer | truck | Truck card | Works with help | Card "KES 30,000 / trip" (`VehicleCard.tsx:172-175`) while the detail says "Priced: By quote" | Card says "Price by quote" when `quoted` |
| Customer | machine | Find from home | Works | `/machinery/search`: county, dates, sort only | Machine type filter (needs the column) |
| Customer | truck, machine | Detail page | Works with help | Redirect `/cars/<machine>` -> `/machinery/<id>` works. Owner block says "1 car listed" on a truck and a machine (`CarDetail.tsx:511`) | Say "listing(s)" |
| Customer | all | Renter sign-up, phone verify, ID + licence upload | Works | 201/200 | - |
| Customer | truck, machine | **Licence demanded with a driver** | Works with help | `customer-bookings/service.ts:701-719` asks ID **and** licence for every vehicle; message says "before requesting a car" (`:717`) even for a truck | Licence only for self-drive; copy by type |
| Customer | car | Request -> owner accepts | Works | `requested` -> `confirmed` | - |
| Customer | truck | Request with route + load | Works | starts `quote_requested`; confirm before quote 409 `quote_required`; quote KES 35,000; renter accepts -> `confirmed` | - |
| Customer | machine | Request | Works with help | per day, dates only, 09:00 to close (`hire-dates.ts`). An excavator for "4 hours on Tuesday" cannot be asked for; the renter books a day | Leave as is for now; say "per day" plainly |
| Customer | all | Pay (console STK) | Works | `/bookings/:id/pay` 202; callback -> payment `success` (KES 13,000 / 35,000 / 90,000) | - |
| Customer | all | Trip page | Works | `GET /bookings/:id` `confirmed` | - |
| Merchant | all | Pickup: code (email), verify, condition, confirm | Works with help | 4-digit code by **email only** (F17) | - |
| Merchant | all | **Pickup complete** | **Blocked until Ops acts** | 422 `hirer_documents_not_accepted` (`bookings/service.ts:1033`). The renter has **already paid**; the owner finds out at the car | Show the renter "papers being checked" before paying; Ops renter queue in front; or check at request time |
| Ops | all | Accept renter ID + licence | Works | `/admin/renters/:id/documents/:kind/decision` 200 | - |
| Merchant | all | Pickup complete, return, complete | Works | `completed` on all three | - |

### What a truck needs that a car does not

Truck type (10 slugs) and carrying capacity at submission; route from/to
with counties, cargo and its weight on every request (422 if missing,
422 if over capacity); four ways to price: per day, per trip, per km or
per tonne (the last two always by quote), plus "Always quote me first";
the quote step (`quote_requested -> quoted -> confirmed`, 48 h expiry).
No seats, never "self-drive". The truck's TO county filters nothing.

### What machinery needs, and what an excavator hirer can do today

Today a machine is a car with another label: same form (plate,
transmission, fuel, colour), no machine type, no operator field beyond
"with driver". **A customer hiring an excavator today can:** find it on
`/machinery/search` by county and dates, see the day rate, request whole
days (09:00 to close), pay by M-Pesa after the owner accepts, and get the
handover. **They cannot:** filter by kind of machine, hire by the hour or
half day, ask for delivery to site (no route/low-loader leg), or skip the
driving licence when an operator comes with it. A truck-style quote is
possible only if the owner sets "Always quote me first".

---

## Part 2 - The Hire section and the three pages

### What `develop` has now

- `pages/Home.tsx`: ink hero, `ServiceDoors` lists all **7** live
  services as text doors (no photo, no count, no price), then trust strip,
  how it works, coming, earn band.
- Masthead `ServiceTabs`: Cars, Trucks, Machinery, Drivers, Towing,
  Garage, Parts. At 375px the row scrolls; "Drivers" is cut and Towing,
  Garage, Parts are off screen.
- Cars: `/cars` (landing: search, rails, type tiles), `/cars/search`
  (`Browse.tsx`, 658 lines; county, dates, type, seats, gearbox, driver,
  max price, sort, "load more"), `/cars/:id`, `/cars/:id/book`.
- Trucks: `/trucks`, `/trucks/search` (from county, to county, load,
  truck type, sort), `/trucks/:id` (route-first panel), `/trucks/:id/request`.
- Machinery: `/machinery`, `/machinery/search` (county, dates, sort),
  `/machinery/:id`, `/machinery/:id/book`.
- Redirects already in place: `/browse?...` and `/book/:id` forward by
  type; `/cars/<truck>` -> `/trucks/<id>`, `/cars/<machine>` ->
  `/machinery/<id>`.
- Service photos exist: `apps/customer/public/images/services/{cars,trucks,machinery}.jpg`
  (Unsplash, credited in `CREDITS.txt`).
- Catalog API: `GET /catalog/vehicles` takes **one** `category`, county,
  dates, max price, seats, gearbox, driver, truck type, payload, sort,
  cursor (24/page). It returns no total. `GET /catalog/counties` counts
  every type together.

### What the catalog cannot do (contract changes, `openapi/customer-catalog.yaml`)

1. **"All cars"**: `category` takes one slug, so the cars page cannot ask
   for sedan + SUV + van without also getting trucks and machines. Add
   `group=cars|trucks|machinery` (cars = sedan, suv, van). Keep `category`
   for the type chips.
2. **Counts and "from" prices for the doors**: no total, no minimum.
   Add `GET /catalog/hire-summary` -> `{ cars: { count, from: Money,
   unit }, trucks: {...}, machinery: {...} }`, live listings only,
   from-price over the listing's own unit (a per-trip truck says "/ trip";
   quote-only listings are counted but not priced).
3. **Counties per type**: `GET /catalog/counties?group=` so the truck
   page doesn't offer a county with only cars in it.
4. **Machine type**: new `vehicles.machine_type` (slugs: excavator,
   backhoe_loader, wheel_loader, grader, roller, bulldozer, forklift,
   mobile_crane, skid_steer, tipper_trailer... final list in H1), mirrored
   like `TRUCK_TYPES`, null on any other category, required at submission
   for machinery, filter `machine_type` on the catalog. Only if the owner
   says yes (decision 4).

### The Hire section on the home page

Sits **first under the hero**, before the trust strip. The hero keeps its
heading; the 7 text doors in the hero become 4 (Hire, Drivers, Towing,
Garage + Parts as one row each) or stay as they are with "Hire a car /
truck / machinery" collapsed into one "Hire" door that scrolls to `#hire`.

1280px:

```
 HIRE                                                   (overline, mono)
 Cars, trucks and machinery, from owners CRAL has checked.
 +----------------------+ +----------------------+ +----------------------+
 | [photo: cars.jpg   ] | | [photo: trucks.jpg ] | | [photo: machinery  ] |
 |                      | |                      | |                      |
 | Cars on hire         | | Trucks on hire       | | Machinery on hire    |
 | 60 listed            | | 25 listed            | | 15 listed            |
 | from KES 3,500 / day | | from KES 9,000 / trip| | from KES 18,000 / day|
 | Self-drive or driver | | Say the route, get a | | Excavators, loaders, |
 |                    > | | price              > | | rollers            > |
 +----------------------+ +----------------------+ +----------------------+
```

375px (stacked, each door a single 112px-tall link, photo on the left):

```
 HIRE
 Cars, trucks and machinery.
 +-------------------------------------+
 | [photo 96x96] Cars on hire        > |
 |               60 listed             |
 |               from KES 3,500 / day  |
 +-------------------------------------+
 | [photo] Trucks on hire            > |
 |         25 listed · from 9,000/trip |
 +-------------------------------------+
 | [photo] Machinery on hire         > |
 |         15 listed · from 18,000/day |
 +-------------------------------------+
```

Rules: the count and price come from `hire-summary`; while loading, the
doors show without the two lines (no skeleton jump); if the call fails the
doors still link, without numbers; a type with 0 listed says "Opening
soon" and still links. No count is shown that the catalog didn't return
(no fabricated trust signal).

### The three listing pages

**URLs stay as they are**: `/cars/search`, `/trucks/search`,
`/machinery/search` become "Cars on hire", "Trucks on hire", "Machinery on
hire". No URL changes, so no new redirects; every old link
(`/browse?category=...`, `/book/:id`, `/cars/<truck>`, emails' `/bookings/:id`)
keeps working through the redirects already shipped. The landings `/cars`,
`/trucks`, `/machinery` stay (rails, how it works, FAQ) and their "See all"
goes to the listing page.

Shared frame for all three (one `HireListingLayout` component, page files
under 400 lines each; `Browse.tsx` is split as part of this):

1280px:

```
 [ Cars on hire ] [ Trucks on hire ] [ Machinery on hire ]   <- switch (links, 44px)
 Cars on hire                                       60 listed
 Every car is checked by a person before it is listed.
 +------------------------------------------------------------------+
 | County v | From [date] | Until [date] | Gearbox v | Seats v |      |
 | Driver v | Type: [Any][Sedan][SUV][Van] |              Sort v     |
 +------------------------------------------------------------------+
 [card] [card] [card] [card]
 [card] [card] [card] [card]
 ...                     [ Show 24 more ]        (cursor paging)
```

375px:

```
 [Cars] [Trucks] [Machinery]          <- segmented, full width
 Cars on hire · 60 listed
 [ County v ] [ Dates v ]
 [ Filters (2) ]          [ Sort v ]  <- Filters opens a bottom sheet
 [card full width]
 [card full width]
 [ Show 24 more ]
```

Filters per type:

- **Cars:** county, from/until, type chips (sedan, SUV, van), gearbox,
  seats (2+, 5+, 7+, 14+), driver (self-drive / with driver), max price.
- **Trucks:** from county, to county (carried into the request, filters
  nothing - said in a hint), load in tonnes, truck type, priced (any /
  fixed price / by quote).
- **Machinery:** county, from/until, machine type (decision 4), with
  operator (all are today).

Sort on all three: recommended, price low-high, high-low, newest, rating.
Paging: cursor, 24 per page, "Show 24 more" button (no infinite scroll,
no page numbers).

States, designed, not default text:

- **Loading:** 8 card skeletons in the grid shape (`Skeleton.tsx`).
- **Empty with filters:** "No trucks match. Clear the truck type or try a
  nearby county" + Clear filters button.
- **Empty with no filters** (a type with nothing live): "No machinery
  listed yet. Owners are joining - check back, or tell us what you need"
  + Contact link.
- **Error:** "We couldn't load the list. Check your connection and try
  again" + Try again (refetch), filters kept.

Switch keeps county and dates when moving between Cars and Machinery
(same meaning); moving to Trucks maps county -> from county.

### Cards per type

| | Car | Truck | Machine |
|---|---|---|---|
| Photo | first photo, county pill | same | same |
| Title | Make Model Year | Make Model Year | Make Model (year small) |
| Spec line | "5 seats · Auto · Self-drive" | "Flatbed · carries 10 t · With driver" | "Excavator · with operator" |
| Price | "KES 6,500 / day" | "KES 30,000 / trip", or **"Price by quote"** when `quoted`, or "from KES 120 / km" | "KES 45,000 / day" |
| Never shows | - | seats, gearbox, self-drive | seats, gearbox, self-drive |
| Owner | name, rating if any | same | same |

`VehicleCard.tsx` already switches the spec line for trucks; it needs the
quote rule and a machine spec line.

### The masthead

**Recommendation: one "Hire" entry.** Masthead becomes **Hire, Drivers,
Towing, Garage, Parts** (5 instead of 7). "Hire" is active on every
`/cars*`, `/trucks*`, `/machinery*` path. Clicking it on desktop opens a
small menu (Cars on hire / Trucks on hire / Machinery on hire, each with
its count); on a phone it goes straight to `/cars/search` where the switch
does the rest. Why: the owner's brief groups them; 7 tabs don't fit at
375px today; the switch on the listing page makes three tabs redundant.
Drivers stays its own entry (different product: a person, hourly rates,
your own car). Footer keeps all three links under "Hire".

### URLs that change

None for pages. Only the masthead and home links change target. Kept as
they are: `/cars`, `/cars/search`, `/cars/:id`, `/cars/:id/book`,
`/trucks/*`, `/machinery/*`, `/browse` (redirect), `/book/:id`
(redirect), `/bookings/:id` (the link in every booking email and SMS).
`tools/check-links.mjs` is run in H3 and H4 to prove it.

---

## Part 3 - 100 vehicles with photos: `npm run seed:hire -w apps/api`

### Mix

- **60 cars:** 25 sedans/small (Axio, Fielder, Vitz, Demio, Note, Fit,
  Premio, Mazda 3), 20 SUVs/pickups (RAV4, X-Trail, Forester, Prado,
  Land Cruiser 70/200, Pajero Sport, D-Max, Hilux, CX-5), 15 vans/minibuses
  (Noah, Voxy, HiAce, Nissan Caravan). Day rates KES 3,500-25,000
  (Prado/LC200 top), some with driver, some 2-day minimum, real seats
  (5 / 7 / 8 / 14).
- **25 trucks** across all 10 truck types: pickup and canter (1.5-3.5 t),
  box body, flatbed, tipper (7-20 t), refrigerated, water bowser
  (10,000 l as 10 t), prime mover, low loader (30-40 t), crane truck.
  Makes: Isuzu NKR/NPR/FRR/FSR/FVZ, Mitsubishi Fuso Canter/Fighter, Hino
  300/500, Mercedes Actros, Scania P/G, Tata. **Pricing: 10 per day
  (KES 9,000-45,000), 8 per trip (KES 9,000-120,000), 7 quote-first
  (3 per km, 2 per tonne, 2 "Always quote me first")**.
- **15 machines:** CAT 320 / Komatsu PC200 excavators (4), JCB 3CX backhoe
  (3), CAT 950 wheel loader (2), CAT 140 grader (1), Bomag/Dynapac roller
  (2), CAT D6 dozer (1), Toyota forklift (1), Tadano mobile crane (1). Per
  day KES 18,000-90,000, all with operator; 2 per trip (delivery on a low
  loader is a separate truck, not modelled).
- **10 counties:** Nairobi, Kiambu, Mombasa, Nakuru, Kisumu, Uasin Gishu,
  Machakos, Kajiado, Nyeri, Kilifi; Meru for an 11th. Trucks weighted to
  Mombasa/Nairobi/Nakuru, machines to Kiambu/Machakos/Kajiado.
- **12 merchants:** 7 individuals, 5 companies (company documents
  included), 1-15 vehicles each; all approved; every vehicle `live`, three
  car documents and both/five owner documents `review_state = ok`,
  insurance expiry 6-14 months ahead, `listing_ref` from `nextListingRef`.
- **Renters:** 2 seeded renters with accepted ID and licence, so the
  last session can book without an Ops step. No bookings are seeded.

### Photos (decision 1)

- **3 per vehicle, real photographs of that make and type.** One set of 3
  (front three-quarter, side, rear or interior/cab) per model, reused by
  every vehicle of that model; each vehicle still gets its own
  `documents` row and storage key, as `seed-demo.ts` does now.
- **About 40 models x 3 = ~120 images.** 20 exist already
  (`seed-assets/vehicles/*.jpg`, one per model, Wikimedia Commons).
- **Limit:** resized to 1280px long side, JPEG, **150 KB max** each;
  about 15-18 MB in all. Plates visible in a photo are blurred before
  commit (as the existing set was).
- **Where they live (recommended): in the repo** under
  `apps/api/src/scripts/seed-assets/vehicles/<model>/{1,2,3}.jpg`, with
  `_manifest.json` gaining `author`, `source_url`, `licence` per file and
  a `CREDITS.md`. Not fetched at seed time (sources move, and the VPS
  should not reach out to random hosts).
- **Source (recommended): owner-supplied where you have them, else
  Wikimedia Commons CC0 / CC BY / CC BY-SA and Unsplash, downloaded once by
  H1 and credited.** CC BY needs the author credited where the photo is
  shown: H1 adds a "Photo credits" link on seeded listings (dev only) that
  opens `CREDITS.md` content. Prefer CC0/Unsplash to avoid that.
- Nothing was downloaded in this session.
- Note: Ops' own photo check reads "Photos are of this actual vehicle -
  not stock". Seeded listings never pass Ops; the owner chose not to
  label them (decision 5), so the production refusal is the safeguard.

### Safety rules (the script enforces these)

- Refuses when `NODE_ENV=production`; when the database name in
  `DATABASE_URL` is not one of `cral_dev`, `cral_test`; when the working
  directory is under `/srv/cral/` (production checkout); and when
  `DATABASE_URL` host is not `localhost`/`127.0.0.1` unless `--server`
  is passed (the dev VPS run).
- **One email domain: `@cral-seed.test`** for merchants and renters
  (`seed-demo.ts` uses `@cral-demo.test`; keep them apart).
- **No phone at all**: `users.phone = null`, `phone_verified = false`.
  SMS sends only to a verified phone (`jobs/notification-delivery.ts:167`,
  `comms-bulk-send.ts:64`), so the dev server can never text a stranger.
  (`seed-demo.ts`'s `fakePhone()` makes real-looking +2547 numbers marked
  verified: H1 should not copy it.) Seeded merchants get payout method
  M-Pesa with no number; no bookings are seeded, so no payout run picks
  them up.
- **Plates unique and obviously fake:** `KZZ 001S` to `KZZ 100S` (an
  unissued series, `S` for seed); they pass the global unique plate index
  and are what `--clear` matches on together with the email domain.
- **Re-runnable:** upsert by email (users/merchants) and by plate
  (vehicles); a second run adds nothing and fixes drift (missing photos
  re-uploaded).
- **`--clear`** removes exactly what it made: users on `@cral-seed.test`,
  their merchants, vehicles on `KZZ ...S`, their documents, vehicle events,
  storage objects under the `seed-hire/` key prefix. **It refuses if any
  seeded vehicle has a booking** and lists them (the last session will
  make some), unless `--clear --with-bookings` cancels them first.
  `audit_log` rows stay (append-only by trigger); each run and each clear
  writes one `audit_log` entry, `actor_type: system`.
- `--dry-run` prints the counts per type and county and writes nothing.
- Prints at the end: counts per type, per county, per unit, photos
  uploaded, and the 12 merchant emails.

### Dev database (`cral_dev` on the VPS)

Nothing runs on the server without your go-ahead. When H1 is merged and
deployed to dev (auto, ~2 minutes), the commands are:

```
ssh cral@<vps>
cd /srv/cral-dev && git log -1 --oneline      # must include the H1 merge
npm run seed:hire -w apps/api -- --server --dry-run
npm run seed:hire -w apps/api -- --server
```

It reads `/srv/cral-dev/.env`, so `DATABASE_URL` is `cral_dev` and photos
go through that env's storage adapter (B2) - the photos travel in the
repo, so nothing is copied by hand. **Check first** that
`/srv/cral-dev/.env` points at a dev B2 bucket (or a dev key prefix), not
production's: H1 prints the bucket name in `--dry-run` for that reason.

---

## Part 4 - The PRs

Order: catalog contract first (everything else reads it), then data, then
screens, then the booking fixes, then the check. Each leaves `develop`
working.

### H1 - Catalog groups, summary, machine type

**Built 2026-11-26** on `feature/hire-catalog`. Machine types: excavator,
backhoe loader, wheel loader, skid steer, bulldozer, grader, roller,
forklift, telehandler, mobile crane, concrete mixer, other. A plate-less
machine stores its serial number in `registration` with
`registration_kind = 'serial'`. The cars page (`Browse.tsx`) now sends
`group=cars` when no type is picked, so it no longer lists trucks and
machines; the rest of the listing pages stay H3.

- **Goal:** the catalog can list "all cars", "all trucks", "all
  machinery", count them and give a from-price, and machines get a type.
  Contract first.
- **Files:** `openapi/customer-catalog.yaml`, `openapi/merchant-onboarding.yaml`,
  `openapi/admin-vehicles.yaml`; `apps/api/src/modules/catalog/{schemas,service,routes}.ts`;
  migration `vehicles.machine_type` (+ CHECK); `vehicles/categories.ts`
  (`MACHINE_TYPES`, `machineColumns`); `merchant/schemas.ts` +
  onboarding submit check; merchant `lib/vehicle-categories.ts` +
  onboarding vehicle form (machine type, seats for cars/vans, "no plate:
  serial number" for machinery if decision 4 says so); Ops case shows it;
  customer `lib/vehicle-categories.ts` mirror; tests.
- **Deleted:** nothing.
- **Worked when:** `GET /catalog/vehicles?group=cars` returns no truck or
  machine; `GET /catalog/hire-summary` counts match the DB; a machinery
  submit without type is 422; tests pass in the gate.
- **Size:** M. **Owner checks on dev:** nothing visible yet (API only);
  merchant onboarding shows "Machine type" for machinery.

### H2 - `seed:hire` and its photos, run locally

**Built 2026-11-26** on `feature/hire-seed`. 135 Wikimedia photos (45
models x 3; 41 CC0/PD, the rest CC BY/BY-SA, credited in `CREDITS.md`),
plates blurred, each <= 150 KB. Local run: 60/25/15, 11 counties, 12
merchants, 300 photos; second run adds 0; `--clear` leaves 0. Changes
from Part 3: no seeded truck is a Tata tipper (the free photos show a
dropside, so it is listed as a flatbed); the crane truck is a MAZ, the
low loader a Scania, to match their photos; `--clear --with-bookings`
deletes seeded bookings (cancelling would not free the vehicle rows) and
refuses any on a payout run. Seeded vehicles get their own `created_at`,
because the catalog's newest-first cursor drops rows that share a
timestamp below the millisecond (see "Not in this plan"). Not run on dev.

- **Goal:** 100 live vehicles with 3 real photos each, by the rules in
  Part 3; run on the laptop and report counts. Prints the dev commands
  and waits.
- **Files:** `apps/api/src/scripts/seed-hire.ts` (+ a small
  `seed-hire-fleet.ts` data file), `seed-assets/vehicles/<model>/`,
  `_manifest.json`, `CREDITS.md`, `apps/api/package.json` script,
  `docs/decisions/admin-ops.md` (seed line), `CLAUDE.md` script list.
- **Deleted:** nothing (`seed-demo.ts` stays).
- **Worked when:** local run shows 60/25/15, 10+ counties, 12 merchants,
  300 photos; second run adds 0; `--clear` leaves 0 `@cral-seed.test`
  users and 0 `KZZ` plates; every listing page has photos.
- **Size:** M (L if photos are sourced in-session). **Owner checks:**
  after you approve the dev run, `app-cral.vercel.app/trucks/search`
  shows 25 trucks with photos.

### H3 - The three listing pages and the cards

**Built 2026-11-26** on `feature/hire-pages`. `pages/Browse.tsx` is gone:
`pages/cars/CarsSearch.tsx`, `trucks/TrucksSearch.tsx` and
`machinery/MachinerySearch.tsx` sit on `components/hire/` (switch,
layout, filter sheet, states). Each page sends its `group`, so the cars
page never lists a truck or machine. Two API changes came with it: the
catalog cursor bug below is fixed (newest-first orders on
`date_trunc('milliseconds', created_at)`, with a test), and
`GET /catalog/vehicles` takes `priced=fixed|quote` for the trucks page's
"Price" filter (contract + test). Differences from the plan: the extra
filters sit behind one "Filters" pill on desktop too (the 2026-09-20
call), shown as removable tags; machinery has no "with operator" filter,
because every machine listed today has one and the filter would change
nothing. Not from a canvas.

- **Goal:** "Cars on hire", "Trucks on hire", "Machinery on hire" with
  the switch, per-type filters, sort, "Show 24 more", and designed
  loading/empty/error states; cards that read per type.
- **Files:** `apps/customer/src/pages/{Browse.tsx -> cars/CarsSearch.tsx}`,
  `pages/trucks/TrucksSearch.tsx`, `pages/machinery/MachinerySearch.tsx`,
  new `components/hire/{HireSwitch,HireListingLayout,FilterSheet,ListStates}.tsx`,
  `components/site/VehicleCard.tsx`, `lib/catalog-api.ts`, `routes.tsx`
  (same paths), `CarDetail.tsx:511` wording.
- **Deleted:** `pages/Browse.tsx` (split into the three pages and the
  shared layout).
- **Worked when:** cars page never shows a truck or machine; a quote-only
  truck card says "Price by quote"; no sideways scroll at 375; every
  filter changes the URL and survives reload; `check-links.mjs` clean.
- **Size:** L. **Owner checks:** the three pages on `app-cral.vercel.app`,
  on your phone.

### H4 - Hire section on the home page and the masthead

- **Goal:** three photo doors with live counts and from-prices, first
  under the hero; masthead shows one "Hire" entry with a small menu.
- **Files:** `pages/Home.tsx`, new `components/hire/HireDoors.tsx`,
  `components/subsite/{ServiceDoors,ServiceTabs}.tsx`, `lib/services.ts`
  (a `group: "hire"` on cars/trucks/machinery), `components/site/{Masthead,Footer}.tsx`,
  sitemap if it lists tabs.
- **Deleted:** the three separate hire tabs.
- **Worked when:** counts on the doors equal the counts on the listing
  pages; masthead fits at 375 with no scroll; `check-links.mjs` clean.
- **Size:** M. **Owner checks:** the home page on your phone and laptop.

### H5 - Renter papers before payment (customer booking)

- **Goal:** the renter is asked only for what the hire needs (decision
  3), and knows before paying whether CRAL has cleared their papers, so
  pickup never stops at the car.
- **Files:** `apps/api/src/modules/customer-bookings/service.ts`
  (`701-719`, copy per type), `bookings/service.ts:1033` (same rule),
  `openapi/customer-bookings.yaml` (a `documents` block on the booking),
  customer `pages/Booking.tsx` / `TripDetail.tsx` (papers status before
  the Pay button), Ops renter queue count on the Ops home, tests.
- **Deleted:** nothing.
- **Worked when:** a chauffeured truck or machine is requested with an ID
  only; a self-drive car still needs the licence; a renter with papers
  pending sees "Papers being checked - pay once cleared" instead of Pay;
  pickup never hits `hirer_documents_not_accepted` on a paid booking.
- **Size:** M. **Owner checks:** request a truck on dev as a new renter.

### H6 - Merchant onboarding fixes for trucks and machines

- **Goal:** a merchant can't go live without a verified email; listings
  read right for their type.
- **Files:** `apps/api/src/modules/merchant/service.ts` (submit checks
  `email_verified`), merchant onboarding copy for trucks/machines
  (`components/onboarding/steps/Vehicles.tsx`), "at least 3 photos"
  (F28), tests.
- **Deleted:** nothing.
- **Worked when:** submit with an unverified email is 422 with a "verify
  your email" step; a machinery listing never shows seats; onboarding a
  truck and a machine in the browser at 375 takes no detours.
- **Size:** S. **Owner checks:** sign up as a machinery owner on dev.

### H7 - The repeatable nine-walk check

- **Goal:** one command that runs the nine walks against a local API with
  console adapters, and a short written checklist for the by-hand screen
  walk, to run before every release.
- **Files:** `tools/hire-walk.mjs` (from this session's scratch scripts:
  sign up, onboard, Ops approve, request/quote, pay via the console
  callback, handover, return, for car, truck, machine; refuses to run
  unless the API reports console adapters), `docs/review/hire-walk.md`
  (screen checklist, 375 and 1280), `package.json` script `walk:hire`.
- **Deleted:** nothing.
- **Worked when:** `npm run walk:hire` prints 9 PASS lines on a fresh
  local database; fails loudly with the step and the API error otherwise.
- **Size:** S. **Owner checks:** nothing on dev; the last session uses it.

### Not in this plan (found on the way, belongs elsewhere)

- Console rail never settles a payment by itself; H7 posts the callback.
  The Daraja callback takes unauthenticated posts when
  `DARAJA_CALLBACK_USER` is empty (it is, locally); worth confirming the
  dev and production `.env` have it set (`payments.md`).
- Pickup code by email only (F17), Ops can't cancel/refund (F01): from the
  product review, still standing.
- Hourly machinery stays off until a time-of-day picker exists
  (`bookings-payouts.md`).
- **Fixed in H3.** Catalog paging (found in H2): `listCatalog`
  (`apps/api/src/modules/catalog/service.ts`) builds the newest-first
  cursor from `created_at.toISOString()` (milliseconds), but Postgres
  keeps microseconds, so rows sharing a millisecond with the page's last
  row are skipped and `has_more` turns false early. Before the H2 fix 100
  rows inserted in one transaction listed as 48. Fix the cursor (keep
  microseconds, or compare `date_trunc('milliseconds', ...)`) before H3
  relies on paging.
- Photo credits on screen: CC BY / BY-SA photos need the author shown
  where the photo appears; `CREDITS.md` holds them but no screen links it
  yet (Part 3 asked for a "Photo credits" link on seeded listings).

---

## Decisions for the owner

_Answered 2026-11-26; see the top of this file. Kept below as asked._

1. **Photo source.** Recommend: your own photos where you have them,
   else free-licence photos (Wikimedia CC0/CC BY, Unsplash) downloaded
   once in H2, about 120 images at 150 KB each kept in the repo and
   credited. Alternative: you send a folder of photos.
2. **Masthead.** Recommend: one "Hire" entry (Hire, Drivers, Towing,
   Garage, Parts), with a Cars/Trucks/Machinery menu and the switch on the
   listing pages. Alternative: keep three tabs.
3. **Renter papers.** Recommend: ID only when a driver or operator comes
   with the hire, licence only for self-drive; and the renter can't pay
   until Ops has cleared them. Alternative: keep asking both from
   everyone.
4. **Machinery details.** Recommend: add a machine type (excavator,
   backhoe, loader, grader, roller, dozer, forklift, crane) as a filter,
   and let a machine list with a serial number instead of a plate. Keep
   hourly hire off for now.
5. **Seeded listings on dev.** They will show "Logbook cleared" for
   papers nobody read. Recommend: a small "Sample listing" label on
   seeded cards and pages (dev only), so the client is never misled.
   Alternative: no label.
