# Garage services (Phase 4)

Read before touching outlets, "Your premises", the Ops outlet queue, or
any garage request, quote or order. Queue and design notes:
[`docs/plans/verticals-roadmap.md`](../plans/verticals-roadmap.md) (Phase 4,
"Design notes"). Contracts `openapi/merchant-outlets.yaml`,
`openapi/admin-outlets.yaml`.

## Owner decisions (2026-11-19, "use your recommendation")

- **Paid upfront, held by CRAL.** The customer pays when they accept the
  quote; the garage is paid out after the customer confirms the job.
- **Auto-confirm after 72 h** from "ready" (parts: "delivered") unless the
  customer raised a problem first.
- **Parts delivery** is the dealer's own, priced as a quote line. CRAL
  arranges no riders.
- **Commission** for services and for parts is its own admin-only
  `platform_settings` value per vertical, defaulting to the hire rate. It
  is added when orders are built (GS3), never shown to a merchant.
- Car sales: free listings at launch, paid boosts in CS4, listing fee a
  setting defaulting to 0.

## Outlets (GS1, built 2026-11-19)

Migration `20261120090000_outlets`; modules `modules/outlets/` (merchant)
and `modules/admin-outlets/` (Ops); merchant screens
`pages/{PremisesList,AddPremises,PremisesDetail}.tsx`; console
`pages/outlets/{Queue,Case}.tsx`.

- **An outlet is its own record** (`outlets`, `out_`), like a driver. A
  merchant can have several. `kind` is `garage` only until PT1 (the DB
  CHECK already allows `parts`; the API's create schema takes `garage`).
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
