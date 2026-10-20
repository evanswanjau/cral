# Car sales - plan

Status: **built** (2026-10-19, branch `feature/car-sales`, not yet
merged). S1-S4 shipped together on one branch; see "11. What shipped, and
where it differs" at the end. Supersedes the 2026-10-18 draft of this
file, which proposed listing fees, paid boosts and merchants-only selling.
The website canvas already decides those questions differently (below),
and the canvas owns product copy decisions.

Selling sits outside `road-to-transactable.md` / `pr-delivery-plan.md`.
The first PR needs its own recorded owner call in CLAUDE.md, the same way
Services (2026-09-23) and Drivers (2026-10-18) got one.

**Drivers has shipped** ([`drivers.md`](./drivers.md), PRs #62-#64, merged
to `main`), so sales is next. Drivers never added `merchants.offers` (it
used `merchants.drivers_only`), and this plan no longer needs it. What
sales takes from drivers:

- **Its shape**: a separate entity table, a `documents.<entity>_id` FK, a
  normalised-unique index, and its own Ops queue and module
  (`admin-drivers`). `sale_listings` follows that shape.
- **Its gotcha**: account-document queries must filter `driver_id: null`
  as well as `vehicle_id: null`. `sale_listing_id` makes that **three**
  filters. S1 should replace the repeated `where` clauses with one helper
  (e.g. `lib/documents.ts#accountDocuments`) before adding the third,
  otherwise a sale listing's logbook reads as the account's.
- **Where it differs**: drivers has no checklist (three documents to
  accept or reject, then one decision). Sales keeps the checklist, because
  its core promise ("names and chassis numbers have to agree") is a set of
  cross-document comparisons, not single-document accepts.

---

## 1. What the canvas already decides

`docs/brand/canvas/Cruz Ride Auto - Website.dc.html`, the `selling`
vertical (status `IN BUILD`) and the Home "Buy and sell" door (`NEXT`):

- **Free listings, no commission, no money held.** "No deposits held, no
  cut of your sale." "KES 0 commission when you sell your car on CRAL."
  "CRAL never holds the money or takes a commission."
- **Individuals and dealers alike.** "Free listings for individuals and
  dealers alike." The customer account menu has a "Sell a car" row, and
  the account tabs read "My cars" for a merchant and "Listing" for
  everyone else. So **private sellers list from the customer portal and
  merchants list from the merchant portal.**
- **Read before it is listed.** "Logbook, ID and the eight photographs we
  specify. Names and chassis numbers have to agree before the advert
  appears at all."
- **Known faults are required.** "Sellers fill in a short known-faults
  block. It is required."
- **The buyer meets the seller.** The deal and the money happen
  off-platform.
- **An optional Verified badge** is "a physical visit, not a mechanical
  inspection" (onboarding copy). It needs field staff, so it is out of v1
  (see section 9).

So v1 is **reviewed classifieds**. CRAL's value is the document review,
not the payment. That is the same promise the hire side makes, and it
reuses most of the same machinery.

Ruled out for now: **escrow** (car prices exceed M-Pesa limits, holding
buyer funds needs a regulated arrangement, and there is no B2C or refund
rail) and **listing fees or boosts** (they contradict "free listings").
Boosts can come back later on the skewed "boosted" pill if the owner
changes the model.

## 2. Who sells, and the seller gate

**A sale listing is owned by a `users` row, not a `merchants` row.** Merchants
and renters share `users` and the public token, so one seller API serves
both portals.

| Seller | Where they list | Gate before a listing can go live |
| --- | --- | --- |
| Merchant (individual or company) | Merchant portal | `merchants.approved_at` set (the existing account gate) |
| Private individual | Customer portal | Their `national_id` document is `ok` (the existing renter ID review in `admin-renters`) |

- `sale_listings.seller_user_id` is always set. `merchant_id` is set when
  the seller is a merchant, so a company's listings belong to the business.
- **The logbook name must match the seller**: the person, or the company
  for a company merchant. That is a checklist item, not OCR (same rule as
  "Logbook name match is NOT a check" in the vehicle review).
- **Limit for private sellers**: at most 2 open listings per user. More
  than that is a dealer, and dealers go through merchant onboarding. This
  stops private accounts being used as unreviewed dealerships.

## 3. Data model

**A separate `sale_listings` table**, not a `listing_purpose` column on
`vehicles`. Hire fields (rate, hiring unit, minimum hire, chauffeured) mean
nothing for a sale, and `vehicles.status` is the hire listing's lifecycle.
Mixing the two would make every hire query filter on purpose.

