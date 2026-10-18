# Car sales - feature review and plan

Status: **plan only, nothing built** (2026-10-18). Parked behind drivers
(owner's call, 2026-10-18) - [`drivers.md`](./drivers.md) goes first and
introduces `merchants.offers`, which this plan adds `'seller'` to.

Selling is the canvas's "NEXT" vertical, inert today in `Home.tsx` and
`AccountMenu`'s "Sell a car" row, and outside `road-to-transactable.md`'s
scope - building it needs its own recorded owner call in CLAUDE.md.

---

## Car sales

### 1. Business-model options

**Option S-A - classifieds / lead generation (recommended for v1).**
Merchant lists a car for sale, buyer enquires, viewing and sale happen
off-platform. CRAL earns from a listing fee and/or a paid boost (the
brand's skewed "boosted" state exists exactly for "paid"). Low legal risk,
no money held.

**Option S-B - assisted sale.** S-A plus CRAL-run steps: viewing
appointments booked in-app, an optional third-party inspection (e.g. an
AA Kenya report uploaded as a document - never a CRAL "inspected" badge
without one), offer tracking, and a transfer checklist (NTSA eCitizen
logbook transfer, clearing bank caveat). Success fee invoiced to seller.
Good v2.

**Option S-C - escrow marketplace.** Buyer pays CRAL, CRAL releases on
transfer. **Not recommended now**: car prices exceed M-Pesa transaction
limits (needs RTGS/bank rails we don't have), holding buyer funds likely
needs CBK-regulated escrow arrangements, and there is no B2C/refund rail
at all. Revisit only with a bank partner (Co-op) escrow product.

### 2. Who can sell

Owner's ask is "merchants who can also sell". v1: **approved merchants
only**, with `offers` gaining `'seller'` (see `drivers.md`, "Data model"). That
keeps the account gate (national ID / KRA / company docs) in front of
every seller - the main defence against fake listings. Later options: a
light "sell one car" flow for private individuals (still goes through the
account gate), and a dealer tier (bulk listings, yard address, monthly
plan).

### 3. Data model - two options

**Reuse `vehicles` with `listing_purpose = hire | sale | both`.** One
plate uniqueness, one photo set. But every hire query must then filter
purpose, rental fields (rate, hiring unit, min hire) are meaningless for
sale, and the seven-state status is the *hire* listing's status.

**Separate `sale_listings` (recommended).** `sal_` prefix,
optional `vehicle_id` FK:
- From the fleet: "Sell this car" on VehicleDetail creates a sale listing
  pointing at the vehicle (photos/logbook reused, plate already unique).
- Sale only: a car never hired out - a new `vehicles` row in a non-hire
  state is wrong; instead the sale listing carries its own make/model/
  year/plate and the **same normalised-plate unique index** spans both
  (plate can't be live in two sale listings, and a sale listing for a
  plate owned by another merchant's fleet is a clash).

Fields: asking price (money pair, integer cents), negotiable flag,
mileage (km), condition, engine cc, body, drive (2WD/4WD), transmission,
fuel, colour, year of manufacture, **import status** (locally used /
foreign used / new), **logbook encumbrance** (bank joint ownership -
very common with financed cars in Kenya; must be disclosed, and the
reviewer checks the logbook), accident history disclosure, service
history, county + viewing location, description, photos.

Reference: `S-YYMMDD-NNN` via a `sale_ref_daily_counters` table and
`nextSaleRef`, exactly as CLAUDE.md already says a car-sale ref should be
shaped when built.

Status: `draft / pending / review / action / rejected / live / paused`
(reuse) plus **`under_offer`, `sold`, `withdrawn`**.

Documents (per sale listing): `logbook` (reuse kind, must be in the
merchant's name or the company's), `sale_photo`, optional
`inspection_report`, optional `bank_clearance_letter` when encumbered.

### 4. Enquiries

- `sale_enquiries` (`enq_`): buyer user, listing, message, preferred
  viewing time, status `new / replied / viewing_booked / closed`.
- Buyer must be signed in with a **verified phone** to enquire;
  rate-limited (same shape as towing's 5/hour).
- **Seller contact is not public.** The merchant sees the enquiry in-app
  and chooses to reply / share their number. Stops scraping and protects
  sellers. An in-app thread is v2; v1 is "merchant replies -> buyer gets
  email + in-app notification with the merchant's chosen contact".
- Fraud guards: listing copy and in-app warnings "never pay a deposit to
  hold a car"; report-a-listing button -> Ops; Ops can pause a listing.

### 5. Interaction with hire

- A fleet vehicle with a live sale listing **stays hireable** until
  `under_offer` (merchant's choice), then hire pauses automatically.
- `sold` is blocked while the vehicle has confirmed future bookings
  (409 `vehicle_has_upcoming_bookings`) - cancel or complete them first.
- `sold` archives the vehicle (`paused` + an archived flag), keeps
  bookings/payouts history intact (same rule as account deletion keeping
  bookings).
- Natural cross-sell for later: "Hire before you buy" - a sale listing
  that is also a hire listing gets a "Try it for a day" button.

### 6. Money

- v1: listing free during launch, or a flat listing fee via Daraja STK
  (existing rail; `Idempotency-Key` required - it moves money).
- Boost (paid placement for N days) = the skewed "boosted" pill; a
  `sale_boosts` row with start/end, purchased via STK.
- Success fee (S-B) = an invoice, not a charge - unenforceable
  off-platform in S-A, so don't promise it there.
- Commission percentage rule still applies: no % shown to merchants
  outside the terms.

### 7. Portals

**Merchant**: "For sale" nav item (shown when `offers` has `seller`),
sale listings list + detail (status, enquiries count, views), create from
a fleet car or from scratch, enquiries inbox, mark under offer / sold /
withdraw, boost purchase. Dashboard tile: open enquiries.

**Customer**: the `selling` vertical from
`Cruz Ride Auto - Website.dc.html` (pull canvas source first) - `/buy`
browse (make, model, price band, year, county, body, import status),
listing detail (photos, specs, disclosures shown prominently,
encumbrance, inspection report if any), enquire, saved cars; `/sell`
explainer pointing to the merchant portal (replaces the inert "Sell a
car" row).

**Admin**: sale-listing queue + case (`modules/admin-sale-listings`, queue
`sales`, `admin_reviewer`) on the checklist components - logbook name
matches account, plate matches logbook, encumbrance disclosed truthfully,
photos are of this car (plate visible), price not absurd (advisory).
Reported-listing queue. Enquiry oversight (counts, abuse). Boost revenue
in the future Finance group.

---

## Proposed PR sequence

1. **S1 Seller offer + sale listings (merchant side)** - `'seller'` in
   `merchants.offers`, `sale_listings`, `S-` ref, documents, merchant
   screens. `openapi/merchant-sales.yaml`.
2. **S2 Sale review in Ops** - queue, case, report-a-listing.
3. **S3 Buy pages + enquiries (customer)** - from the canvas `selling`
   vertical. `openapi/customer-sales.yaml`.
4. **S4 Fees and boosts** via STK.
5. **S5 Assisted sale (S-B)** - viewings, inspection reports, transfer
   checklist.

## Questions for the owner before S1

1. Sales v1 model: classifieds (S-A) confirmed? Free listings at launch,
   or a listing fee from day one?
2. Private individuals selling one car - in v1, or merchants only?
