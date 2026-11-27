# Drivers that work (review and proposal)

Status: **approved by the owner, 2026-11-27** ("I agree with the
recommendations"). DR1-DR3 built; DR4-DR5 not built. Drivers come before buy-and-sell cars. Drivers shipped on 2026-10-18
([`drivers.md`](./drivers.md), [`../decisions/drivers.md`](../decisions/drivers.md));
this is a check of how they work today and what it would take to make
them feel like the new Hire ([`hire-search-first.md`](./hire-search-first.md)).

## One screen for the owner

**What works today** (each cell checked on this machine, 2026-11-27):

|  | Driver only (renter's own car) | Car with the owner's driver |
|---|---|---|
| **Merchant: add a driver, 3 documents, submit** | Works | Works |
| **Ops: approve the owner, accept 3 documents, approve the driver** | Works | Works |
| **Customer: find, book, pay, hand over, return** | Works with help: `/drivers` is a reading page, no dates in the search, no photos; the driver hears nothing about the job | Works |

Both bookings went from request to **completed**: `CB-261127-036`
(driver only, 4 hours, KES 2,000) and `CB-261127-037` (RAV4 plus the
owner's own driver).

**What is rough**

- **Nothing to look at.** Before my walk there were **0 drivers** in the
  local database (143 live vehicles). No seed makes drivers.
- **`/drivers` is a reading page**, the thing the owner asked to remove
  from Hire: a hero, four steps, prices, questions, a "Drive for a
  living?" band. The list is in the middle.
- **No search by date.** You pick a county only, then find out on the
  request whether the driver is free.
- **No faces.** Each driver card shows the first letter of their name in
  a circle.
- **The driver is never told.** No SMS or email reaches the driver's own
  phone; only the owner's account hears about the job, and only the
  owner's login can finish the handover.
- **No ratings** and **no code from driver to renter** (both left as
  follow-ups in October).

**What the owner would see after the proposal:** the menu reads
Buy and sell, Hire, Drivers. "Drivers" lands straight on results: county,
dates and rate type at the top, then cards with each driver's photo,
rates and who they drive for. Locally there are about 40 drivers to look
at, from the seeded owners.

**How many PRs:** 3 to 5, one fresh session each (list at the end).

---

## How this was checked

- **My own API copy on port 4100** with `EMAIL_ADAPTER`, `SMS_ADAPTER`,
  `PAYMENT_ADAPTER`, `DISBURSEMENT_ADAPTER` = `console`,
  `STORAGE_ADAPTER=local`, **Redis db 8**. Nothing else was running on
  4000 or 5173-5175 at the start. The three apps ran on 5173-5175 pointed
  at 4100.
- **Merchant, Ops and customer jobs were driven through the API**, the
  same calls the portals make, in a scratch script modelled on
  `tools/hire-walk.mjs`. The merchant and Ops steps were **not clicked
  through**; I only looked at their screens afterwards.
- **Screens looked at in Chrome (1280 wide):** customer `/drivers` and
  `/drivers/:id`; merchant `/drivers` and `/drivers/new`; Ops `/drivers`
  (all filters) and one driver case. The merchant portal on `localhost`
  opened already signed in to a saved account, so I did not use it; I
  signed in to my own test accounts at `127.0.0.1` instead.
- Ops: my own local admin `drivers.plan.ops@example.test`, made with
  `admin:create`; the SMS code came from my API's console output.
- Payment: the console rail, settled by posting the console-shaped
  callback to `/payments/daraja/callback`, as the hire walk does.

**Left in the local database** (delete whenever you like): merchants
`drivers.plan.570486.solo@example.test` (drivers only) and
`drivers.plan.570486.fleet@example.test` (one RAV4, `KDP486D`), drivers
`Juma Plan570486 1` and `2`, renter `drivers.plan.570486.renter@example.test`,
admin `drivers.plan.ops@example.test`, bookings `CB-261127-036/037`
(completed). Nothing was seeded.

## Findings, with evidence

### The walk

| Job | Step | Result | Evidence |
|---|---|---|---|
| Merchant | Sign up, email code, details, phone code, owner ID + KRA | Works | 201/200 |
| Merchant | "I only drive" (`drivers_only`) then submit with no car | Works | `PATCH /merchant/onboarding {drivers_only:true}`, submit 200 (`merchant/service.ts:1199`) |
| Merchant | Add a driver (name, phone, ID, KRA, licence, expiry, county, rates) | Works | `POST /merchant/drivers` 201, `draft` |
| Merchant | Three documents, submit | Works | 3 x `POST /merchant/drivers/:id/documents` 200; submit 200, `pending` |
| Merchant | Add-driver screen | Works | `/drivers/new`: one form, "This is me" switch, rates; documents are added on the driver's page after saving. No photo field |
| Merchant | Drivers list | Works | `/drivers`: "Juma Plan570486 2 · Live · 3/3 docs · KES 2,500 / day" |
| Ops | Driver in the queue | Works | `GET /admin/drivers?filter=open` lists it; screen tabs To review / Changes sent / Approved / Rejected / All |
| Ops | Approve the owner, accept 3 documents, approve | Works | all 200; driver `live`. Case shows ID, KRA, licence, expiry, the 3 scans (no checklist, by design) |
| Customer | Find the driver | Works with help | `GET /catalog/drivers` lists both; `/drivers` screen shows them under a hero |
| Customer | Car offers its owner's driver | Works | `GET /catalog/vehicles/:id/drivers` -> `source: owner`, 1 driver |
| Customer | Request driver only, by the hour | Works | `POST /bookings` 201, 4 h x KES 500 = KES 2,000 |
| Customer | Pay before papers cleared | Refused, as designed | 422 `papers_not_cleared` (driver only needs the ID) |
| Customer | Pay, console M-Pesa, settles | Works | `/pay` 202, callback 200, payment `success` |
| Merchant | Pickup code, pickup, return | Works | code emailed to the renter, entered on the merchant's handover; `completed` |
| Customer | Car + the owner's own driver, same steps | Works | `CB-261127-037` `completed`, one booking (not linked) |
| Driver | Told about the job | **Not built** | API output for the whole run: no SMS or email to either driver's phone (`+2547570486x5`); all went to the owners, the renter and Ops |

Not walked this time: a car with **another owner's** driver (two linked
bookings). It is covered by API tests and was not touched since October.

### What the customer sees at `/drivers`

- A **reading page**: `pages/Drivers.tsx:111-125` renders `SubsiteHero`,
  the list, `HowItWorksSteps` (4 steps), `PriceExplainer` (4 rows),
  `FaqList` (5 questions) and `EarnBand`. Only the list is search.
- **County only, no dates.** `DriverCountyPicker` offers just the
  counties that already have drivers (`Drivers.tsx:104`); a busy driver
  shows until the request is refused with 422 `driver_unavailable`
  (`customer-bookings/service.ts:772`).
- **The first 100 drivers only**, filtered in the browser
  (`lib/drivers-api.ts:22` `limit: "100"`; no "more" button).
- **No photo.** Cards show the first letter in a circle
  (`components/drivers/DriverList.tsx:57-73`); the `drivers` table has no
  photo column. A photo was left out on purpose in October (owner's call
  1 in `drivers.md`: no photo among the documents).
- **How many locally:** 0 before this walk, 2 now (mine). 72 live
  listings come with a driver or operator (`chauffeured`: cars, all
  trucks, machines), but none of those drivers exists as a record, so they
  never appear at `/drivers` and a self-drive seeded car offers none.
- The driver's page (`/drivers/:id`) is already a booking form: rate
  picker, days or hours, "The car they'll drive", total, "Sign in to send".
- Small: `DriverList.tsx:9` says cards show "first name and surname
  initial"; they show the full name (the October follow-up changed it).

### Menu today

`lib/services.ts`: Hire (dropdown), Drivers (plain link to `/drivers`),
Towing, Garage, Parts. "Buy and sell" exists (`key: "selling"`) but is not
live, so it is not in the menu yet (`hire-search-first.md`: it appears
only once its pages ship).

### The driver's side

- A driver is a record, not an account. They have no login and get no
  message. For a driver-only job the pickup code goes to the renter by
  email and is entered **in the merchant portal**
  (`POST /merchant/handovers/:id/otp/verify`), so a company's driver
  standing with the renter cannot finish the handover without the
  owner's login. For "This is me" drivers (the owner is the driver) this
  is fine.
- The October plan wanted the code to run the other way for driver-only
  jobs (an SMS to the driver, read to the renter). Not built
  (`drivers.md` section 9).

## What the owner decided (2026-11-27)

All five recommendations, as asked:

1. **Drivers match Hire first** (DR1 before anything else).
2. **`/drivers` goes straight to results**, searched by county and dates;
   the reading parts sit below the results.
3. **Driver cards show a face**: a plain photo, no "verified" badge. This
   reverses the 2026-10-18 call that drivers have no photo (the photo is
   still not a document Ops checks).
4. **Seed about 40 drivers locally**, same safety rules as `seed:hire`,
   phones from a range no real phone uses, and the seed refuses to run
   unless SMS is `console`.
5. **The driver gets an SMS** when a job is paid, and for driver-only jobs
   the handover code runs driver to renter, so the owner's login is not
   needed at the roadside.

Menu order Buy and sell, Hire, Drivers, with Drivers a separate top item
(not inside the Hire dropdown).

## Proposal

**Approved as written below.** Drivers match Hire: search first, no
reading page between the menu and the results, real seeded drivers to
look at, and the menu order Buy and sell, Hire, Drivers.

1. **`/drivers` becomes the search.** Results first, built from the
   `/hire` layout: county, dates (and hours when "per hour" is picked),
   rate type, sort by price, a count ("14 drivers in Nairobi"). The
   catalog filters by county and drops drivers already booked on those
   dates (the same overlap rule the request uses), with cursor paging
   instead of the 100 cap. The how-it-works, prices and questions move
   **below the results**, cut to a few lines, as on `/hire`. The "Drive
   for a living?" band stays at the very bottom.
2. **A photo of the driver** (owner's yes, 2026-11-27). One photo field
   on the add-driver form (through `createUpload`), shown on the card and
   the driver's page; Ops sees it on the case. Not a document and not a
   check: no badge says it was verified. This changes October's call, so
   it is recorded in `docs/decisions/drivers.md`.
3. **`seed:drivers` (or drivers added to `seed:hire`)**, with the same
   safety rules as `seed:hire`: refuses production, any database but
   `cral_dev` / `cral_test`, and a non-local host without `--server`;
   every account `@cral-seed.test`; re-runnable; `--clear` removes only
   what it made and refuses while a seeded driver has a booking. About
   **40 drivers** from the 12 seeded owners across their counties, a mix
   of day, hour and trip rates, licences in date, documents accepted,
   and photos from a free-licence set kept in the repo. **One difference
   from `seed:hire`:** a driver must have a phone. Seeded drivers get
   numbers from a range no real phone uses (the builder names the range
   in the PR), and the seed
   refuses to run unless SMS is `console`, so nothing can text a
   stranger.
4. **Menu order Buy and sell, Hire, Drivers.** Today that means Hire,
   Drivers (Buy and sell joins in front when its pages ship, as already
   agreed). Drivers could also join the Hire dropdown as "Drivers"; my
   pick is to keep it a separate top item, one click to results.
5. **Tell the driver.** An SMS to the driver's phone when a job is
   accepted and paid (date, time, pickup, renter's first name), and for
   driver-only jobs the code runs driver to renter, as planned in
   October, so the owner's login is not needed at the roadside.
6. **The walk covers drivers.** `npm run walk:hire` gains the two driver
   walks above, so this stays checked.

Not proposed: driver ratings. There is still no rating flow for anyone;
add it for owners and drivers together, later.

## PR list (one fresh session each)

In this order. Tick each row when its PR merges.

| PR | What | Needs | Status |
|---|---|---|---|
| **DR1** | Search-first `/drivers`: catalog filter by dates and paging (contract first, `openapi/customer-catalog.yaml`), results page from the `/hire` layout, reading parts below results, menu order | - | Done (`feature/drivers-search`) |
| **DR2** | Driver photo: column, upload on add/edit, card and page, Ops case | - | Done (`feature/driver-photo`) |
| **DR3** | `seed:drivers`, about 40 drivers with photos, same safety as `seed:hire`, safe phone range, refuses unless SMS is `console` | DR2 | Done (`feature/drivers-seed`) |
| **DR4** | Driver SMS on paid jobs; driver-to-renter code for driver-only jobs | Read `bookings-payouts.md` (handover rules) first | Not started |
| **DR5** | `walk:hire` covers driver only and car with driver | DR1, DR4 | Not started |

Each PR updates `docs/decisions/drivers.md` and
`docs/decisions/customer-portal.md` where a decision changes.
