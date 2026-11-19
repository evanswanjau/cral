# Garage services (Phase 4)

Read before touching outlets, "Your premises", the Ops outlet queue, or
any garage request, quote or order. Queue and design notes:
[`docs/plans/verticals-roadmap.md`](../plans/verticals-roadmap.md) (Phase 4,
"Design notes"). Contracts `openapi/merchant-outlets.yaml`,
`openapi/admin-outlets.yaml`, `openapi/customer-garage.yaml`,
`openapi/merchant-garage.yaml`, `openapi/admin-garage-orders.yaml`.

## Owner decisions (2026-11-19, "use your recommendation")

- **Paid upfront, held by CRAL.** The customer pays when they accept the
  quote; the garage is paid out after the customer confirms the job.
- **Auto-confirm after 72 h** from "ready" (parts: "delivered") unless the
  customer raised a problem first.
- **Parts delivery** is the dealer's own, priced as a quote line. CRAL
  arranges no riders.
- **Commission** for services and for parts is its own admin-only
  `platform_settings` value per vertical (`commission.garage`, seeded in
  GS2 at the hire rate; `lib/commission.ts` falls back to
  `COMMISSION_RATE`). Never shown to a merchant: the API sends shilling
  take-home amounts only.
- Car sales: free listings at launch, paid boosts in CS4, listing fee a
  setting defaulting to 0.

## Outlets (GS1, built 2026-11-19)

Migration `20261120090000_outlets`; modules `modules/outlets/` (merchant)
and `modules/admin-outlets/` (Ops); merchant screens
`pages/{PremisesList,AddPremises,PremisesDetail}.tsx`; console
`pages/outlets/{Queue,Case}.tsx`.

- **An outlet is its own record** (`outlets`, `out_`), like a driver. A
  merchant can have several. `kind` is `garage` or, since PT1, `parts`
  (see [`parts.md`](./parts.md)).
  Garage outlets carry `service_types` (`service`, `diagnostics`,
  `mechanical`, `bodywork`, `tyres`, `electrical`, `ac`).
- **Gates:** account approved -> outlet approved -> can quote (GS2). A
  merchant offers garage services by having an approved garage outlet.
  There is still no `offers` column.
- **Statuses** reuse the listing set (`draft / pending / review / action /
  rejected / live / paused`). Send needs 2+ photos (at most 8) and, for a
  garage, a service. `action`/`rejected` can be sent again; a reviewer who
  already had it gets it straight back (`review`).
- **Name, address and county lock** while Ops has the outlet and once
  approved (409 `outlet_locked`); hours, phone and services stay editable.
  Changing them on a draft or sent-back outlet clears the visit and makes
  every premises check `pending` again (`details_updated_at`, the same
  derived staleness as a re-uploaded document). A live outlet can be
  paused, not deleted.
- **Photos are `outlet_photos` (`olp_`), not `documents`.** Account
  document queries filter `vehicle_id`/`driver_id` null; a photo with
  neither would read as an account document. JPEG/PNG/WebP only, through
  `createUpload()`.
- **The visit is a record, never a badge.** The checklist item
  `visit_done` can only pass with `visited_on` (not in the future) and
  `visited_by` (who went); both are stored on the outlet with
  `visit_recorded_by`. Any other answer clears them (a DB CHECK keeps the
  two together). The merchant's `visited` and the case's `visit` are read
  from that record only. Customer-facing "visited" (GS4) must read the
  same columns on a `live` outlet.
- **Ops review is checklist-first** on `lib/review-checklist.ts`:
  definitions in `platform_settings` (`outlet_review.checklist`, items
  under `premises` or `photos`, `applies_when: garage`), answers in
  `outlet_review_checks`. Every item answered before any decision, approve
  needs no flags, the account approved and 2+ photos. Only `pending` /
  `review` are decidable (409 `outlet_not_in_review` once moved). Answering
  claims an unassigned case. Each decision is one transaction with
  `audit_log` (checklist snapshot) and `notify()` (`subject_type:
  outlet`, CTA `/premises/:id`). The decision POST takes an
  `Idempotency-Key`.
- **Queue:** `admin_reviewer` on the new `outlets` queue (Team tab lists
  it); `admin_super` sees all.
- **Onboarding:** step 1 offers "Garage services". Picked alone (no
  vehicle) it sets `merchants.garage_only`, which waives "at least one
  vehicle" the way `drivers_only` does; step 3 is a short "Your
  premises" note and submitting lands on `/premises/new`. Premises are
  added in the portal, after submit, so an assist session (AG3) never
  reaches them.
- **Portal nav** shows "Premises" when the merchant has an outlet, has
  `garage_only`, or picked garage services on this device. A garage-only
  merchant with no vehicles gets no Vehicles item. The dashboard, booking
  and payout copy still speak of vehicles for a garage-only merchant:
  that is GS4's garage sub-site work.
- Not from a canvas (none exists for outlets): merchant screens follow
  `DriverList`/`DriverDetail`, the console follows `drivers/` with the
  shared `ChecklistRow`.

## My cars, requests and quotes (GS2, built 2026-11-19)

