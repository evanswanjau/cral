**Start prompts for UI0 onward:** one per PR in
[`docs/prompts/ui-rebuild/`](../prompts/ui-rebuild/README.md), in the
README's order, each in a fresh session on the model in the table. Each
build ticks its row here.

# CRAL roadmap - every service, one phase at a time

Last rewritten 2026-11-18. **This file is the queue.** Every build session
starts by reading its own phase here and nothing else in `docs/plans/`
unless that phase points to it.

## What we're building, in one paragraph

CRAL is one place for everything a vehicle needs in Kenya: hire a car, a
truck or a driver, call a tow, get a car fixed, buy a part, buy or sell a
car. Every supplier is a merchant checked by CRAL, every price is agreed
before work starts, and money moves through CRAL by M-Pesa (car sales are
the exception: buyer and seller pay each other). Today the site looks like
a car-hire website. The phases below make each service real **and** make
each one look and feel like its own place.

## Phases at a glance

| Phase | What the client gets | Status | Sessions (PRs) |
|-------|----------------------|--------|----------------|
| 0 | Cheaper, faster build sessions (no client-visible change) | **Built** (P0) | 1 (done) |
| 1 | Hire a truck: route, load, quotes, per-km/per-tonne | Built, in `main`. **Production deploy pending** | 3 (done) |
| 2 | Each service gets its own sub-site, on the website and the merchant portal | Not started | 1 review + 3-5 builds |
| 3 | Sales agents sign up owners in the field | AG1 built (`develop`); AG2, AG3 not started | 3 |
| 4 | Garage services: quote first, pay through CRAL | Not started | 4 |
| 5 | Spare parts: quoted against your chassis | Not started | 2 |
| 6 | Buy and sell cars: verified listings + enquiries | Not started | 4 |

**Why this order.** Phase 0 cuts the cost of every phase after it. Phase 2
comes before the new services so that garage, parts and car sales each land
straight into their own sub-site instead of being bolted onto a car-hire
site and redone later. Sales agents (3) touch only Ops and onboarding, so
they don't wait on the UI. Garage (4) builds the order engine parts (5)
reuses. Car sales (6) moves no money, so it carries the least risk.

## How every phase runs

1. **One PR = one fresh session.** Never continue a long chat into the next
   PR. The roadmap and the plan files carry the context, not the chat.
2. **Start the session with the phase's start prompt** (below). **Opus
   builds every PR.** Only the chores at the end (checks, commit, push, PR,
   merge, dev deploy) go to the `shipper` agent on Haiku, which Phase 0
   adds. See [`docs/prompts/working-cheaply.md`](../prompts/working-cheaply.md).
3. **Each PR** branches off `develop` as `feature/<name>`. When the code is
   done, the build session hands off to `shipper`, which runs
   `npm run gate`, commits, pushes, opens and merges the PR to `develop`,
   and reports back. It runs in the background, so the owner never waits,
   and the Opus session never runs TypeScript, ESLint or the tests itself.
   If anything fails, `shipper` returns only the failing lines, Opus fixes
   them and hands off again.
4. **Dev deploys itself.** After Phase 0, a timer on the VPS deploys
   `develop` within a few minutes of each merge (`~/deploy-dev.status`
   shows the result). The owner smoke-tests on `app-cral.vercel.app` and the
   dev merchant/admin.
5. **At the end of each phase the owner says "ship phase N".** New env
   keys go into `/srv/cral/.env` first. The `release` agent merges
   `develop` -> `main` and starts `~/redeploy.sh` detached (it backs up the
   database before migrating). The owner checks `cral.co.ke`,
   `merchant.cral.co.ke` and `admin.cral.co.ke` in the browser. The next
   phase starts only after that check.

### The standard start prompt

Every phase below gives a short prompt. They all expand to this:

> Read `docs/plans/verticals-roadmap.md`, Phase {N}, PR {ID}, and only the
> files that section points to. Build PR {ID} and nothing else. Branch off
> `origin/develop` as `feature/{name}`. Contract first if the PR adds or
> changes an endpoint. Update this roadmap's status for {ID} and the
> matching `docs/decisions/` entry as part of the change. Don't run the
> checks yourself: when the code is done, hand off to the `shipper` agent
> with the branch name and a one-paragraph PR summary. If it reports gate
> failures, fix them and hand off again. Finish with a report of 15 lines
> or fewer: what changed, the PR link, what the owner must check on dev,
> anything left open. Do not start the next PR.

