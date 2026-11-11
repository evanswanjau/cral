# Trucks (types, routes, per-km/per-tonne, quotes) and sales agents

Status: **T1 built (2026-11-10, branch `feature/truck-types`); the rest is plan only.** Owner's call, 2026-11-10, from client
feedback. A deliberate deviation from `road-to-transactable.md` /
`pr-delivery-plan.md`, same footing as Drivers and Services.

Guiding rule from the owner: easy to use, easy to navigate, not
overwhelming. Every screen below adds the fewest fields that do the job,
and each new thing only appears where it applies (truck fields only on
trucks, the agent console only shows agents two screens).

## Where we are today

- `truck` is one of five categories (`modules/vehicles/categories.ts`), with
  no sub-type and no capacity.
- Pricing units are `day` / `trip` (`hour` is switched off for vehicles).
  `trip` is a flat fee whatever the distance
  (`customer-bookings/service.ts#unitPricingBasis`).
- A booking has no route: `pickup_location` and `dropoff_location` are both
  set to the vehicle's county (`customer-bookings/service.ts:703-704`).
- Every booking is priced instantly. The only quote flow in the product is
  towing (`service-requests`, `requested -> quoted -> accepted`).
- Admin roles are `admin_reviewer / admin_finance / admin_support /
  admin_super` (`admin-team/schemas.ts`). Merchants only ever sign
  themselves up.

## Part A - Trucks

### A1. Truck types and capacity (small PR)

When the category is `truck`, the vehicle form shows two more fields:

- **Truck type** (`vehicles.truck_type`, nullable, required for trucks at
  submit): `pickup`, `canter` (3-5 t), `box_body`, `flatbed`, `tipper`,
  `refrigerated`, `water_bowser`, `prime_mover` (with trailer),
  `low_loader`, `crane_truck`. Ten options in one dropdown, with plain
  labels. One source of truth beside `categories.ts`, mirrored client-side
  like the categories are.
- **Carries up to** (`vehicles.payload_kg`, integer, required for trucks).
  Shown to renters as tonnes.

Renters get one extra catalog filter when they pick Trucks: type, plus an
optional "at least N tonnes". Ops sees the type on the review case; no new
checklist items unless the owner asks.

### A2. Route and load on the request (customer side)

For a truck listing, the booking form becomes one short screen:

1. **From** - address + county
2. **To** - address + county
3. **What are you moving?** - one line of text, plus optional weight (t)
4. **Date** (and time, for a trip)