Migration `20261121090000_garage_quotes`; module `modules/garage/`;
contracts `openapi/customer-garage.yaml`, `openapi/merchant-garage.yaml`;
customer `pages/garage/{GarageHome,GarageRequestPage}.tsx`,
`pages/MyCars.tsx`; merchant `pages/GarageRequest{List,Detail}.tsx`.

- **My cars** (`customer_cars`, `car_`): make, model, year, plate,
  optional chassis number. The plate is unique per customer only (a
  normalised index), not globally. A car with requests can't be removed
  (409 `car_has_requests`). The logbook photo the design notes mention is
  not built (optional; left for GS4's service record).
- **A request** (`quote_requests`, `rfq_`) names one car, a service type
  (the outlet `service_types`), a description and a county. It goes to up
  to **5 live garage outlets of approved merchants in that county that do
  that service, one per merchant**, oldest approval first
  (`quote_request_outlets`). None -> 422 `no_garages_in_county` and
  nothing is stored. Broadcast only: picking one named garage waits for
  GS4's garage pages. Request photos are not built yet. 5 an hour per
  customer. Statuses `open -> cancelled` (GS3 adds `accepted`).
- **A quote** (`quotes`, `quo_`, lines `quote_lines`, `qln_`): one per
  outlet per request; lines `part` / `labour` / `delivery` / `other`, each
  a positive amount in cents; the total is written from the lines in the
  same transaction. Sending again revises it in place (lines replaced,
  audit `quote.revised`). Valid 48 h from the last send; `expired` is
  derived. Quoting needs the request `open` (row locked `FOR UPDATE`
  against a racing cancel; 409 `request_not_open`) and the outlet `live`
  (422 `outlet_not_live`). A decline withdraws the quote and blocks
  re-quoting (409 `request_declined`).
- **Who sees what:** a merchant sees only requests one of its outlets was
  asked about (others 404), with the chassis number and the customer's
  first name, no phone. The customer sees sent quotes cheapest first, each
  garage's name, address, county and its recorded visit date (never a
  default). `POST /merchant/garage-requests/quote-preview` returns total
  and take-home in shillings so the quote form never needs the rate.
- **Notifications:** a new request notifies each asked merchant
  (`booking` category, SMS per their preferences); a quote notifies the
  customer's own feed. `subject_type: garage_request`, CTA
  `/garage/requests/:id` in both apps.
- **Money moves in GS3** (below): the request page's "Accept and pay"
  creates the order.
- **Garage went live in GS4** (below); until then the registry kept it
  under "Coming to CRAL" and `/garage` was reachable only directly.
  "My cars" is in the account menu. The merchant portal adds
  "Quote requests" (with the to-quote count) after Premises.

## Orders and money (GS3, built 2026-11-19)

Migration `20261122090000_garage_orders`; `modules/garage/orders.ts`
(every transition), `modules/garage/order-settlement.ts` (the order's side
of a settled payment), `jobs/garage-order-confirm.ts`; customer
`pages/garage/GarageOrderPage.tsx` (+ `components/garage/OrderParts.tsx`),
merchant `pages/GarageOrder{List,Detail}.tsx` (+
`components/garage/ExtraQuoteForm.tsx`, nav "Garage jobs" with the
to-start count).

- **An order (`orders`, `ord_`, ref `G-YYMMDD-NNN` from
  `order_ref_daily_counters`)** is created by accepting a quote: one per
  request and per quote, one payee. Statuses `awaiting_payment -> paid ->
  in_progress -> ready -> completed`, plus `cancelled` (unpaid only, no
  prompt open), `problem` (customer, while in progress or ready) and
  `refunded` (Ops). Every move is a conditional update on the status it
  checked (409 when it moved), audited in the same transaction, and
  notifies the other side (`subject_type: garage_order`, CTA
  `/garage/orders/:id` in both apps).
- **Accept** locks the request, closes it (`accepted`), marks the quote
  `accepted` and every other original quote `superseded` (those garages get
  a feed line), and snapshots the money onto the quote
  (`commission_amount`, `merchant_net_amount`, at `commission.garage`
  today). The order's money columns are the **sum of the paid quotes'
  snapshots**, never recomputed from a rate (DB CHECK: net = gross -
  commission).
- **Payment** is `startStkPush` in `modules/payments/service.ts` (shared
  with bookings; `payment_requests` gains `order_id` + `quote_id`, CHECK
  exactly one of booking/order). `applySettlement` stays the one copy of
  the settle rules (match, amount check, idempotency) and calls
  `applyOrderPayment` for an order's row inside its transaction. Pay takes
  whatever is due: the original quote while `awaiting_payment`, or an
  accepted extra while `in_progress`. A prompt still open is returned, a
  paid quote is 409 `already_paid`. **A second success for a quote already
  paid, or money for an order cancelled while its prompt was open, is
  refunded** (`recordOrderRefund`, reasons `order_duplicate` /
  `order_closed`) and sent by `executeRefund` after commit.