---

## Phase 0 - Cheaper build sessions

**Client sees:** nothing. **Why first:** every later session pays for it.

| PR | What | Model |
|----|------|-------|
| P0 | `npm run gate` (quiet, once per PR), a pre-push hook, the `shipper` and `release` agents on Haiku in the background, dev auto-deploy on the VPS, and CLAUDE.md cut from ~2,000 lines to an index (stale and reversed entries removed, current decisions moved into `docs/decisions/`) | Opus |

**Start prompt:** the full P0 prompt is in
[`docs/prompts/working-cheaply.md`](../prompts/working-cheaply.md#the-p0-session-prompt).

**Done when:** `npm run gate` passes and prints under 20 lines on success;
`git push` runs it automatically; an Opus session can hand a finished branch
to `shipper` and get back a merged PR link; CLAUDE.md is under 300 lines;
every current decision is findable in `docs/decisions/`, and every removed
stale entry is listed in the PR for the owner to check.

---

## Phase 1 - Trucks (built)

**Client sees:** pick a truck by type and capacity; say where from, where
to and what's being moved; the owner sends a price; accept it and pay by
M-Pesa. Owners can price per trip, per day, per km or per tonne, or always
quote.

| PR | What | Status |
|----|------|--------|
| T1 | Truck type + carrying capacity, catalog filter | Built, `main` (#70/#71) |
| T2 | Route and load on truck requests | Built, `main` (#72) |
| T3 | Quotes, per-km / per-tonne, "Always quote me first" | Built, `main` (#73) |

**Left to do (owner):** database dump, `~/redeploy.sh`, `~/redeploy-dev.sh`,
browser check of one truck request end to end (request -> quote -> accept
-> pay). Detail: [`trucks-and-sales-agents.md`](./trucks-and-sales-agents.md) Part A.

---

## Phase 2 - Every service gets its own sub-site

**Client sees:** the website stops reading as "a car-hire site with extra
pages". The home page becomes a front door to every service, and each
service (hire cars, trucks, drivers, towing, then garage, parts, buy and
sell) has its own sub-site: its own headline, photography, how-it-works,
prices and booking flow, still unmistakably CRAL. Dead and duplicate links
go. The merchant side does the same: a truck owner, a driver or a garage
signs up into something that is clearly about **their** service, and the
portal shows the sections for what they offer.

**This phase starts with a review, not with code.** Cursor's attempt
(reverted in #77/#78) rewrote two 1,700-line pages without a plan.

| PR | What | Model |
|----|------|-------|
| 2A | **Built** ([#83](https://github.com/evanswanjau/cral/pull/83)). **Review and proposal only.** Audit every page and link, propose the sub-site structure, wireframes and the PR split, write the build prompts. No code. Stops for owner approval. | Opus |
| UI0 | **Built.** Link fixes that need no new page; `tools/check-links.mjs` | Sonnet |
| UI1a | **Built.** Service registry, sub-site components, service tabs in the masthead | Opus |
| UI1b | **Built.** Front door at `/`; `/cars` landing; coming block; `/services` and `/parts` redirect to `/#coming` | Opus |
| UI1c | **Built.** `/cars/search`, `/cars/:id/book`; `/browse`, `/book/:id` redirect (truck and machinery `/browse` stay until UI2a/UI2b) | Sonnet |
| UI2a | **Built.** `/trucks` landing, `/trucks/search`, `/trucks/:id` (route-first `TruckRequestPanel`), `/trucks/:id/request`; truck `/browse`, `/cars/:id`, `/book/:id` redirect | Opus |
| UI2b | **Built.** `/machinery` landing, `/machinery/search`, `/machinery/:id`, `/machinery/:id/book`; machinery `/browse`, `/cars/:id`, `/book/:id` redirect; sitemap lists the sub-site paths and each listing under its category | Opus |
| UI3 | **Built (#93).** `/drivers` landing (county pick, list, `EarnBand` -> `/join/drivers`), public `/drivers/:id` with inline phone verify (`PhoneVerify`, out of `Booking.tsx`); public `/towing` (form kept through sign-in, your requests); `/services/towing` redirects; quote email and sitemap use `/towing` | Opus |
| UI4 | **Built.** Merchant "Earn with CRAL" landing (supplier doors, coming suppliers, shared estimator) and `/join/cars`, `/join/trucks`, `/join/machinery`, `/join/drivers`; `/create-account?offer=` kept in sessionStorage for UI5 | Opus |
| UI5 | **Built (#92).** Onboarding step 1 "What do you offer?" (multi-select, derived not stored); driver-only gets a Drivers step, no vehicle docs, lands on `/drivers/new`; vehicle form opens on the picked category; step 3 labelled Trucks/Machinery/Drivers | Opus |
| UI6 | **Built (#94).** Portal nav from `components/portal/nav-sections.ts` (no Vehicles for driver-only; Trucks/Machinery when the whole fleet is one kind); dashboard buttons, greeting, fleet card and per-unit rates by offering; bookings/payouts copy for driver-only | Opus |
| UI7 | Copy sweep; strict link check in the gate | Sonnet |

**Start prompt for 2A:** the full prompt is
[`docs/prompts/ui-services-review.md`](../prompts/ui-services-review.md).
Paste its "Stage A" block into a fresh Opus session.

**Start prompts for 2B onward:** 2A writes them to
`docs/prompts/ui-rebuild/` once the owner approves the proposal. Each is
self-contained.

**Done when:** each live service is reachable in one click from the home
page and from the masthead, every link on the site goes somewhere real,
services that aren't live yet appear once, honestly, never as a dead link,
and a merchant who signs up as a truck owner, a driver-only merchant or (in
Phase 4) a garage never sees car-hire wording that doesn't apply to them.

---

## Phase 3 - Sales agents

**Client sees:** CRAL's sales team can sign up truck and car owners in the
field, see who they brought in and how far each one got, and fill in the
paperwork with the owner beside them. Agents never approve anyone.

| PR | What | Model | Status |
|----|------|-------|--------|
| AG1 | `admin_sales` role, "Add merchant" + emailed set-your-password invite, "My merchants" list | Opus | Built 2026-11-18, `develop` (`feature/sales-agents-ag1`). Migration `20261118090000_sales_agents` |
| AG2 | Personal sign-up link per agent, Agent column + filter in Ops Merchants | Opus | Not started |
| AG3 | Assist session: agent fills in onboarding for the merchant, merchant's SMS code is the consent | Opus | Not started |

**AG1 as built** (decisions in [`trucks-and-sales-agents.md`](./trucks-and-sales-agents.md)
Part B, "B1 as built"): contract `openapi/admin-agents.yaml`, API
`modules/admin-agents/`, console `apps/admin/src/pages/agents/`. The invite
reuses `password_reset_tokens` (new `purpose = 'invite'`, 7 days) and the
merchant portal's `/reset-password` screen. **Owner checks on dev:** Settings
-> Team -> add a "Sales agent"; sign in as them (only My merchants and Add
merchant show); add a merchant; open the invite email (Resend dashboard on
dev) and set the password; the row moves from Invited to Onboarding.

**Start prompt:** the standard prompt with Phase 3, PR AG1/AG2/AG3. Detail:
[`trucks-and-sales-agents.md`](./trucks-and-sales-agents.md) Part B (it calls
these S1-S3).

**Done when:** an agent signs up an owner on dev, the owner finishes
through the invite, Ops sees the agent on the merchant, and an assist token
is refused (403) everywhere outside onboarding.

---

## Phase 4 - Garage services

**Client sees:** a customer describes what their car needs; garages CRAL has
visited send an itemised price; the customer pays CRAL; extra work found
mid-job needs a second yes; the garage is paid when the job is done; the
job stays on the car's service record.

| PR | What | Model |
|----|------|-------|
| GS1 | Outlets: merchant "Your premises", Ops outlet queue + visit checklist | Opus |
| GS2 | My cars (customer) + request for quote + itemised quotes | Opus |
| GS3 | Orders: pay, in progress, ready, confirm, second quote, payout lines | Opus |
| GS4 | Service record, garage sub-site made real | Opus |

**Before GS1 the owner answers** open questions 1, 2 and 5 at the bottom of
this file (payment timing, auto-confirm window, commission rate).

**Start prompt:** the standard prompt with Phase 4. Detail: "Design notes"
below (outlets, my cars, quotes, orders, payouts).

**Done when:** one garage job runs end to end on dev, request to payout run
line, including a second quote.

---

## Phase 5 - Spare parts

**Client sees:** ask for a part for your exact car; checked dealers quote
(genuine, OEM or used; delivered or fitted); pay CRAL; the dealer is paid
once you confirm it's the right part.

| PR | What | Model |
|----|------|-------|
| PT1 | Parts outlets, condition + fitted/delivered, delivery address, "right part" confirm, wrong-part dispute | Opus |
| PT2 | Parts sub-site made real, request sent to dealers in the county | Opus |

**Before PT1 the owner answers** open question 3 (who delivers).

**Done when:** one part order runs end to end on dev, including a wrong-part
dispute reaching Ops.

---

## Phase 6 - Buy and sell cars

**Client sees:** owners list a car for sale; CRAL checks the logbook before
it goes live; buyers browse and send enquiries; the seller replies;
buyer and seller pay each other directly.

| PR | What | Model |
|----|------|-------|
| CS1 | Sale listings, merchant side (`sal_`, `S-YYMMDD-NNN` ref) | Opus |
| CS2 | Ops sale-listing review + report-a-listing | Opus |
| CS3 | Buy sub-site + enquiries | Opus |
| CS4 | Listing fees and paid boosts by M-Pesa | Opus |

**Before CS1 the owner answers** open question 4 (free listings or a fee).

**Start prompt:** the standard prompt with Phase 6. Detail:
[`car-sales.md`](./car-sales.md) and "Car sales - updates" below.

**Done when:** a listing goes from draft to live through Ops review on dev
and a buyer's enquiry reaches the seller.

---

## Owner decisions on record (2026-11-15)

1. **Order:** trucks first, then the rest (re-ordered 2026-11-18 to put the
   sub-site UI before the new services).
2. **Suppliers are existing merchants.** One account can offer hire cars,
   drivers, garage services, parts and cars for sale. No separate sign-ups.
3. **Parts and garage services are paid through CRAL** (Daraja, commission,
   payout), not lead capture.
4. **Car sales are listings + enquiries.** No escrow.
5. **Every phase ends deployed** (rules above).

---

# Design notes (for Phases 4-6)

The detail below is what build sessions for garage, parts and car sales
read. It was written 2026-11-15 and still stands.

## Shared foundation for services and parts

Both verticals are the same shape: a customer describes what their car
needs, a verified business quotes, the customer accepts and pays CRAL, the
business delivers, the customer confirms, the business is paid out. So
they share one engine rather than two copies.

### Outlets (`out_`)

The canvas promises "Garages are visited" and "A dealer with no premises
does not get listed". A merchant's physical premises is therefore a record
of its own, like a driver: `outlets` with `kind` (`garage` | `parts`),
name, address, county, opening hours, photos and, for a garage, the
service types it does (service, diagnostics, mechanical repair, bodywork,
tyres, electrical, AC). A merchant can have several.

- **Gates:** account approved -> outlet approved -> can quote. Same two-gate
  rule as vehicles and drivers.
- **Ops review** uses the existing checklist components, in a new
  `outlets` queue (`admin_reviewer`). One checklist item is "premises
  visited by" with the visit date. A person ticks it after a real visit,
  so the "visited" claim is backed by a record, never a decorative badge.
- A merchant offers garage services or parts by having an approved outlet
  of that kind. No `offers` column (the same choice drivers made).

### The customer's own cars (`car_`)

The canvas promises "One service record per car" and parts "quoted against
your chassis". So a renter gets **My cars** in their account: make, model,
year, plate, chassis number (VIN), optional logbook photo. Every request
names one of these cars, and every completed job stays on it, which is
the service record.

- Plate is normalised but **not** globally unique here: a car can change
  hands, and two people may both drive it. Uniqueness is per user.
- The chassis number is shown to the outlet that quotes, never publicly.
- `bookings.hire_car_details` (driver-only bookings) can move onto this
  later. Not in scope.

### Request for quote (`rfq_`) and quotes (`quo_`)

- A customer opens a request: `kind` (`service` | `part`), car, what's
  needed (text + optional photos), county, and either one chosen outlet
  or "ask outlets near me" (up to 5 approved outlets of that kind in the
  county). Rate-limited like towing.
- Each outlet answers with a **quote**: itemised lines (part / labour /
  delivery / other, each a money amount), for parts the condition
  (`genuine` / `oem` / `used`) and `fitted` or `delivered`, for services
  the days needed. A quote is valid 48 h, the same window as truck quotes.
- Accepting one quote expires the others and creates an order.
- Commission is taken on the order total. The merchant's quote modal shows
  "you keep KES X after CRAL's service fee". The % is never shown.

### Orders (`ord_`)

One payee per order, the same rule as bookings.

```
awaiting_payment -> paid -> in_progress -> ready -> completed
        |            |                       |
     cancelled    refunded (Ops)          disputed (Ops)
```

- **Paid upfront, held by CRAL.** The STK push runs on accept through the
  existing `payment_requests` / `applySettlement` path. The outlet starts
  only once the order is `paid`.
- **Paid out on the customer's confirmation**, or automatically 72 h after
  the outlet marks it ready/delivered if the customer says nothing. This
  is the parts canvas's "paid once the part is in your hands" promise.
- **Extra work is a second quote** on the same order (services only).
  The customer accepts and pays it separately, or the garage finishes
  the original scope. Nothing is added to a bill without a yes. This is
  the canvas's "a second quote, not a bigger bill at the gate".
- **Refunds** go through `executeRefund` (Send to M-Pesa), the existing
  rail.
- Every transition is a conditional update on the checked status (409 if it
  moved). Pay, accept-quote, confirm and refund take an `Idempotency-Key`.
  Each writes `audit_log` in the same transaction and `notify()` the other
  side.

### Payouts

`payout_run_lines` today keys on `booking_id` (globally unique, which is
what stops a double pay). Orders need the same guarantee, so the line gets
a nullable `order_id` with its own unique index and a CHECK that exactly
one of `booking_id` / `order_id` is set. `cutPayoutRun` stays the single
place that decides what a run contains, and learns to pick up completed
orders past their confirmation window. The rest of the payout pipeline
(schedule, Finance pay, disbursements) is unchanged.

## Garage services - PR detail

| PR | What | Size |
|----|------|------|
| GS1 | Outlets: merchant "Your premises" screen, Ops outlet queue + case | M |
| GS2 | My cars (customer) + request for quote + quotes (merchant inbox, quote modal) | L |
| GS3 | Orders: accept + pay, in progress, ready, confirm, extra-work quote, payout lines | L |
| GS4 | Service record on My cars, `/services` page made real, garage listing pages | M |

## Parts - PR detail

Parts reuses GS1-GS3. Only the differences are new work.

| PR | What | Size |
|----|------|------|
| PT1 | Parts outlets, condition + fitted/delivered on quotes, delivery address on the request, "Right part" confirm, wrong-part dispute to Ops | M |
| PT2 | `/parts` page made real, broadcast to dealers in the county | S |

There is **no stock catalog** in v1. Dealers quote against the chassis on
request, which is what the canvas promises. A browsable catalog can come
later as its own owner call.

## Car sales - updates to `car-sales.md`

That plan stands, with these changes:

- **S-A (classifieds) is confirmed.** S-C escrow stays out.
- **Merchants only** in v1, behind the account gate.
- **No `merchants.offers` column.** `car-sales.md` assumed drivers would add
  one, but drivers dropped it (see `drivers.md`). A merchant sells by
  having a sale listing, the same way they drive by having drivers.
- Its PRs are renamed CS1-CS4 (listings, Ops review, buy pages +
  enquiries, fees and boosts). Assisted sale (S5) stays later.

## New ID prefixes

`out_` (outlet), `car_` (customer car), `rfq_` (request for quote), `quo_`
(quote), `ord_` (order), `sal_` (sale listing), `enq_` (sale enquiry).
None collide with `packages/types/src/ids.ts` today.

## Open questions for the owner

1. **Garage payment timing.** Upfront and held (recommended above), or
   pay on completion? Upfront protects the garage; on completion is
   friendlier to the customer but leaves the garage unpaid if they vanish.
2. **Auto-confirm window** for orders: 72 h after ready/delivered?
3. **Parts delivery:** the dealer's own delivery only (priced as a quote
   line), or does CRAL arrange riders?
4. **Car sales:** free listings at launch, or a listing fee from day one?
5. **Commission rate** for services and parts: the same as hire, or its
   own setting?
