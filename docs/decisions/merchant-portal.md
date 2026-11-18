# Merchant portal

`apps/merchant`. Read before touching onboarding, vehicles, settings, the
dashboard or notifications. Bookings and payouts are in
`bookings-payouts.md`, drivers in `drivers.md`, trucks in `trucks.md`.

## Rules that cover the whole portal

- **The commission percentage is never shown to a merchant** (owner's
  global rule, 2026-09-23): not in the portal, emails, SMS or receipt
  PDFs. Only admins see the rate; a merchant reads it in the merchant
  terms. Don't render `COMMISSION_PERCENT`/`COMMISSION_RATE` or a
  hardcoded "10%". KES commission *amounts* on booking and payout records
  stay. Estimators show take-home "after CRAL's service fee".
- **The hirer's deposit is never shown to a merchant, anywhere** - not on
  vehicles, bookings, reports or payouts, and not on the wire
  (`deposit`/`deposit_release_at` are out of the merchant serializers and
  contract). A merchant who senses a pot of the hirer's money is nudged to
  over-claim. The deposit, its hold clocks, the claim cap and the dispute
  escalation all still run server-side (`bookings-payouts.md`).
- **Verification chips reflect real state.** The `✓ VERIFIED` account
  chip, the profile-menu company chip and the dashboard's MERCHANT STATUS
  card read `merchants.approved_at`, which Ops sets when it approves the
  account (`admin-ops.md`); until then they read PENDING REVIEW / "in
  review". Never a decorative tick.
- **Documents read PENDING REVIEW** (`DOC_STATE.pending.label`) until Ops
  accepts (`ok`, shown "ACCEPTED") or rejects them.
- Support: `apps/merchant/src/lib/support.ts` (`SUPPORT_EMAIL`
  `support@cral.co.ke`, phone `+254 735 656 066`). Use `whatsappLink()`;
  don't hand-write `wa.me` URLs.
- Mobile: grids shrink via `min(100%, …)`; the nav strip and table rows
  use `m-*` classes in `apps/merchant/src/responsive.css`.
- The signed-out landing page and the auth brand panel use photos and
  Phosphor icons.
- **WhatsApp is omitted everywhere** (alerts column, settings toggle): no
  Business API number, no adapter. A toggle that silently sends nothing is
  worse than an absent one.

## Onboarding

- **Step 1 is "What do you offer?"** (UI5, 2026-11-18; replaced the
  Welcome step): multi-select Cars and vans, Trucks, Machinery, Driving;
  garages, parts and car sales listed as coming, not selectable. The choice
  is **derived, never stored** (no `offers` column): from the draft's
  vehicle categories and `drivers_only`, plus this device's pick in
  localStorage (`lib/onboarding-offer.ts`), and `?offer=` on a first visit.
  Driving alone (no vehicle yet) sets `drivers_only: true` through the
  existing PATCH; step 3 becomes a short "Drivers" step, Documents asks
  for owner papers only, and submitting lands on `/drivers/new`. A new
  vehicle form opens on the picked category (cars first, then truck, then
  machinery). Step 3's label is "Trucks" / "Machinery" when every vehicle
  (or, before any, the pick) is that kind. A category with a vehicle
  already added can't be unticked. The old "I only drive" toggle on the
  Vehicles step is gone.
- **Your details** mirrors what Settings later shows. Individual: name,
  national ID, KRA PIN, email, phone + SMS verify. Company: company name,
  cert of incorporation no. (`company_cert_no`), company KRA, company
  email, physical location (`company_email` + `company_address`, required
  at submission), plus a contact person and phone. The step won't advance
  until the phone is verified.
- **Account documents come in three groups**: company documents (company
  only: `certificate_of_incorporation`, `company_kra_pin`, `cr12`), your
  documents (everyone: `national_id`, `kra_pin`), and per-vehicle car
  documents (logbook, comprehensive insurance, tracker). `requiredOwnerDocs`
  in `assertCompleteForSubmission` adds the three company kinds for a
  company. The Review step lists them in that order.
- **Expiry dates can't be backdated**: `Documents.tsx` blocks a typed-in
  past date (the input `min` only stops the picker) and the server
  re-checks via `lib/dates.ts#assertNotPast` (422 `expiry_in_past`).
