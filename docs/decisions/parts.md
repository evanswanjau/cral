# Spare parts (Phase 5)

Read before touching parts outlets, parts requests, parts quotes or part
orders. Queue and design notes:
[`docs/plans/verticals-roadmap.md`](../plans/verticals-roadmap.md) (Phase 5,
"Design notes"). Parts run on the garage engine, so read
[`garage.md`](./garage.md) first: everything there holds unless this file
says otherwise. Contracts `openapi/customer-garage.yaml`,
`openapi/merchant-garage.yaml`, `openapi/admin-garage-orders.yaml`,
`openapi/merchant-outlets.yaml` (each has a PT1 paragraph).

## Owner decisions (2026-11-19)

- **Paid through CRAL**, upfront when the customer accepts a quote; the
  dealer is paid out after the customer confirms it's the right part.
- **Delivery is the dealer's own**, priced as a `delivery` line on its
  quote. CRAL arranges no riders.
- **Auto-confirm 72 h** after the dealer marks it delivered (or fitted),
  unless the customer reported a wrong part first.
- **Commission** is its own admin-only setting, `commission.parts` in
  `platform_settings`, seeded at the hire rate (migration
  `20261123090000_parts_orders`). Never shown to a merchant: the API sends
  shilling take-home amounts only.

## One engine, not a second copy (PT1, built 2026-11-19)

Migration `20261123090000_parts_orders`; no new module and no new ID
prefix. A parts request is a `quote_requests` row with `kind = 'part'`, a
parts quote is a `quotes` row, a part order is an `orders` row with
`kind = 'part'`. Accept, pay (`startStkPush` -> `applySettlement` ->
`applyOrderPayment`), the 72 h sweep, Ops resolve, refunds and payouts
(`payableOrders` / `cutPayoutRun` / `payoutPosition`) are the GS3 code,
unchanged except for wording and the rate they read
(`verticalOf(kind)` in `modules/garage/service.ts`).

- **Parts outlets** are `outlets` with `kind = 'parts'`, created through the
  same `POST /merchant/outlets` and reviewed in the same Ops outlet queue
  (the checklist's `applies_when: garage` items skip them). A parts outlet
  has no `service_types` (ignored if sent). Same two gates: account
  approved -> outlet approved -> can quote.
- **Onboarding** step 1 offers "Spare parts". It is a premises offer like
  garage services: picked alone (or with garage services and nothing
  else) it sets `merchants.garage_only`, which now means "premises only"
  (no new column; drivers made the same "no offers column" choice).
  Submitting lands on `/premises/new?kind=parts`. The portal's "Garage
  jobs" nav item is now "Jobs and orders" (both kinds); the quote inbox
  holds both kinds.
- **A parts request** (`POST /me/parts-requests`) names one car from My
  cars that **has its chassis number** (422 `car_needs_chassis`: dealers
  quote against it), the part (`part_name`), details, the county and a
  **delivery address**. It goes to up to 5 live parts outlets of approved
  merchants in the county, one per merchant, oldest approval first (422
  `no_dealers_in_county`). `service_type` is null on it (a DB CHECK keeps
  each kind's fields). Same rate limit bucket as garage requests. Reading,
  cancelling and accepting use the `/me/garage-requests/:id` routes; the
  customer's lists take `kind` (default `service`, so the garage pages
  are unchanged).
- **Who sees the address:** only the dealers asked to quote, as with the
  chassis number. Never public.
- **A parts quote** must name `part_condition` (`genuine` / `oem` /
  `used`) and `fulfilment` (`fitted` at the dealer's premises, or
  `delivered`). Delivered needs at least one priced `delivery` line;
  fitted has none (422 `delivery_line_required` /
  `delivery_line_not_needed`). A garage quote names neither (422
  `not_a_parts_request`). `days_needed` reads as days to hand it over. A
  DB CHECK keeps condition and fulfilment both set or both empty.
- **A part order** has ref `P-YYMMDD-NNN` (the `G-` daily counter, its own
  letter) and snapshots the money at `commission.parts` on accept. The
  dealer marks it delivered or fitted (`POST .../ready`) straight from
  `paid` (or after the optional "start", shown as "getting it ready"):
  audit `order.delivered` / `order.fitted`, and the 72 h clock starts.
  **No extra-work quotes** on a part (409 `not_for_parts`): anything else
  is a new request.
- **"Right part"** is `POST /me/garage-orders/:id/confirm` on a part order
  (audit `order.right_part_confirmed`). **A wrong-part dispute** is
  `POST .../problem` (audit `order.wrong_part_disputed`): it stops the
  clock and holds the money for Ops, exactly like a garage problem.
- **Ops** settles it on the GS4 console, renamed "Garage jobs and parts",
  with a Garage / Parts filter (`GET /admin/garage-orders?kind=part`):
  release (the dealer is paid in its next run) or refund (every payment
  sent back by `executeRefund`). The case shows the part, its condition
  and fitted/delivered.
- **Customer screens:** `/my-parts` (account menu "My parts": the request
  form and the list), then the garage request and order pages, which
  read a parts request in its own words ("It's the right part", "Wrong
  part"). `/parts` still redirects to `/#coming`: the parts landing is
  PT2.
- **Notifications** keep `subject_type: garage_request` / `garage_order`
  so the existing CTAs open the shared pages in both apps.
- **Service record:** a confirmed part order is on the car's record like a
  garage job (it carries `part_name`). The merchant's "Your work on this
  car" panel is not shown on a part order.
- Not from a canvas (none exists for parts yet): the screens are the
  garage ones with parts wording, built from tokens.ts.

## Not built in PT1

- The `/parts` sub-site, its landing copy and "Coming to CRAL" cleanup on
  the front door and the merchant landing (PT2). Onboarding's own
  "Coming to CRAL" strip no longer lists parts dealers.
- Picking one named dealer; a stock catalog (no catalog in v1, owner call).
- Request photos; SMS to the customer (feed only, as with garage).
- Unpaid part orders don't expire on their own (the customer can cancel).
