# Car sales (Phase 6)

Read before touching sale listings, the merchant "Cars for sale" section,
the Ops sale review (CS2), the buy pages and enquiries (CS3) or boosts
(CS4). Queue: [`docs/plans/verticals-roadmap.md`](../plans/verticals-roadmap.md)
Phase 6 and "Car sales - updates". Background and options:
[`docs/plans/car-sales.md`](../plans/car-sales.md). Contract:
`openapi/merchant-sales.yaml`.

## Owner decisions (2026-11-19)

- **Classifieds, no escrow.** Listings and enquiries; buyer and seller pay
  each other directly. CRAL holds no money and takes no commission on a
  sale.
- **Merchants only** in v1, behind the account gate.
- **Free to list at launch.** The fee exists only as
  `platform_settings.sales.listing_fee` (cents), seeded `0` = off. Nothing
  reads or charges it until CS4, which also builds paid boosts.

## Listings (CS1, built 2026-11-19)

Migration `20261124090000_sale_listings`; module
`apps/api/src/modules/sale-listings`; merchant screens `/sales`,
`/sales/new`, `/sales/:listingId`.

- **Own table, not `vehicles`.** `sale_listings` (`sal_`) carries its own
  make/model/year/plate. No fleet link in CS1 ("Sell this car" from a hire
  vehicle is later, if asked).
- **Ref** `S-YYMMDD-NNN` from `sale_ref_daily_counters` (`nextSaleRef`,
  same shape as `CB-` and `H-`), given at create.
- **Asking price** is bigint cents via `addMoneyColumn(..., { big: true })`:
  integer cents stop at KES 21.4M. Read back with `Number()`. The API takes
  and returns the usual `{ amount, currency: "KES" }`.
- **Files** (`sale_listing_files`, `slf_`): photos (4 to 12, images) and one
  logbook (image or PDF, replaced on re-upload), kept out of `documents`
  like outlet photos. Through `createUpload()`, type checked on the bytes.
  Buyers never see the logbook.
- **One open listing per plate**: partial unique index on the normalised
  registration while not `sold`/`withdrawn`; 409
  `registration_already_listed`. A clash with another merchant's hire
  fleet is not checked: the CS2 reviewer checks the logbook.
- **Statuses** `draft / pending / review / action / rejected / live /
  paused / sold / withdrawn`. Merchant moves: submit
  (`draft|action|rejected -> pending`, or `review` when a reviewer already
  holds it), `live <-> paused`, `live|paused -> sold`, any open status but
  `draft -> withdrawn`; drafts are deleted instead. `sold` and `withdrawn`
  are final. Ops moves (`pending -> review -> live|action|rejected`) are
  CS2's; `review_assignee`, `reviewer_note`, `decided_at` and `live_at`
  are its columns.
- **Locks**: everything editable on `draft/action/rejected`. On
  `live/paused` only price, negotiable, viewing area and description
  (`REVIEWED_FIELDS` are what Ops checked); 409 `sale_listing_locked`.
  Nothing changes while Ops has it or once final.
- Every change is a conditional update on the status read, with
  `audit_log` (`entity_type = 'sale_listing'`) in the same transaction.
- **No notification on submit** in CS1 (no `sale_listing` notification
  subject yet). CS2 adds it with the Ops decision.

## Who sells (onboarding)

- "Cars for sale" is a step-1 option in "What do you offer?" (`selling`).
  There is still **no `offers` column**: like `garage_only`,
  `merchants.sells_only` is set only when selling is picked with nothing
  that needs a vehicle, so submit needs no vehicle. Step 3 is then
  "Cars for sale" (`steps/Selling.tsx`) and submitting lands on
  `/sales/new`. Picked with garage or parts, both flags are set and the
  premises path wins.
- The portal's "Cars for sale" nav item shows when the merchant has a
  sale listing, `sells_only`, or picked selling on this device
  (`offersSelling`).
- The public merchant landing still lists "Car sellers" as coming; their
  join page is for CS3.

## Rules that carry on

- No commission percentage on any merchant surface (none applies here).
- No trust signal without data: no "inspected" or "verified" badge on a
  listing unless a real check backs it (CS2's review decision, a real
  inspection report later).
- Listing copy warns: never pay or take a deposit to hold a car.