- **A company is paid by bank**; picking company flips `payout_method`
  to `bank` (`pickOwnerType`).
- `merchants.drivers_only` lets someone with no car finish onboarding
  (`drivers.md`).
- Merchant-terms intro copy is 13px body text, not the 15px `stepLede`.
- Photos that already uploaded are kept when a step is revisited.

## Portal by offering

- **The nav comes from `components/portal/nav-sections.ts`** (UI6,
  2026-11-18), a pure function of data the shell already loads (vehicle
  list, driver list, the onboarding draft's `drivers_only`), via
  `lib/use-offering.ts`. Vehicles is hidden only when the merchant is
  driver-only with no vehicles; it reads "Trucks" / "Machinery" when every
  vehicle is that kind (and the first page holds them all), else
  "Vehicles". Drivers comes second for a driver-only merchant. Dashboard
  buttons, greeting, fleet card, Bookings and Payouts copy follow the same
  rule. Fleet rows show the rate in the listing's own unit (day, trip,
  hour, km, tonne), never a day rate for a non-day listing.

## Vehicles

- **Five categories, stored as slugs**: `sedan` ("Sedan / small cars"),
  `suv` ("SUV / 4x4 / Pickup"), `van` ("Van / Minibus"), `truck` ("Truck &
  trailers"), `machinery` ("Construction & machinery"). Source of truth
  `apps/api/src/modules/vehicles/categories.ts`, mirrored in
  `apps/merchant/src/lib/vehicle-categories.ts` (and the customer copy) -
  keep them in step.
- **A registration plate is globally unique**, not per merchant: a
  functional unique index on the normalised plate (upper case, non-alnum
  stripped), so "KDL 442N" / "kdl442n" / "KDL-442N" collide across every
  merchant. A clash is 409 `registration_taken` via
  `lib/pg-errors.ts#rethrowRegistrationConflict`.
- **County lives on the vehicle**, not the merchant: the location a hirer
  cares about. Required per vehicle at submission, like
  `insurance_expiry`.
- **Submission needs** a real plate (422 `registration_required` while the
  plate is the `NEW ` placeholder, `isPlaceholderRegistration`; the
  masthead shows "NO PLATE YET"), an insurance expiry (422
  `insurance_expiry_required`), and for trucks the truck details
  (`trucks.md`).
- **Logbook fields are editable after creation** while the listing is
  `draft` / `action` / `rejected` (`EDITABLE_DETAIL_STATUSES`):
  `PATCH /merchant/vehicles/:id/details` (type, make, model, year, plate,
  transmission, fuel, colour). Otherwise 409 `vehicle_locked`: the plate
  is unique and already reviewed further along, so that's a support path.
  County, pickup and rate belong to the price PATCH. Shared
  `components/vehicle/VehicleDetailsFields.tsx`. This module has no
  `/openapi` contract (only onboarding's `/merchant/onboarding/vehicles`).
- **Price entry offers two views**: "Set the list price" or "Set what I
  keep" (grossed up by `COMMISSION_RATE`). `vehicles.rate_mode`
  (`list`/`net`) only remembers the view; `daily_rate_amount` is always
  the gross price. Shared `components/onboarding/RateField.tsx`: a
  bordered full-row block with a segmented control and a one-line
  "Hirer pays / CRAL fee / You keep" summary.
- The onboarding vehicle form has the driver toggle ("With driver
  (chauffeured)" / "Self-drive", `vehicles.chauffeured`).
- **"Message the reviewer"** only after `action` or `rejected` (UI and API,
  409 `nothing_to_discuss`).
- Hiring units (day / hour / trip / km / tonne) are in
  `bookings-payouts.md` and `trucks.md`.

## Settings

One tabbed page at `/settings` (`pages/Settings.tsx` +
`pages/settings/*Tab.tsx`), in `SideNav` with no badge. Tabs: **Business ·
Payouts · Notifications · Security**. For an individual the first tab is
labelled **"My profile"** (same key `business`, same URL) and is also
reached from the account menu. `/settings/security` and
`/settings/notifications` redirect to `/settings?tab=…`. Each editable tab
renders the shared sticky `components/portal/SaveBar.tsx` when dirty.
Styles live under a `set*` prefix in `components/portal/styles.ts`.

- **Business / My profile mirrors onboarding's "Your details"** - nothing
  new is asked for after onboarding. The entity type isn't editable (it
  means new documents and a re-review). No county, trading name or
  WhatsApp toggle. `merchants.trading_name` exists but isn't surfaced.
- **Profile fields lock once onboarding is submitted**:
  `PATCH /merchant/profile` -> 409 `profile_locked`. Changes go through
  `profile_change_requests` + `GET|POST|DELETE
  /merchant/profile/change-request`; `GET /merchant/profile` carries
  `profile_locked` + `pending_change`. Approving one applies the diff and
  sets `approved_at = null` to reopen review. Ops has no screen for it yet:
  `npm run review:profile-change -w apps/api -- <id> approve|reject`
  (design in `docs/plans/profile-change-review.md`).
- **Business documents card**: for a company, a "Company documents | My
  documents" switch (`PROFILE_DOC_META` groups them). Upload/Replace shows
  only while a change request is open (`canEdit`); otherwise view-only.
- **Payouts tab is editable**: `PUT /merchant/payout-settings` replaces
  the whole block (method, M-Pesa line name `payout_mpesa_name`, four bank
  fields, `schedule`). The M-Pesa payout **number is always
  `users.phone`** (read-only here; change the phone on the profile);
  `mpesa_number_verified` mirrors `phone_verified`. Companies are locked
  to bank (422 `mpesa_not_allowed_for_company`). Bank payouts always run
  monthly on the 1st (the service coerces `schedule`); M-Pesa offers
  "Every Monday" / "Monthly, on the 1st" (`merchants.payout_schedule`,
  default `weekly`).
- **Statements are CSV**, last six Nairobi months
  (`GET /merchant/payouts/statements`), downloaded per month through
  `apiBlob` (card tag `NET OF COMMISSION · CSV`).
- **Security tab**: the 2FA switch, sessions and close account
  (`identity-auth.md`). Close-account copy has no retention sentence.
- **The People / team-roles tab is deferred** to its own phase. It's a
  multi-user authorization feature (invite, membership, roles, every
  endpoint re-checked), not a settings screen; a read-only roster would
  fabricate trust. `users.roles` stays a flat `text[]`; no team table.
- Contract: `openapi/merchant-settings.yaml`.

## Dashboard

`/` renders `pages/Dashboard.tsx`, the first `SideNav` item, no badge.
Contract `openapi/merchant-dashboard.yaml`, module
`apps/api/src/modules/dashboard/`. Plan:
`docs/plans/merchant-dashboard.md`.

- **One aggregate `GET /merchant/dashboard`**, not client composition:
  list endpoints are cursor-paginated, so a client summing a page would
  describe the first page while claiming to describe the account.
- **The dashboard aggregates; it never decides.** Money comes from
  `payoutPosition` (the single source for owed / clearing / paid this
  month, shared with `/merchant/payouts`, and a test asserts the two tiles
  agree), document bands from `effectiveDocState`, activity from the
  notifications feed (newest five; `audit_log` is a compliance record, not
  merchant copy). `EXPIRING_WITHIN_DAYS` is exported from the vehicles
  service and shared with the expiry sweep.
- **The "Next payout" card lists cut run lines and uncut payable
  bookings**, because the tile above counts both.
- **The API returns numbers; sentences are the client's** ("Two vehicles
  are on hire today…", "EXPIRES IN 19 DAYS"), one clause per fact with its
  own absent case.
- **The chart is `payoutMonthlyNet`**: six Nairobi months, zero-filled,
  bucketed by `payout_runs.run_date` like the statements. Below three
  months with a run, show copy instead: two bars read as a trend that
  isn't there.
- **"Bookings this week"** is Monday-Sunday Nairobi, by overlap, not
  containment.
- The MERCHANT STATUS card hangs under the nav only on `/` (`SideNav`'s
  `footer`), reading the same `["dashboard"]` query.
- Omitted: the canvas's `chartMonths` toggle, `density` switch and
  `hideAmounts` toggle - design-preview props, not product features.

## Notifications

Contract `openapi/merchant-notifications.yaml`; code
`modules/notifications/`, `lib/notifications.ts`,
`jobs/notification-delivery.ts`, `pages/Notification*`.

- **In-app always, plus SMS and email per preference.** `payout` and
  `review` always text (the design locks those toggles). SMS also needs
  `users.phone_verified`. Quiet hours were removed.
- **Two taxonomies.** `category` (booking / payout / review / expiry /
  return / rating) drives preferences; `kind` (hire / money / doc / rate)
  drives the feed's filter pills and icon. booking/return -> hire, payout
  -> money, review/expiry -> doc, rating -> rate. `NOTIFICATION_KIND` is
  duplicated in `lib/notifications.ts` and
  `apps/merchant/src/components/portal/status.ts`; keep them in step.
  `rating` is a real category the design's alerts matrix lacks (default
  email on, SMS off); the design's `tips` row is omitted (nothing
  generates it).