`sale_listings` (`sal_` prefix, added to `packages/types/src/ids.ts`):

- `seller_user_id`, `merchant_id` (nullable), `vehicle_id` (nullable FK,
  set when listed from a fleet car)
- `ref`: `S-YYMMDD-NNN` from `sale_ref_daily_counters` +
  `lib/sale-ref.ts#nextSaleRef`, mirroring `nextListingRef`. This is the
  shape CLAUDE.md already reserves for a car-sale ref.
- Car: `category` (the five slugs from `vehicles/categories.ts`), make,
  model, year of manufacture, registration, chassis number, mileage (km),
  engine cc, transmission, fuel, colour, drive (2wd / 4wd / awd), import
  status (`locally_used` / `foreign_used` / `new`)
- `asking_price_amount` / `_currency` via `addMoneyColumn`, `negotiable`
- Disclosures: `known_faults` (required text, may say "none known"),
  `accident_history` (`none` / `minor` / `major` + note), `encumbered`
  (bank on the logbook), `service_history` (`full` / `partial` / `none`)
- `county`, `viewing_area` (an area, never a street address in public),
  `description`
- Review: `status`, `reviewer_note`, `review_assignee`, `submitted_at`,
  `live_at`, `expires_at`, `sold_at`, `sold_via_cral` (nullable boolean,
  asked when marking sold, for metrics only)

**Statuses**: `draft / pending / review / action / rejected / live /
paused / under_offer / sold / withdrawn / expired / removed`. The first
seven keep their hire meanings. `removed` is an Ops takedown, distinct from
a seller's own `withdrawn`. Client labels go in a new `SALE_STATUS` map
beside the existing vocabularies in each portal's `status.ts`.

**Plate and chassis uniqueness across both tables.** A functional unique
index can't span `vehicles` and `sale_listings`, so:

- A partial unique index on `sale_listings` (normalised plate, and
  separately chassis) where status is not in `sold / withdrawn / expired /
  rejected / removed`. One open sale per car.
- At create and submit, the service takes
  `pg_advisory_xact_lock(hashtext(normalised plate))` and checks
  `vehicles`. If the plate is another account's fleet car, return 409
  `registration_taken`. If it is the seller's own fleet car, the listing
  must carry that `vehicle_id`.

**Documents**: add a nullable `documents.sale_listing_id` (FK, cascade). The
existing `merchant_id XOR user_id` CHECK still holds, because the owning
account is set as today. New kinds:

- `sale_photo` plus a `slot` column with eight fixed slots: front, rear,
  left, right, front interior, rear seats, dashboard with the odometer
  showing, engine bay with the chassis plate. Slots are fixed so a reviewer
  can tick "chassis plate visible" against one specific photo.
- The existing `logbook` kind, scoped to the sale listing. For a fleet car
  it is copied by reference from the vehicle's logbook, not re-uploaded.
