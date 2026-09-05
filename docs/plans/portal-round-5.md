# Merchant Portal — Round 5

Five owner-reported issues. Each ships as its own branch/PR off `develop`.
Build order: #5 → #4 → #2 → #1 → #3.

Decision on record (owner, 2026-09-05): issue 3's "owner rating" is
**schema + self-view only** this phase — the `ratings` table covers a
merchant ratee, but nothing writes one until a customer portal exists, so
the merchant only ever sees their own "Not rated yet" score on their
profile/dashboard. Hirer ratings go fully live.

---

## 5 — Dashboard "Bookings this week": link only to the booking

**Current state.** `BookingRow` (`apps/merchant/src/pages/Dashboard.tsx:223`)
opens the booking on row click, but the plate has its own
`onClick` + `stopPropagation` calling `onOpenVehicle()` →
`/vehicles/:id` (`Dashboard.tsx:503`). The bolded name is the hirer and is
not currently a separate link.

**Frontend only, no backend.**
- Delete the `onOpenVehicle` prop from `BookingRow`, the plate's
  `onClick` / `stopPropagation` / `title`, and the
  `onOpenVehicle={() => navigate(...)}` at the call site.
- Plate stays as plain text inside the row; the whole `HoverRow`
  navigates to `/bookings/:id` only.
- While in the file, confirm `PayoutLineRow` and `ActivityRow` have no
  nested nav (they look clean).

**Tests.** None required.

---

## 4 — Remove every hint of a held deposit

**Current state.** Round 4 stripped the deposit line from the money
breakdown, but leftovers remain:
- `apps/merchant/src/lib/bookings-api.ts` still types `deposit: Money` and
  `deposit_release_at`; the API still serializes them
  (`apps/api/src/modules/bookings/service.ts:175`, `:185`).
- `ReportModal` (`BookingDetail.tsx:475`): subtitle "CRAL reviews claims
  like this and settles what the hirer owes"; toggle "Does this need money
  back from the hirer?" / "CRAL reviews the amount and recovers what it
  can."
- `openapi/merchant-bookings.yaml` describes deposit-backed claims
  throughout.

**Backend.**
- Drop `deposit` and `deposit_release_at` from the merchant booking
  serializers (list + detail + handover). **Keep** `bookings.deposit_amount`
  / `deposit_release_at` columns and all server-side logic — the claim cap
  and dispute escalation stay, fully invisible to the merchant (CLAUDE.md
  already mandates this).
- Reword the report endpoint copy: category descriptions / response
  strings lose "deposit", "owed", "recover", "money back". Frame a claim
  as the cost to put the vehicle right, which CRAL follows up with the
  hirer — no implication of pre-held funds.
- `openapi/merchant-bookings.yaml`: rewrite §19 and the `Booking` schema
  to remove `deposit` / `deposit_release_at` from the merchant-facing
  shape; keep an internal note that claims are still capped server-side.

**Frontend.**
- `ReportModal`: toggle title → "Are you claiming the cost of repair or
  loss?", sub → "CRAL follows up with the hirer. Otherwise this just goes
  on their record." Amount label → "What did it cost to put right? (KES)".
  Modal subtitle → "CRAL reviews reports like this and follows up with the
  hirer."
- Remove `deposit` / `deposit_release_at` from `bookings-api.ts` types and
  all references.
- Grep sweep `apps/merchant/src` for `deposit`, `owed`, `recover`,
  `money back`, `held`.
- Cancel-modal copy (`BookingDetail.tsx:237`) is about cancellation fees,
  not deposit — leave, but re-read for "owed" phrasing.

**Tests.** Merchant booking payload has no `deposit*` keys; existing
over-cap-claim-escalates-to-dispute test stays green.

---

## 2 — No code on the return leg

**Current state.** `createHandover` generates + emails an OTP for both
`pickup` and `return` (`service.ts:491`); `confirmHandover` refuses until
`otp_verified` or `condition_logged` (`service.ts:677`);
`serializeHandover.required` is `["otp","condition","confirm"]` for both.

**Backend.**
- `createHandover`, `kind === "return"`: skip code generation / hash /
  expiry, skip the email, open the session directly in the
  ready-for-condition state (reuse `otp_verified` to minimise churn).
  `masked_destination` → null.
- `serializeHandover.required` → `["condition","confirm"]` when
  `kind === "return"`.
- `verifyHandoverOtp` on a return session → 409 `otp_not_required`.
- `confirmHandover` already passes on `condition_logged`; just ensure a
  return session reaches it without the OTP step.
- `openapi/merchant-bookings.yaml`: document that `required` omits `otp`
  for `return` and `/otp/verify` is pickup-only.