- **`notify(trx, {...})` writes the in-app row inside the event's own
  transaction**; SMS/email go through a BullMQ worker enqueued **after
  commit**, so a failed send never rolls back the notification. `notify`
  takes exactly one of `merchantId` / `userId` (renters get their own
  feed, `customer-portal.md`).
- **Delivery is per-channel idempotent**:
  `notifications.sms_sent_at`/`email_sent_at` are set as each channel goes
  out and `deliverNotification` skips a channel already sent. BullMQ
  redelivers a stalled job after any ungraceful restart, and a real text
  landing twice is worse than a no-op second pass.
- **90-day retention is enforced** by the daily 10:00 Nairobi sweep
  (`runDailyReminderSweep`), which also runs the insurance-expiry
  generator (`runExpiryNotificationSweep`), account deletion and the
  idempotency purge. `npm run reminders:sweep -w apps/api` runs it once
  and reports each part.
- The feed (`/notifications`) is in the nav with the **unread count** as
  its badge.

## Handover and reports (merchant side)

- **The handover modal asks for nothing** but the code on pickup: no
  odometer, fuel or condition photos, just handover tips. The API still
  accepts those fields.
- **"Report an issue" is gone from the merchant UI**; issues go to
  `support@cral.co.ke`. The reports API is untouched.