- `bank_clearance_letter`, optional, expected when `encumbered`.
- `ntsa_search`, optional: an eCitizen official search record. Shown on
  the listing when present, never required (owner's call, section 10).
- Uploads go through `lib/uploads.ts#createUpload()`, as every multipart
  route does. Storage is the B2 adapter.

**Checklist**: `sale_review_checks` (`(sale_listing_id, item_id)` PK) plus a
`sale_review.checklist` key in `platform_settings`, read by a third entity
in `lib/review-checklist.ts` beside `vehicleChecklist` and
`merchantChecklist`. Items carry a `document` key, so the checklist-first
behaviour (auto-accept, re-upload resets answers) works unchanged.

**Enquiries**: `sale_enquiries` (`enq_`): listing, buyer user, message,
preferred viewing window, status `new / replied / closed`, `contact_shared_at`.

**Reports**: `sale_listing_reports` (`rpt_`): listing, reporter, reason
(`not_available / wrong_details / scam / duplicate / other`), note, status.

## 4. Lifecycle

1. **Draft.** The seller fills in details, disclosures and the eight photos
   plus the logbook. Submit needs every required field and photo (422 per
   missing piece, same shape as `submitVehicle`).
2. **Pending, then review.** It enters the Ops `sales` queue. Working a
   case claims it, as in the vehicle review.
3. **Decision**: approve to `live` (needs the seller gate passed and the
   checklist fully passed), request changes to `action`, or reject to
   `rejected`. Each decision writes the listing, `audit_log` and `notify()`
   in one transaction.
4. **Live for 60 days**, then `expired` via `runDailyReminderSweep`, with a
   reminder 7 days before. One tap renews it without re-review if nothing
   changed. Stale adverts are the main trust problem on classifieds sites.
5. **Seller actions**: pause, `under_offer`, `sold`, `withdrawn`. Editing
   the price or description of a live listing stays live. Editing the car
   details, disclosures or photos sends it back to `review`.
6. **Ops actions**: `removed` (takedown with a note, notifies the seller)
   and reinstate.

## 5. Buyers and enquiries

- **Browsing is public**: `/buy` and `/buy/:ref`, with no sign-in. Server-side
  filters are make, model, price band, year, mileage band, county, category
  and import status. Pagination is cursor-only. JSON-LD `Car` + `Offer` for
  SEO, the same pattern as `CarDetail.tsx`.
- **Enquiring needs sign-in with a verified phone**, and is rate-limited to
  5 an hour per buyer (the same shape as towing).
- **The seller's number is never public.** The seller sees the enquiry
  in-app and by notification, and replies with the contact they choose to
  share. That writes `contact_shared_at` and notifies the buyer by email
  and in-app. Sellers can set "share my number automatically with buyers
  who enquire". An in-app message thread is a later slice.
- **Fraud guards**: fixed copy on every listing and enquiry ("Never pay
  anything before you have seen the car and the logbook in person"), a
  report button on every listing, and repeat reports surfacing in the Ops
  queue.

## 6. Interaction with hire

- "Sell this car" on the merchant `VehicleDetail` creates a draft that
  pre-fills from the vehicle and links `vehicle_id`.
- A fleet car on sale **stays hireable while `live`**. At `under_offer` its
  hire listing pauses automatically, and it resumes if the sale goes back
  to `live`.
- `sold` is blocked while the vehicle has confirmed future bookings (409
  `vehicle_has_upcoming_bookings`).
- `sold` takes the vehicle off hire permanently (`paused` + an
  `archived_at`) and keeps its bookings and payouts history, the same rule
  as account deletion.

## 7. Portals

**Merchant** (in the existing portal look, "Merchant:" title prefix,
Phosphor icons): a "For sale" nav item with an open-enquiries badge, a list
of sale listings, a detail page (status, reviewer note, enquiries, views),
create from a fleet car or from scratch, and an enquiries inbox. Dashboard
gets an open-enquiries tile.

**Customer**: the `selling` vertical page from the canvas at `/sell`,
replacing the inert "Sell a car" row and the Home door. Then `/sell/new`
(private-seller form), the account "Listing" tab, `/buy` browse, `/buy/:ref`
detail with the disclosures shown prominently, and saved cars later. The
canvas has the vertical page but **no browse, detail or sell-form screens**,
so those get built from `tokens.ts` in the `Browse.tsx` / `CarDetail.tsx`
idiom and flagged as provisional, the way C9/C10 were.

**Admin**: a `Sales` nav group with a review queue and case screen
(`modules/admin-sale-listings`, new queue `sales`, `admin_reviewer`;
`admin_super` bypasses), built on the existing `components/console/review/`
components. A reports queue, a takedown and reinstate action, and live
listing oversight (filter by status or seller). Starter checklist:

| Document | Item |
| --- | --- |
| Logbook | Name matches the seller (person or company) |
| Logbook | Plate and chassis on the logbook match the listing |
| Logbook | Encumbrance on the logbook matches the `encumbered` answer |
| Photos | All eight slots show this car (plate visible front/rear) |
| Photos | Chassis plate photo matches the logbook chassis number |
| Photos | Odometer photo is consistent with the stated mileage |
| Listing | Known-faults block is a real answer, not filler |
| Listing | Price is plausible (advisory - there is no valuation data, so no automatic check) |

## 8. Contracts and modules

Contract-first, one file per domain, frozen before each slice:

- `openapi/sales-seller.yaml`: `/me/sale-listings*` and
  `/me/sale-enquiries*`, used by both the merchant and customer portals.
  Module `modules/sale-listings/`.
- `openapi/sales-catalog.yaml`: public `/sales*` and authenticated
  `POST /sales/{ref}/enquiries` and `/reports`. Module `modules/sales-catalog/`.
- `openapi/admin-sales.yaml`: `/admin/sale-listings*` and
  `/admin/sale-reports*`. Module `modules/admin-sale-listings/`.

Idempotency keys: no endpoint moves money, so none are required. Enquiries
and reports use the rate limiter instead.

## 9. PR sequence

Each PR passes `typecheck`, `lint`, `test -w apps/api` and `build` locally
before merging. Seller UI comes before Ops review so the queue is reviewed
against real listings, not seeded ones.

1. **S1 Sale listings API.** Owner call recorded in CLAUDE.md,
   `sales-seller.yaml` frozen, the migration (`sale_listings`,
   `sale_ref_daily_counters`, `documents.sale_listing_id` + `slot`,
   `sale_review_checks`, `sale_enquiries`, `sale_listing_reports`),
   `nextSaleRef`, plate and chassis locking, the seller gate, draft and
   submit, and tests.
2. **S2 Seller screens.** Merchant "For sale" (including "Sell this car")
   and the customer `/sell`, `/sell/new` and "Listing" tab.
3. **S3 Ops review.** `admin-sales.yaml`, queue, case, checklist,
   decisions, notifications, takedown.
4. **S4 Buy side.** `sales-catalog.yaml`, `/buy` browse and detail,
   enquiries, contact sharing, reports, the 60-day expiry sweep, and the
   hire interaction (`under_offer` pauses hire, `sold` archives).
5. **Later, each with its own owner call:** the Verified-badge physical
   visit (needs field staff and a booking flow), an in-app message thread,
   saved cars and price-drop alerts, "hire before you buy" on cars that are
   both for sale and for hire, and boosts if the free model changes.

## 10. Owner's calls (2026-10-19)

1. **Private sellers are in v1**, with at most **2 open listings** per
   private account. More than that is a dealer, who goes through merchant
   onboarding.
2. **An NTSA eCitizen official search is optional.** A seller may upload
   one (new document kind `ntsa_search`, scoped to the sale listing like
   `bank_clearance_letter`), and the listing shows that it has one. It is
   never required, so a listing stays free.
3. **A fleet car on sale stays hireable until `under_offer`.** Hire pauses
   automatically at `under_offer` and resumes if the sale goes back to
   `live` (section 6).

Nothing is left open before S1.

## 11. What shipped, and where it differs

Everything in sections 2-7 and 9 (S1-S4) is built: API, merchant "For
sale", the customer site's `/sell`, `/sell/new`, `/my-listings`, `/buy`,
`/buy/:ref` and `/my-enquiries`, and the Ops "Car sales" queue and case.
Tests: `modules/sale-listings`, `modules/sales-catalog`,
`modules/admin-sale-listings` (`__tests__`).

Where the build differs from this plan:

- **No `accountDocuments` helper.** Sale documents carry
  `documents.sale_listing_id` as their *only* owner (the one-owner CHECK
  became `num_nonnulls(merchant_id, user_id, sale_listing_id) = 1`), so no
  owner-keyed account-document query can pick them up in the first place.
  Simpler than threading a third `whereNull` through a dozen readers.
- **The checklist lives in code** (`SALE_CHECKLIST` in
  `modules/admin-sale-listings/service.ts`) with answers in
  `sale_review_checks`, not in `platform_settings` via
  `lib/review-checklist.ts`. That library is being reworked on the
  unmerged checklist-first branch; sales follows its rules (every item
  answered, none flagged) without coupling to it. Move it across once that
  branch lands.
- **Approve accepts the documents.** Photos and papers are read through
  the checklist, so approving marks every document a reviewer didn't
  reject as accepted; a reviewer can still ask for one photo or paper
  again on its own.
- **The asking price is `bigint`.** Integer cents (`addMoneyColumn`) top
  out at KES 21.4M - below plenty of cars.
- **Refs are unhyphenated** (`S261019001`), matching `main`'s `H`/`CB`
  refs; the hyphenation migration is on an unmerged branch.
- **A sold car's plate is free for a new sale listing**, but its old
  `vehicles` row still holds `vehicles_registration_norm_unique`, so the
  new owner can't add it to a *hire* fleet yet. Hire-side follow-up.
- **Enquiries stop at `under_offer`** (409 `listing_under_offer`) - the
  plan didn't say; a buyer can still see the car.
- **Fleet logbook is copied as bytes**, not shared by reference, so
  deleting one row can't take the other's file.
- **New notification category `enquiry`** (kind `hire`, email on / SMS
  off by default), since none of the six existing categories fit a buyer
  asking about a car.