- **The garage starts only once paid** (409 `order_not_paid`).
- **Extra work is a second quote** (`quotes.kind = extra`, same request and
  outlet, `order_id` set; the one-per-outlet unique is now a partial index
  on originals). Only while `in_progress`, one open at a time (409
  `extra_pending`). The customer accepts (snapshot taken then) and pays it,
  or declines; the garage can withdraw it until paid. "Ready" is refused
  while an extra is sent or accepted-but-unpaid. Extras never show on the
  request's quote list.
- **Confirm**: the customer confirms a `ready` job, or
  `autoConfirmReadyOrders` (BullMQ every 15 min) completes it 72 h after
  `ready_at` (`confirmed_by` `customer` / `auto` / `ops`). A problem stops
  the clock.
- **Problems go to Ops**: `GET /admin/garage-orders?status=problem`,
  `POST /admin/garage-orders/:id/resolve` (`admin_support` /
  `admin_finance`, Idempotency-Key) with `release` (completes, payable) or
  `refund` (every successful payment refunded once, reason
  `order_refunded`, partial unique on `(payment_request_id, reason)`).
  The console screen arrived in GS4 (below).
- **Payouts**: a `completed` order is payable. `payableOrders` +
  `cutPayoutRun` add it as a `payout_run_lines` row with `order_id`
  (unique, so it pays once; CHECK not both booking and order), the order
  ref, the customer's name, the car's plate, paid-to-confirmed dates and
  the order's snapshots. `payoutPosition` counts payable orders in "next
  payout" and paid-but-unconfirmed ones in clearing; the dashboard's
  next-payout card lists them too. The daily cut picks up merchants with
  only garage jobs owed. Run wording says "jobs" when a run has any.
- **The merchant sees shillings only**: what the customer paid and what it
  keeps (`take_home`), never the commission or its rate, never the
  customer's phone. Ops sees the commission.
- **Idempotency-Key** on accept, pay, cancel, accept-extra, confirm and Ops
  resolve. Start, ready, extra send/withdraw/decline and problem move no
  money and rely on their conditional updates.
- **Not built:** unpaid orders don't expire on their own (the customer can
  cancel); the customer gets feed notifications only (no SMS), as with
  quotes; the service record on My cars is GS4.

## Service record, live sub-site, Ops console (GS4, built 2026-11-19)

No migration. `modules/garage/service-record.ts`; customer
`pages/CarServiceRecord.tsx` (`/my-cars/:id`), `pages/garage/GarageHome.tsx`;
merchant `components/garage/YourWorkOnThisCar.tsx`,
`pages/join/GarageJoinPage.tsx`; console `pages/garage-orders/{Queue,Case}.tsx`.

- **The service record is read, never stored.** It is the car's orders
  with status `completed` (customer, auto or Ops release), latest
  `completed_at` first, cursor-paged on `completed_at`. Cancelled and
  refunded jobs are not on it; a job still running isn't either. Each
  entry carries the paid quotes' lines (original, then extras), the
  garage and the total. Nothing on it can say more than the jobs did.
- **Who sees it:** the customer, every garage's completed work on their
  own car (`GET /me/cars/:carId/service-record`; another customer's car is
  404). A garage, only jobs its own outlets completed on that car, reached
  through one of its own orders (`GET /merchant/garage-orders/:orderId/service-record`;
  another merchant's order is 404), with total and take-home in
  shillings, never the commission. It shows on the merchant job page as
  "Your work on this car".
- **Garage is a live service** in `lib/services.ts`: tab "Garage", door
  "Get a car fixed", footer link, `/garage` in the sitemap. The hero keeps
  the canvas `vertDefs` copy. Parts moved up to the "NEXT" pill.
  `/services` (which meant garage services) now redirects to `/garage`;
  `/parts` still goes to `/#coming`. The landing is written out in full
  (four steps, price rows, eight FAQs) and promises only what is built:
  broadcast to up to 5 visited garages in the county, never "pick a
  garage". No count of garages is shown. Hero photo: an Unsplash
  placeholder (Dextar Studio), credited in `CREDITS.txt`.
- **`/join/garages`** is its own merchant page, not a `SupplierType`: a
  garage has no vehicle, no per-unit rate and so no estimator. Same
  landing shell, steps, "what you need" and FAQ. `?offer=garage` is now a
  remembered offer and pre-selects "Garage services" in onboarding. The
  landing lists garages under "Now open" (and in the footer); the
  "Coming to CRAL" strip is parts dealers and car sellers.
- **Ops console "Garage jobs"** (`/garage-orders`, `admin_support` /
  `admin_finance`, the roles the endpoints allow): the problem queue is
  the default filter, then the other statuses. The case shows the
  problem, job, money (commission included, Ops only), quotes and
  timeline, and settles a problem through GS3's resolve endpoint (release
  or refund, a note both sides read, a fresh `Idempotency-Key` per
  submit). No new endpoint.
- **Not built:** the logbook photo on My cars; picking one named garage
  (GS2's "garage listing pages" in the roadmap's PR detail table) needs
  public outlet pages and was left out: the owner's GS4 brief named the
  service record, the sub-site and the Ops screen.