No loaders field (client's call, 2026-11-10). If a renter needs labour,
they say so in the booking note and the merchant prices it into the quote.

New `bookings` columns, all nullable so nothing else changes:
`route_from`, `route_from_county`, `route_to`, `route_to_county`,
`cargo_description`, `cargo_kg`. `pickup_location` /
`dropoff_location` are filled from the route for trucks, so every existing
reader keeps working. The merchant sees the route and load on the booking
screen. Non-truck bookings are untouched.

### A3. Per-km and per-tonne pricing (merchant side)

Two new hiring units, **trucks only**: `km` and `tonne`. The existing Price
& availability modal gets them as two more choices; whichever is picked,
only its one rate field shows.

- `vehicles.km_rate_amount`, `vehicles.tonne_rate_amount` (money pair, nullable)
- Optional `vehicles.minimum_charge_amount` ("I don't move for less than
  KES X"), since short per-km jobs are otherwise uneconomic.
- Saving `km` without a km rate 422s `km_rate_required`, same as
  `trip_rate_required` today.
- **Per tonne is a flat price per tonne, not per tonne per km** (decided
  2026-11-10). We can't measure distance (below), so a tonne-km rate would
  be a number nobody can check. Distance is already priced in the quote,
  where the merchant sees the route. This is also how tonnage is commonly
  quoted locally (e.g. "KES 2,500 a tonne to Kitengela").

**We don't calculate distance.** The product has no routing input, and a
made-up km figure is the same mistake as the fabricated `id_verified`
badge. So **a per-km or per-tonne listing always goes through a quote
(A4)**. The renter sees an honest guide ("KES 120 / km, minimum KES
5,000"), and the merchant names the real figure once they've seen the
route and the load. Automatic distance (e.g. a maps API) can come later as
its own owner call.

### A4. Quote step

Two new booking statuses in front of the existing flow:

```
quote_requested -> quoted -> confirmed -> (payment, handover as today)
        |             |
     declined     expired / cancelled
```

- **When a booking needs a quote:** always for `km` / `tonne` listings,
  and for `day` / `trip` listings whose merchant switched on
  **"Always quote me first"** (`vehicles.quote_required`, default off).
  Every other booking keeps today's instant price.
- **Merchant**: the request shows the route and load, with **Send quote**
  or **Decline**. Send quote is one modal: the amount the hirer pays, an
  optional note ("price includes fuel and tolls"), and a one-line "you keep KES X
  after CRAL's service fee". The commission % is never shown, per the
  global rule.
- **Renter**: sees the quote on the trip screen with **Accept and pay** or
  **No thanks**. Accepting moves straight to `confirmed`. The merchant
  already agreed by quoting, so there's no second accept. Payment then runs
  as today.
- **Quote expiry:** a quote is valid for 48 h (`quote_expires_at`), and the
  existing daily sweep expires stale ones. An unanswered request expires on
  the same clock as today's requests.
- **Money:** on quote, `gross / commission / merchant_net` are computed
  once from the quoted amount via `computeBookingPricing(amount, 1)` and
  never recomputed. That's the same snapshot rule as every booking. New
  columns: `quoted_at`, `quote_note`, `quote_expires_at`.
- **Safety, same as towing:** every transition is a conditional update on
  the status that was checked, so an accept and a decline landing together
  can't both win (409). Send quote and Accept take an `Idempotency-Key`.
  Both write `audit_log` in the same transaction and `notify()` the other
  side.
- **Contracts first:** `merchant-bookings.yaml` and the customer bookings
  contract gain the statuses, fields and two endpoints
  (`POST /merchant/bookings/{id}/quote`, `POST /bookings/{id}/accept-quote`)
  before code.

## Part B - Sales agents who onboard merchants

### What the client wants

A sales agent signs up truck and car owners in the field. They need to
start a merchant's account, see who they brought in and how far each one
has got, and nudge the ones who stall. They must **not** approve anyone;
approval stays with the reviewer (the two-gate rule).

### B1. Agent role and the two screens

- **New admin role `admin_sales`** ("Sales agent"), added from Settings ->
  Team like any other role. It uses the existing Ops login, mandatory SMS
  2FA and session caps, so there's no new identity system.
- An agent's side nav shows **two items only**:
  1. **My merchants** - a list of the merchants they brought in, each with
     one status chip: `Invited` -> `Onboarding (step 3 of 6)` ->
     `Submitted` -> `Verified` (or `Changes requested`). Actions per row:
     **Resend invite**, **Call / WhatsApp**. Search by name or phone.
  2. **Add merchant** - one form: individual or company, name, email,
     phone. On submit we create the `users` + `merchants` rows and email a
     **"Set your password and finish setting up"** link (a one-time token,
     the same mechanism as reset-password). The agent never sees or sets
     the merchant's password.
- The agent can't open the vehicle review queue, other agents' merchants,
  payouts or settings. `requireAdmin({ role: "admin_sales" })` scopes every
  endpoint to `merchants.onboarded_by = me`. `admin_super` sees everyone's.

### B2. Attribution

- `merchants.onboarded_by` (-> `admin_users`, nullable) and
  `merchants.onboarding_source` (`self` / `agent_invite` /
  `agent_link`).
- **Personal sign-up link:** each agent gets a short code, which makes a
  link like `merchant.cral.co.ke/join?a=JK42`. They can share it on
  WhatsApp, and a merchant who signs up through it is attributed to the
  agent without the agent typing anything. Shown on "My merchants" with a
  Copy button.
- Ops (`admin_super`) gets an "Agent" column and filter on the existing
  Merchants directory. This is enough to count sign-ups per agent.
- **Agents earn no commission** (client's call, 2026-11-10). Attribution is
  for reporting only, so no agent payout lines are needed.

### B3. Filling in onboarding for the merchant (client's call: yes)

The agent can do the whole onboarding from their own phone, including
details, documents, vehicles and drivers. The merchant only has to be there
for the phone code.

**No second wizard.** The agent uses the merchant portal's existing
onboarding screens, so there's one wizard to maintain:

1. On **My merchants**, a row that isn't submitted yet has **Fill in
   onboarding**. It opens the merchant portal's onboarding in a new tab,
   with a banner: "You are filling this in for Jane Wanjiru. Exit".
2. Behind that is an **assist session**: a short-lived (1 h) public-audience
   token for the merchant's user. It carries `assisted_by = <admin id>` and
   is backed by a real `sessions` row marked `kind = 'assist'`, so revoking
   it works like every other session.
3. **The assist token only reaches onboarding.** `authenticate()` rejects it
   (403 `assist_scope`) on anything outside `/merchant/onboarding/*`,
   `/merchant/vehicles*` (draft), `/merchant/drivers*` (draft) and
   `/auth/phone/verification/*`. Payouts, settings, bookings, password,
   2FA and close-account stay closed. This allowlist is the main safety
   control in this design.
4. **It only works before submission.** Once the merchant is submitted, the
   assist token stops working (409 `onboarding_submitted`). From then on,
   changes go through "Request a change" like any merchant.
5. **The merchant's consent is the phone code.** The wizard won't submit
   until the phone is verified, and that SMS goes to the merchant's own
   phone. The merchant reads the code to the agent in person. Without it
   the agent can fill everything in but can't submit.
6. **Every write is audited** with `actor_type: "admin"`, the agent's id
   and `after.assisted_for = <user id>`, in the same transaction as the
   change. Document rows also record `uploaded_by_admin_id`, so the
   reviewer can see "uploaded by agent Kamau" on the vehicle case.
7. **The merchant is told.** On submit, the merchant gets an email ("Kamau
   from CRAL set up your account. Here's what was submitted. Set your
   password here"). The password stays theirs. The agent never sees or
   sets it.

The reviewer still approves separately, so the two-gate rule doesn't
change: an agent can bring a merchant all the way to "Submitted", never to
"Verified".

## PR order

| PR | What | Size |
|----|------|------|
| T1 | Truck type + capacity, catalog filter | S |
| T2 | Route + load on truck requests | M |
| T3 | Quote step + `km` / `tonne` units + "Always quote me first" | L |
| S1 | `admin_sales` role, Add merchant + invite link, My merchants | M |
| S2 | Personal sign-up link + Agent column in the Merchants directory | S |
| S3 | Assist session: agent fills in onboarding for the merchant | M |

T1 and S1 are independent and can go first, in either order. T3 needs T2,
because a quote needs the route to quote on. S3 needs S1.

## Client decisions (2026-11-10)

1. Agents earn **no commission**. Attribution is for reporting only.
2. Agents **can** fill in onboarding for the merchant (B3).
3. Per tonne is a **flat price per tonne** (our recommendation, accepted).
4. A quote is valid for **48 h**.
5. There are **no loaders** anywhere: not on the request, not as an add-on.