## Code anchors

- Profile: `modules/merchant/service.ts#getProfile` / `#patchProfile` (audit-logged in-trx; a phone change goes through `setUserPhone`); change requests applied by `reviewProfileChange`. `GET /merchant/profile` embeds `payout` (same shape as `GET|PUT /merchant/payout-settings`: `payout_same`, `payout_detail`, `payout.mpesa_number`). Bank fields: `bank_name`, `bank_branch`, `bank_account_name`, `bank_account_number`. Statement download: `GET /merchant/payouts/statement?month=`.
- Documents: kinds in `DocumentKind` + both upload schemas; `OWNER_DOC_KINDS`; `serializeState.owner_docs`; uploads via `POST /merchant/onboarding/documents`. Vehicle docs re-upload via `uploadVehicleDocument` bumps `action`/`rejected` back to `review`.
- Vehicles: `EditVehicleDetailsSchema` / `updateVehicleDetails`; RateField segmented control `List price / What I keep`.
- Page titles: `apps/merchant/src/lib/use-page-title.ts` (`usePageTitle("<page>")`).
- Dashboard: `buildSummary` sits on `payoutPosition`, so `next_payout` (payouts) equals `awaiting_payout` (dashboard); `hire_days` is the week's share. `AppLayout` passes `MerchantStatusCard` to `SideNav` on `/`. The company/ratings chips live in `ProfileMenu`.
- Notification generators today: `submitVehicle`, `completeHandover` (return), `cutPayoutRun`, `settleDisbursement`, booking events (both sides), Ops review decisions, the `vehicles.insurance_expiry` sweep. `notify` mirrors `writeAuditEntry`'s shape. Stalled-job redelivery happens on any ungraceful restart (`tsx watch` reload, crash, redeploy), independent of `attempts`.