- Update the CLAUDE.md handover note ("the OTP step is real" → "pickup
  only; return is condition + confirm").

**Frontend** (`BookingDetail.tsx:256` `HandoverModal`).
- Drive the flow off `handover.required` rather than a hardcoded
  assumption. No `otp` in `required` → start at the condition/photos step,
  skip the code input and `handleVerify`.
- Return modal subtitle drops "Ask the hirer for the code…"; CTA goes
  straight to "Confirm returned".

**Tests.** Return handover: no `otp` in `required`, no email sent,
condition→confirm→complete works; `/otp/verify` on a return session 409s.

---

## 1 — Editing a duplicated vehicle

**Current state.** `POST /merchant/vehicles/:id/duplicate`
(`service.ts:337`) copies specs into a new `draft` and sets `registration`
to a placeholder `NEW XXXXXX`. There is no way to edit that plate or any
spec afterwards — `PATCH /merchant/vehicles/:id` only accepts
`PriceAvailabilitySchema` (rate, min-hire, chauffeured, county, pickup
address; `schemas.ts:33`), and `VehicleDetail.tsx:795` renders
make/model/year/plate/type/transmission/fuel/colour/seats read-only.

**Backend.**
- New `EditVehicleDetailsSchema` (make, model, year, registration, type,
  transmission, fuel, colour, seats) reusing `CreateVehicleSchema`'s
  enums.
- `updateVehicleDetails` service (or a discriminated PATCH body). Gate:
  spec/identity fields editable only while `status` is `draft`, `action`,
  or `rejected`; otherwise 409 `vehicle_locked`. Changing a
  globally-unique plate on an approved listing is a support path.
- Route the plate through `rethrowRegistrationConflict` → 409
  `registration_taken`.
- `vehicle.details_updated` audit row + `vehicle_events` entry in the same
  transaction (mirror `updatePriceAvailability`).
- `openapi/merchant-vehicles.yaml`: add the fields to the PATCH body.

**Frontend.**
- Extract the AddVehicle form body into a shared
  `components/vehicle/VehicleDetailsForm.tsx` (fields + validation only).
  `AddVehicle` consumes it unchanged.
- `VehicleDetail`: when `status` is draft/action/rejected, swap the static
  "Vehicle details" card for an **Edit** button opening
  `VehicleDetailsModal` prefilled from `v`.
- After `duplicate.mutate` success, retoast: "Draft copied. Update the
  registration and details, then add its own documents."
- Add `registration` to `submitBlockers` while it still matches the
  `NEW ` placeholder pattern.

**Tests.** Edit specs on a draft succeeds; edit on a `live` vehicle 409s;
duplicate→edit plate→submit round-trip; duplicate-plate 409.

---

## 3 — Ratings next to hirer and owner names

**Current state.** `rateHirer` stores nothing numeric — a `booking_events`
row with `kind:"rated"` and a label string, stars only in an audit
`after` (`service.ts:943`). `getHirerHistory` returns
`average_rating: null` hardcoded (`service.ts:924`). No merchant/owner
rating exists anywhere.

**Backend — hirer rating (real).**
- Migration: new `ratings` table — `rev_` ULID PK, `booking_id`,
  `rater_id`, `ratee_id`, `ratee_type` (`hirer` | `merchant`), `stars`
  (smallint 1–5), `comment` (nullable), `addTimestamps`. Unique
  `(booking_id, rater_id, ratee_type)`.
- `rateHirer` writes a `ratings` row in the same transaction as the
  existing event/audit.
- `getHirerHistory`: `average_rating` = `AVG(stars)` where
  `ratee_id = hirer_id AND ratee_type = 'hirer'`; add `rating_count`.
- Add `hirer_rating: { average, count } | null` to the booking list and
  detail serializers.
- `openapi/merchant-bookings.yaml` updates.

**Backend — owner rating (schema now, honest empty state).**
- Same `ratings` table covers `ratee_type = 'merchant'`. Nothing writes
  one yet.
- Expose `merchant_rating: { average, count } | null` on
  `GET /merchant/profile` (and/or the dashboard payload).

**Frontend.**
- Hirer card (`BookingDetail.tsx:810`) already renders `· X★` when
  `average_rating` is non-null — starts working. Add a `★ 4.6 (12)` chip
  next to `b.hirer_name` in the masthead and in `BookingList` rows.
- Hirer-history drawer (`BookingDetail.tsx:636`) "Average rating" row
  starts showing real data.
- Owner side: `★ — Not rated yet` next to the merchant's name in
  `ProfileMenu` / the dashboard status card, reading `merchant_rating`.

**Tests.** Rate a hirer → history average + count correct; a second
booking for the same hirer aggregates; `merchant_rating` null with no
ratings.
