# Trucks (types, routes, per-km/per-tonne, quotes) and sales agents

Status: **T1 built (2026-11-10, branch `feature/truck-types`); T2 built (2026-11-15, branch `feature/truck-route-load`); T3 built (2026-11-15, branch `feature/truck-quotes`); S1 (roadmap AG1) built (2026-11-18, branch `feature/sales-agents-ag1`) - see "B1 as built"; S2 and S3 are plan only.** Owner's call, 2026-11-10, from client
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

### B1 as built (S1 / roadmap AG1, 2026-11-18)

Contract `openapi/admin-agents.yaml`; migration `20261118090000_sales_agents`;
API `apps/api/src/modules/admin-agents/`; console
`apps/admin/src/pages/agents/`. Calls made while building it:

- **The invite is a reset token with a purpose.** `password_reset_tokens`
  gained `purpose` (`reset` / `invite`). An invite lives **7 days** (a reset
  link 30 minutes): it goes to someone who didn't ask for it and may not
  open it until evening. It opens the merchant portal's existing
  `/reset-password?token=` screen, which reads `purpose` from
  `POST /auth/password/reset/check` and says "Set your password" instead of
  "reset". One table, one lookup, one screen - no second credential path.
- **The agent never touches a password.** The account is created with an
  argon2 hash of 32 random bytes nobody keeps, so no password signs in until
  the owner sets one. The raw invite token exists only in the email.
- **Invite pending = `users.invited_at` set, `users.invite_accepted_at`
  null.** Setting a password by *any* emailed link accepts the invite -
  the invite itself, or a "Forgot password" link the owner asked for
  instead - and marks the email verified (the link proved the inbox). The
  "Your password was reset" notice is skipped for that first password. The
  set-password screen records the platform terms
  (`accepted_terms_version`) for an account that has none, which is only
  ever an agent-created one.
- **The status chip is derived, never stored**, first match wins:
  `verified` (`approved_at`) -> `changes_requested`
  (`review_changes_requested_at`) -> `submitted` -> `invited` (invite
  pending and still on step 1) -> `onboarding`.
- **"Step n of 5", not "of 6".** The merchant wizard has five steps
  (Welcome, Your details, Vehicles, Documents, Review); the sixth screen is
  the post-submit "Done", which the chip already calls Submitted. The step
  is the furthest reached (`onboarding_max_step`).
- **Pre-fill only what the agent typed.** An individual's name is split
  into first / middle / surname (and `users.full_name`); a company's name
  is `company_name` and the payout method is set to bank, mirroring
  onboarding's owner-type switch. The phone is stored unverified - the
  owner still proves it by SMS in the wizard before submitting, which is
  their consent.
- **An existing account can't be taken over.** An email or phone already
  on any CRAL account is `409 account_exists` (naming the field); the owner
  signs in and onboards themselves (AG2's link will attribute that case).
- **Scoping.** `requireAdmin({ role: "admin_sales" })` plus
  `onboarded_by = me` in every query; another agent's merchant reads as
  `404 merchant_not_found` (not 403), so an agent can't probe for them.
  `admin_super` sees every agent-brought merchant (`onboarded_by` not null)
  with the agent named, under the nav label "Agent sign-ups". Every other
  `/admin/*` router already names its own roles, so `admin_sales` gets 403
  everywhere else; the test suite walks them. `admin_sales` gets no review
  queues (stored `[]`, like `admin_super`).
- **Console.** An agent's nav shows My merchants and Add merchant only;
  `AppLayout` sends any other path to `/my-merchants`, and the profile menu
  drops Settings. **Not from a canvas file** (no design bundle has an agent
  screen): built in the console's own idiom and brand status tints, rows
  that wrap on a phone, flagged for a swap if a canvas arrives.
- **Rate limits** (keyed on the admin, not the IP a field team may share):
  Add merchant 30 an hour per agent, Resend invite 5 an hour per merchant
  per agent. Both POSTs take an `Idempotency-Key` (`requireAdmin` first).
- **Audit**, in the same transaction as the change:
  `merchant.agent_invite`, `merchant.invite_resent` (actor the admin), and
  `user.invite_accepted` (actor the owner).
- **Onboarding reminders skip invite-pending accounts.** Their "Continue
  onboarding" link would land on a sign-in they can't pass; the invite
  email is their way in, and the agent nudges.
- **Resend invite** is only offered (and only accepted) while the invite is
  pending; once the owner has a password it's `409 invite_already_accepted`
  and "Forgot password" is the path.

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

### B2 as built (S2 / roadmap AG2, 2026-11-19)

Migration `20261119090000_agent_signup_codes` (`admin_users.signup_code`);
`lib/agent-codes.ts`; contracts `admin-agents.yaml` (`GET /admin/agents/link`,
`GET /admin/agents`), `identity.yaml` (`agent_code` on register),
`admin-merchants.yaml` (`agent` filter + row field). Calls made:

- **The code**: six characters from an alphabet without 0/O or 1/I (read
  aloud, copied by hand), case-insensitive, unique. Issued the first time
  the agent opens My merchants, by a conditional write so two tabs can't
  issue two; audited `admin.signup_code_issued`. It never changes. An
  `admin_super`'s code credits too (the owner signs people up as well).
- **The link** is `<merchant portal>/join?a=<code>`; `/join` lands on the
  supplier landing. The portal keeps `?a=` from *any* page (so `?a=` on a
  `/join/<type>` page works too) in `localStorage` for 30 days, since an
  owner often opens it in WhatsApp and signs up later in a fresh tab. Sent
  as `agent_code` on `POST /auth/register` and cleared once the account
  exists.
- **Credit is fixed at sign-up.** A code naming an active agent makes the
  `merchants` row at register (normally made lazily by onboarding) with
  `onboarded_by` and `onboarding_source = agent_link`, plus a
  `merchant.agent_link_signup` audit row, in one transaction. An unknown,
  mistyped or disabled agent's code is ignored and the response is the
  same, so a stale link never blocks a sign-up and register can't test
  codes. Customer sign-ups ignore it.
- **First credit wins; nothing moves it.** An owner an agent already
  invited has an account, so signing up through another agent's link is
  `409 account_exists` and the inviter keeps them. An owner who signed up
  on their own earlier is **not** credited by later opening a link (a
  signed-in claim was left out: it would let any link re-badge a merchant,
  and attribution is reporting only). No endpoint reassigns `onboarded_by`.
- **Who sees what.** The agent sees their link (Copy, Share on WhatsApp) on
  My merchants, and a "VIA YOUR LINK" tag on those rows. Ops Merchants'
  Agent column and filter (`?agent=<admin id>` or `none`) are
  `admin_super` only: a reviewer gets no `agent` field and 403 on the
  filter. `GET /admin/agents` (the filter's roster, with a credited-merchant
  count per agent) is owner-only. The directory still lists only merchants
  who have submitted a vehicle or driver; agents' merchants still
  onboarding are on "Agent sign-ups".

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

### B3 as built (S3 / roadmap AG3, 2026-11-19)

Migration `20261119100000_assist_sessions` (`sessions.kind` +
`assisted_by`, `assist_challenges`, `documents.uploaded_by_admin_id`);
`apps/api/src/lib/assist.ts` (the allowlist), `middleware/authenticate.ts`,
`modules/admin-agents/assist.ts`; contracts `admin-agents.yaml`,
`merchant-onboarding.yaml`, `admin-vehicles.yaml` (`uploaded_by_agent`).
Calls made, where they differ from the sketch above:

- **Consent comes first, and only from a phone the owner verified.**
  `POST /admin/agents/merchants/{id}/assist/start` texts a 6-digit code
  (10 minutes, 5 tries, single-use, sha256 only, bound to one agent and one
  merchant) to `users.phone` **only when `phone_verified`**; otherwise
  `409 phone_not_verified`. The sketch let the agent verify the phone
  inside the assist; that would let an agent who typed their own number
  at Add merchant consent for the owner and then point payouts at
  themselves. So the owner verifies their phone themselves (invite email,
  set password, Your details) and then the agent can help.
- **The agent can't submit, accept the terms, or set the phone or payout.**
  Item 5 and 7 above had the agent bring the merchant to "Submitted"; the
  coordinator's security rules for this PR said never, and they win over
  the sketch because they are the stricter. `PATCH /merchant/onboarding`
  refuses `phone`, every payout field and `terms_accepted` with
  `403 assist_scope` (field named); submit is outside the allowlist. The
  wizard hides those parts in an assist and says the owner finishes them.
  The B3 item 7 email therefore goes out at **start**, not submit: "Kamau
  from CRAL started filling in your setup... they can't send it for
  review... End agent access".
- **A narrower allowlist.** `GET`/`PATCH /merchant/onboarding`, onboarding
  vehicle create/patch/delete, document upload, document read/delete (only
  files that agent uploaded, else 404), and `POST
  /merchant/onboarding/assist/end`. Not `/merchant/vehicles*`,
  `/merchant/drivers*` or `/auth/phone/verification/*`: the wizard doesn't
  call the first two, and the phone is verified before an assist exists.
  Matched on `METHOD + req.route.path`, so a new route is closed by default.
  A test walks every mounted route and asserts the 403 (admin routes 401:
  the ops audience never accepts a public token).
- **The token.** Public audience as B3 says (the merchant portal's own
  endpoints read it), signed with `JWT_ACCESS_SECRET`, `asb` = the agent,
  1-hour life, no refresh token (refresh also refuses `kind = 'assist'`).
  `authenticate()` trusts the session row, not the claim: `asb` must match
  `assisted_by`, an `asb` on a user session is refused, a disabled agent's
  sessions die, and a submitted draft is `409 onboarding_submitted`.
  `requireAdmin` is untouched. The token reaches the portal in the URL
  fragment (`/assist#token=`) and lives in that tab's sessionStorage.
- **Audit**, same transaction: `merchant.assist_code_sent`,
  `merchant.assist_started`, each write (`merchant.onboarding_updated`,
  `vehicle.created/updated/deleted`, `document.uploaded/deleted`, actor the
  agent, `after.assisted_for`), `merchant.assist_ended` (by agent or owner).
- **The owner sees it and can stop it.** `GET /merchant/onboarding` carries
  `assists` (who, when, live or not); the setup page shows "Kamau from
  CRAL is filling this in with you" with End agent access, or "helped fill
  this in on 19 Nov" afterwards. The owner's Sign out everywhere also ends
  it. The reviewer sees "uploaded by agent Kamau" on a vehicle case.
- **Rate limits**: start 3 an hour per merchant per agent and 20 per agent;
  confirm 20 an hour per agent. Start takes an `Idempotency-Key`; confirm
  doesn't (the code is single-use and a stored replay would keep the
  token at rest).
- **Owner checks on dev** (end to end): (1) Ops, as a Sales agent: Add
  merchant with a phone you hold. (2) Open the invite email, set the
  password, and in onboarding go to Your details and verify the phone.
  (3) Back in Ops, My merchants: the row now offers Fill in onboarding;
  Text the owner a code, type the SMS code, Open onboarding. (4) In that
  tab: the blue banner names the owner; fill in details, add a vehicle,
  upload a document; the payout and terms parts say the owner does them,
  and there is no Submit. (5) In the owner's own browser: the setup page
  says the agent is filling it in; End agent access, then the agent's tab
  stops working. (6) As the owner, add payout, accept terms and submit.

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
