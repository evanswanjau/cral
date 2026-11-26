# CRAL product review - Session 1: what is wrong

> **Read this first - re-checked against `develop`.** The first pass of this
> review ran on a stale checkout (`docs/no-waiting` at `9e2be5c`, 59 commits
> behind `develop`). Every finding was then re-checked on `develop` at
> `5ee8bd6` (2026-11-19, what app-cral.vercel.app runs), in code and in the
> running app. **3 findings are fixed, 4 are partly fixed, and the rest still
> stand** - see "Re-check on `develop`" just below. Where a `file:line` in the
> body has moved, the re-check table gives the current location. The verdict
> does not change: `develop` added a much better service-first front door and
> seven real service tabs, but a signed-in renter is still inside the public
> site, and the styling problem got bigger (more inline styles, not fewer).

## Re-check on `develop` (5ee8bd6)

| ID | Status on `develop` | Evidence now |
|---|---|---|
| F01 Ops can't cancel/refund/suspend | **Still stands** | `admin-bookings/routes.ts`: GET `/admin/bookings`, `/admin/bookings/:id` only; nothing in `apps/api/src/modules` sets `suspended` |
| F02 Merchant terms unreachable | **Still stands, changed** | Links now open `customerLegalUrl()` (`onboarding/steps/Review.tsx:288-289`, `CreateAccount.tsx:211,215`), but `/legal` is a 49-line stub with no merchant terms and no fee (`customer/src/pages/Legal.tsx`). Merchants still accept terms that do not exist on screen. |
| F03 No renter app shell | **Still stands** | `customer/src/routes.tsx:69-131`: `/bookings`, `/bookings/:id`, `/documents`, `/notifications`, `/account`, `/my-cars`, `/my-parts` all under `SiteShell`; service tabs, "Earn with CRAL" and the marketing footer show on My bookings (screenshot, 375 and 1280) |
| F04 Home after sign-in is marketing | **Still stands** | Signing in lands on the new front door ("Everything cars in Kenya..."), no trips, no pending actions (screenshot) |
| F05 Phone-code bug | **Partly fixed** | Booking phone step now sends a code when it opens (`components/subsite/PhoneVerify.tsx:99-103`). Sign-up still texts a code that is never used (`auth/service.ts:328`) |
| F06 Late document gate | **Still stands** | `customer-bookings/service.ts:716` `documents_required` at submit |
| F07 Half the menu "opening soon" | **Fixed** | Masthead is 7 live service tabs (Cars, Trucks, Machinery, Drivers, Towing, Garage, Parts); no SOON items in the account menu |
| F08 Tow needs an account first | **Partly fixed** | `/towing` opens to visitors and keeps the form through sign-in (`components/towing/TowRequestForm.tsx:14,106`); an account is still needed to send it |
| F09 Customer mobile nav | **Partly fixed** | Service tabs are 44px and scroll in their own row; still no bottom tab bar, no My trips in the bar, 17/38 Home targets and 22/34 My bookings targets under 44px |
| F10 No shared type/colour system | **Still stands** | `tokens.ts` imported by no app; customer 19 px sizes + 20 `clamp()`, 64 hexes; `#0B0F1A` x130 vs `#1A1F2B` x3 |
| F11 No shared components | **Still stands, worse** | `style={{` count is now 853 / 765 / 611 (was 667 / 556 / 446); `@cral/ui` still imported for `CodeInput` plus one customer page |
| F12 Page widths vary | **Still stands** | At 1280: Notifications 213px, My bookings 534, Documents 560, Trip 860, Search 1201; titles 20-64px |
| F13 Contrast | Not re-measured | Same greys still in source |
| F14 "Coming soon" buttons | **Still stands** | `merchant/src/pages/BookingDetail.tsx:698,714,730,744,751` |
| F15 Two support numbers | **Fixed** | `733 376` no longer appears outside tests |
| F16 Merchant mobile nav | **Still stands** | `merchant/src/responsive.css:8-20`: horizontal strip, 38px items |
| F17 Pickup code email-only | **Still stands** | Unchanged |
| F18 `/account` scaffold | **Still stands** | `customer/src/pages/Sessions.tsx`, 60 lines, 20px title |
| F19 Two sign-ups, two marketing sites | **Still stands** | Merchant landing redesigned (UI4) but still separate |
| F20 Scripts for Ops tasks | **Still stands** | `apps/api/package.json` `review:profile-change`, `admin:create` |
| F21 Stale SMS queue on local boot | **Still stands** | Local `.env` unchanged |
| F22 Ops Settings placeholders | **Still stands** | `admin/src/pages/Settings.tsx` 5 placeholder tabs; `admin/src/App.tsx:52,77,78,84,85` |
| F23 Empty renter notifications | Not re-checked | - |
| F24 "IN REVIEW" on live car | Data-dependent | - |
| F25 SMS dates `toDateString()` | **Still stands** | `customer-bookings/service.ts:849` |
| F26 "NOT SAVED YET" chip | Not re-checked | - |
| F27 Vehicle form written twice | **Still stands** | `onboarding/steps/Vehicles.tsx` still has its own 12 `FormField`s |
| F28 Chauffeured default, exactly 3 photos | **Still stands** | `lib/onboarding-draft.ts:199`; `steps/Vehicles.tsx:394` |
| F29 Raw "requested" status | **Still stands** | `TripDetail.tsx:1091` |
| F30 Labels / stepper names | Not re-checked | - |
| F31 Big files | **Still stands** | 17 files over 400 lines; `Booking.tsx` 1,125, `TripDetail.tsx` 1,147, `VehicleDetail.tsx` 1,174 |

---

Reviewed 2026-11-26 by an outside reviewer. Review only: no application code
was changed. Session 2 turns this into a fix plan after the owner answers the
questions at the end.

**How it was reviewed.** All four apps were run locally (`cral_dev`, Docker
Postgres + Redis). The API was started with `EMAIL_ADAPTER`, `SMS_ADAPTER`,
`STORAGE_ADAPTER`, `PAYMENT_ADAPTER` and `DISBURSEMENT_ADAPTER` set to
`console`/`local`, so nothing real was sent, stored or charged. Screens were
driven in Chrome at 1280px and, through a 375px-wide frame, at phone width.
Font sizes, colours, touch targets and contrast were measured with
`getComputedStyle` on the live pages.

**What I created locally while walking the jobs** (by using the product, not
by seeding): renter `review.renter@example.test`, booking `CB-261126-001`
(requested, on a test car), one tow request, merchant
`review.owner@example.test` with a Toyota Fielder `KDR 901Z` submitted for
review. Delete them whenever you like.

**What I could not drive, and why.**
- **Ops console beyond its sign-in screen.** Signing in needs an admin
  password plus an SMS code. The only admin passwords on this machine are
  your own, saved in the browser, and I will not use them. Ops is judged from
  its code and route table (marked "code" below).
- **The owner side of my test booking** (accept, handover, return). The car
  belongs to a test merchant whose password I do not have. The merchant
  daily loop is counted from `apps/merchant/src/pages/BookingDetail.tsx`.
- **The truck-with-a-quote job.** There is no truck listing in the local
  database. Judged from code.

---

## The two-minute version

**Verdict.** You are right. The renter side is a marketing website with a
sign-in bolted on: after signing in, a renter still sees the same hero
banner, the same "Find parts / Find services" menu and the same big footer,
and their own trips are hidden in a dropdown behind their initials. The
"pathetic" look is not one bad screen: there is no shared design layer, so
every screen sets its own fonts, greys and buttons by hand, and the three
apps drift apart (19 different text sizes in the customer app against an
8-step brand scale nobody imports).

**The five worst findings**

1. **No renter app.** Every signed-in renter page (`/bookings`,
   `/bookings/:id`, `/documents`, `/notifications`, `/account`) renders inside
   `SiteShell`, which the code itself calls "the public site frame"
   (`apps/customer/src/components/site/SiteShell.tsx:6-31`,
   `apps/customer/src/App.tsx:53-82`). After sign-up you land on the
   marketing homepage. "My bookings" is not in the menu at all.
2. **The booking path trips people at the moment they want to pay.** Only
   at the final "Send request" does it say they also need ID and licence
   uploads (`customer-bookings/service.ts:716`). Sign-up still pays for an
   SMS code nobody uses (`auth/service.ts:328`). (On `develop` the phone
   step now does send its own code; on the stale copy it sent nothing and
   the sign-up code was rejected as "expired".)
3. **No shared look.** `packages/ui/src/tokens.ts` (the brand values) is
   imported by zero app files. The customer app uses 19 fixed font sizes plus
   21 `clamp()` sizes, 69 hex colours (35 not in the brand tokens), and two
   different "black" text colours. This is the main reason it looks
   home-made.
4. **Ops cannot fix money problems.** The Ops bookings screen is read-only
   (`admin-bookings/routes.ts`: two GETs, no actions). There is no refund
   screen and no way to suspend an account anywhere in the API. When a
   booking goes wrong, the only route is a developer.
5. **Dead ends that make it look unfinished.** The merchant terms you must
   "read in full" open a stub legal page with no merchant terms on it
   (on `develop`; it was a `#` link before). "Booking sheet" and "Download
   receipt" buttons just say "coming soon"
   (`BookingDetail.tsx:698,714,730,744,751`). (The "opening soon" menu items
   and the second support number from the first pass are fixed on
   `develop`.)

**Worth keeping - protect these from any rebuild**

- **The merchant portal's frame.** Side nav, a real dashboard ("Karibu,
  Review" + what is on hire, what is owed, your fleet), tables that turn into
  cards on a phone. It is already an application.
- **The trip page as the home of a booking** (`/bookings/:id`): step bar,
  live countdown, survives refresh, sign-in returns you to it.
- **The server-side rules**: integer money, idempotency keys, audit log in
  the same transaction, conditional state changes, the review checklists.
  None of the owner's complaint is caused by the API.
- **The brand itself** (Archivo / Instrument Sans / Plex Mono, the blue and
  red, the plated references). The problem is that the code does not use it
  consistently, not the brand.
- **Continuity details**: `?next=` after sign-in, booking drafts kept across
  the documents detour, onboarding drafts saved per step.

---

## Nine-test scorecard

Yes / No / Partly, with the evidence.

| Test | Customer (renter) | Merchant | Ops (code) |
|---|---|---|---|
| **Shell** | **No.** Signed-in pages sit in the marketing masthead + 4-column footer; "List your car" is the primary button in a renter's header (`SiteShell.tsx`, `Masthead.tsx:166`). | **Yes.** Side nav, profile menu, help (`/`, screenshot). | **Yes.** Masthead + side nav (`console/SideNav.tsx`). |
| **Home** | **No.** After sign-up the renter lands on `/`, the hero "Kenya's one-stop shop for cars." with no trace of their trips. | **Yes.** Dashboard: on hire now, awaiting payout, bookings this week, fleet. | **No.** `/` redirects to the vehicle queue; Dashboard is a placeholder (`admin/src/App.tsx:42-43`). |
| **Tasks** | **No.** Menu is "Find a car / Hire a driver / Find parts / Find services" - what the company offers (`Masthead.tsx:31-41`). Trips, documents, alerts live in the avatar dropdown. | **Yes.** Dashboard, Vehicles, Drivers, Bookings, Payouts, Notifications, Settings. | **Yes.** Vehicles, Drivers, Merchants, Renters, Bookings, Services, Payouts. |
| **State** | **Partly.** Trip page is good. But a tow request's status is shown only on the tow form page; the pickup code is only ever in an email; trip summary shows the raw word "requested" (`TripDetail.tsx:1091`). | **Yes.** Statuses on every vehicle and booking, review notes, timelines. | **Partly.** Reviews: yes. Bookings: you can see state but not change it. |
| **Feedback** | **Partly.** Loading skeletons and empty states exist. But `/notifications` stayed "No notifications yet" after I sent a booking request and a tow request; `/account` is an unstyled scaffold. | **Partly.** Good empty states; "Booking sheet" / "Download receipt" only toast "coming soon"; onboarding header said "NOT SAVED YET" right after saving a vehicle. | Not driven. |
| **Continuity** | **Yes.** `?next=` survives sign-in and the documents detour; booking draft kept (`Booking.tsx` `writeDraft`). Small gap: documents page promises "you'll go straight back" but needs a click. | **Yes.** Onboarding resumes at the step you stopped. | Not driven. |
| **Density** | **No.** Home is 4,460px tall at 1280 with a 72px headline; app pages use narrow columns (Notifications 213px wide, My bookings 534px, Documents 560px on a 1280 screen). | **Yes.** Tables, stat tiles, two-column dashboard. | **Yes** (tables, queues). |
| **Mobile** | **Partly.** No sideways scroll at 375. But the menu is clipped to "Find a" (`Masthead.tsx:96` scroll rail), there is no bottom tab bar, and 31 of 60 tap targets on Home are under 44px (nav links are 34px). | **Partly.** Tables become cards. But "Bookings" - the daily job - is off-screen in the scrolling nav strip at 375; 14 of 15 targets on Vehicles under 44px. | Not designed for phones. Acceptable for an office tool. |
| **Consistency** | **No.** Page widths, heading sizes (20/30/34/38px for page titles) and greys change page to page. | **Partly.** Consistent inside itself, different from the customer app; 39 separate button style objects. | **Partly.** Own light console; 41 button style objects; uses `#1A1F2B` as text where the other two use `#0B0F1A`. |

---

## Step 1 - The main jobs, end to end

| Job | Where it breaks or leaves the product | Verdict |
|---|---|---|
| **Hire a car: search** | Works. Browse grid, filters, listing page. | Works |
| **Hire a car: request** | Sign-up asks for phone; an SMS code is sent at sign-up and silently wasted (`auth/service.ts:281`, customer `CreateAccount.tsx:82` ignores `next: "verify_phone"`). At booking, the phone step claims a code was sent but none was (`Booking.tsx:315` sets the stage without calling `sendCode`); entering the sign-up code gives "That code has expired". After "Send it again" and the code, the final "Send request" fails with "Add your national id and driving licence before requesting a car." Upload page, then back, then send. | Works with help |
| **Owner accepts** | Merchant gets an SMS + in-app request. SMS dates read "Thu Dec 03 2026" in UTC, not Nairobi (`customer-bookings/service.ts:849`). Accept is 1 tap + a confirm. Not driven (no password for the test merchant). | Works (code) |
| **Pay** | Trip page sends the M-Pesa prompt. Not reachable in this walk (owner never accepted). Live rail is Daraja sandbox / Co-op pending. | Not verified |
| **Pickup** | Code goes to the renter **by email only**; the trip page shows "sent to your email" (`TripDetail.tsx` `HANDOVER_STATE_COPY`). The renter must leave the app at the car. | Works with help (email) |
| **Return** | One tap "Mark returned" + finish on the merchant side. No code. | Works (code) |
| **Payout** | Cut by a 06:00 scheduled job; Finance presses Pay in Ops; nothing moves without a configured rail. Merchant sees it on Payouts. | Works with help (Ops) |
| **Hire a truck with a quote** | Code path exists end to end (`Send a price` in `BookingDetail.tsx:679`, `acceptQuote` on the trip page). No truck listing locally to walk. | Not verified |
| **Request a tow** | Must have an account first: `/services/towing` sits under `RequireAuth` (`App.tsx:76`) - a stranded driver signs up before asking for help. Phone not pre-filled even when verified. Request works; Ops is emailed (email shows raw ids `svc_…`, `usr_…`). Status shows only on the tow page; the account menu's "Parts and service orders" goes to the Parts "opening soon" page (`AccountMenu.tsx:147`). Quote comes by phone call. | Works with help (phone, email) |
| **Merchant sign-up, onboard** | Works, 5 steps. Terms and privacy links are `href="#"` at sign-up (`CreateAccount.tsx:197,201`) and at the "read in full" checkbox (`Review.tsx:232-233`). | Works, but terms unreachable |
| **Get approved by Ops** | Merchant file + checklist + Approve exist (`admin-merchants` routes). Not driven. | Works (code) |
| **Vehicle live** | Vehicle case + checklist + decision exist. Not driven. | Works (code) |
| **Profile change after approval** | No Ops screen. Only `npm run review:profile-change` (`apps/api/package.json:24`). | Works with help (script) |
| **Fix a booking, refund, suspend** | No Ops action exists (see Step 4). | Not built |

---

## Step 2 - Customer app

### Routes

| Route | Kind | Shell it renders in |
|---|---|---|
| `/`, `/browse`, `/cars/:id`, `/drivers`, `/parts`, `/services`, `/how-it-works`, `/how-we-protect-you`, `/corporate`, `/about`, `/help`, `/contact`, `/legal` | Public site | `SiteShell` |
| `/book/:id` | App (booking flow) | `SiteShell` |
| `/bookings`, `/bookings/:id`, `/documents`, `/notifications`, `/account`, `/services/towing`, `/drivers/:id` | App (signed-in renter) | `SiteShell` - same marketing masthead and footer |
| `/sign-in`, `/create-account`, `/forgot-password`, `/reset-password` | Auth | Split-screen auth layout |

Every app route uses the public site frame. There is no renter shell.

### What a renter with one upcoming trip sees first after sign-in

The marketing homepage: full-bleed car photo, "Kenya's one-stop shop for
cars.", a county/date search, then carousels ("Most hired in Kenya",
"Weekend favorites"). The only signs of being signed in are initials in a
circle with a red dot and the same "List your car" button. To find the trip:
tap the initials, then "My bookings", then the trip. Three taps, one of them
hidden.

### Screen by screen

- **Browse** (`/browse`): a decent grid at 1280. At 375 it is 8,176px tall
  (24 cards stacked in one column). No map, no sort chips visible above the
  fold on phone.
- **Listing** (`/cars/:id`): clear spec table and booking card. The "What
  CRAL checked on this car" block showed all three documents "IN REVIEW" on a
  live car (test data, but the UI happily shows "in review" as the trust
  proof on a bookable listing). Grey labels fail contrast (2.57:1).
- **Request form** (`/book/:id`): the price summary appears twice side by
  side (form and sidebar). Phone-code bug and late document gate as above.
  Code boxes accept fast typing poorly (digits dropped while typing quickly;
  pasting works).
- **Payment**: not reachable in this walk.
- **Trip detail** (`/bookings/:id`): the best customer screen - status pill,
  4-step bar, live countdown, withdraw button, summary. Weak points: step
  labels at 2.48:1 contrast, raw "requested" in the summary, still wrapped
  in the marketing footer.
- **My bookings / Documents / Notifications**: narrow centred columns
  (534 / 560 / 213px wide on a 1280 screen), each a different width, each
  above the same tall footer.
- **Account** (`/account`): a leftover scaffold. Unstyled list flush to the
  left edge, raw device id `dev_b0a7…`, 20px heading, generic tab title, no
  name/phone/password editing (`apps/customer/src/pages/Sessions.tsx`, 60
  lines).

---

## Step 3 - Merchant portal

**Onboarding, one-car individual owner: 5 steps** (Welcome, Your details,
Vehicles, Documents, Review), counted by doing it:

| Step | What is asked |
|---|---|
| Account | email, password, 6-digit email code |
| Welcome | another sales page, one button |
| Your details | first, middle, surname, national ID no., KRA PIN, phone, 6-digit SMS code, payout (M-Pesa number, or 4 bank fields) - 7 to 11 inputs |
| Vehicles | type, make, model, year, plate, transmission, fuel, colour, county, pickup address, driver/self-drive, daily rate - 12 inputs, plus **exactly** 3 photos |
| Documents | national ID, KRA PIN, logbook, insurance + expiry date, tracker certificate - 5 uploads, 1 date |
| Review | terms checkbox (terms link is dead), submit |

About 30 inputs and 8 uploads for one car. That is reasonable for a
regulated listing; the drag is the extra Welcome page, the dead terms link,
and the vehicle form defaulting to "With driver (chauffeured)".

- **Truck fleet**: same flow; picking "Truck & trailers" adds truck type and
  payload. Each extra vehicle repeats 12 inputs + 3 photos + 3 documents.
- **Driver-only merchant**: a "I don't have a vehicle - I only drive" switch
  on the Vehicles step. Exists; not walked further.
- **Company**: adds 5 company fields and 3 company documents (code).

**Daily loop taps (from `BookingDetail.tsx`):** open the request (2: list
row or notification) - Accept + confirm (2) - "Start the hire", type the
renter's 4-digit code, Verify, Finish (3 + typing) - "Mark returned" +
Finish (2) - get paid (0, scheduled). **About 9 taps.** Good. The problems
are around it: "Booking sheet" on every state and "Download receipt" on
completed bookings do nothing but say "coming soon"; "Contact support" is a
`mailto:` link; on a phone, "Bookings" is scrolled out of view in the nav.

---

## Step 4 - Ops console (from code)

| Task the business needs | Ops has |
|---|---|
| Approve a merchant | Screen (`/merchants/:id`, approve / request changes / reopen) |
| Review a vehicle | Screen (`/vehicles/:id`, checklist + decision) |
| Review a driver | Screen (`/drivers/:id`) |
| Review a renter's ID and licence | Screen (`/renters/:id`) |
| Answer a tow | Screen (`/services/:id`, quote / decline / complete) |
| Pay payouts | Screen (`/payouts`, Finance) |
| Cut one payout run now | API only, no button |
| Fix a booking (change dates, cancel, reassign) | **Nothing.** Bookings is read-only. |
| Refund a renter | **Nothing** in Ops. Refunds only fire from merchant/renter cancel paths. |
| Suspend an account | **Nothing.** No endpoint sets `suspended`. |
| Approve a merchant's profile change | **Script** `npm run review:profile-change` |
| Add the first admin | **Script** `npm run admin:create` |
| Message a merchant | Screen (Communications) |

**Buttons and nav items that lead to a placeholder:** Settings opens on its
default tab "Review rules", which is a placeholder; 5 of its 6 tabs are
placeholders (`admin/src/pages/Settings.tsx:38,73-76`). Profile menu "Your
profile" and "Notification preferences" (`admin/src/App.tsx:65-66`).
`/dashboard`, `/invoicing`, `/disputes` routes (hidden from the nav). The
masthead bell is inert.

---

## Step 5 - Visual quality, measured

Measured on live pages with `getComputedStyle` (customer, merchant) and by
counting style literals in source (all three).

| Measure | Customer | Merchant | Ops |
|---|---|---|---|
| Distinct fixed font sizes in source | 19 (8px to 26px, incl. 10.5, 11.5, 12.5, 13.5, 14.5, 15.5) + 21 `clamp()` sizes | 18 + 11 `clamp()` | 12 + 5 `clamp()` |
| Brand scale in `tokens.ts` | 8 sizes | 8 | 8 |
| Most sizes on one live page | 21 (Home, 1280) | 9 (Dashboard, 375) | - |
| Font weights | 400 / 500 / 600 / 700 | same | same (700 once) |
| Hex colours in source | 69 (35 not in tokens) | 70 (33 not in tokens) | 35 (8 not in tokens) |
| Main text colour | `#0B0F1A` x99, `#1A1F2B` x3 | `#0B0F1A` x97, `#1A1F2B` x32 | `#1A1F2B` x89, `#0B0F1A` x4 |
| Button style definitions | 3 local + `@cral/ui` Button on 1 page | 39 | 41 |
| Tap targets under 44px at 375 | Home 31/60, Trip 16/18, Docs 18/19 | Vehicles 14/15, Bookings 15/16 | - |
| Contrast failures (AA), examples | step labels "2. OWNER ACCEPTS" 2.48:1, plate ref 3.27:1, spec labels 2.57:1, footer headings 3.54:1 | grey mono kickers and helper text (same greys) | - |

**Components that exist twice in different styles:** sign-in / create
account / forgot / reset screens (customer and merchant each have their own
`AuthShell`, `BrandPanel`, `SignIn`), the six-digit code input (shared one
plus a merchant wrapper), plate badge (`customer/components/site/PlateBadge.tsx`
deliberately not `@cral/ui`'s `PlatedReference`), the vehicle details form
(onboarding `steps/Vehicles.tsx:279-364` re-types the same fields as
`components/vehicle/VehicleDetailsFields.tsx:86-145`), notifications pages,
status chips (`portal/status.ts` vs `console/status.ts` vs customer inline),
error boundaries, two marketing sites (customer home and merchant
`Landing.tsx`, 816 lines).

**The three fixes that would change the look the most**

1. **A renter app frame.** Signed-in pages get their own shell: a compact
   header with My trips / Documents / Alerts, a bottom tab bar on phones, no
   marketing footer, one page width. This alone answers "feels like a
   website".
2. **One type scale and one colour set, used from code.** Eight text sizes,
   one ink colour, greys that pass contrast, defined once (CSS variables or
   Tailwind theme from `tokens.ts`) and nothing hand-typed.
3. **A small shared component kit** in `packages/ui` - Button, Card,
   PageHeader, ListRow, StatusPill, EmptyState, Field - used by all three
   apps, so a fix in one place shows up everywhere.

---

## Step 6 - Why, in code terms

- **`packages/ui` exists but is not used.** It exports tokens,
  `StatusBadge`, `PlatedReference`, `Button`, `StateScreens`, `CodeInput`.
  The apps import: customer - `CodeInput`, and `Button`/`StatusBadge`/state
  screens on exactly one page (`/account`, the worst-looking one); merchant -
  `CodeInput`; Ops - `CodeInput`. **`tokens.ts` is imported by zero app
  files.**
- **Styling is hand-typed inline.** `style={{` appears 667 times in the
  customer app, 556 in merchant, 446 in Ops, against 45 / 150 / 0 Tailwind
  `className`s - though all three apps ship a Tailwind config. Each element
  carries its own `font: "600 13.5px/1.4 'Instrument Sans'"` and hex colour,
  so there is no single place to change a size or a grey. Merchant and Ops
  keep big style dictionaries instead (`onboarding/styles.ts` 1,062 lines,
  `portal/styles.ts` 860).
- **Files copied between apps.** 13 file names exist in all three apps with
  different contents (`api.ts`, `auth.ts`, `auth-api.ts`, `bookings-api.ts`,
  `ErrorBoundary.tsx`, `use-page-title.ts`, `query-client.ts`, `styles.ts`,
  `SignIn.tsx`, ...); `vehicle-categories.ts`, `kenya.ts`, `hiring-units.ts`
  are mirrored by hand between customer and merchant.
- **Page files over 400 lines: 18.** Biggest: `customer/pages/Booking.tsx`
  1,302, `merchant/pages/VehicleDetail.tsx` 1,174, `customer/pages/TripDetail.tsx`
  1,147, `customer/pages/Home.tsx` 969, `merchant/pages/BookingDetail.tsx`
  962, `customer/pages/CarDetail.tsx` 898. Each mixes data, rules and
  hundreds of inline styles, which is why a "small visual tweak" turns into a
  risky rewrite (the reverted rewrite is the symptom).
- **Each screen was copied from a design file on its own.** The canvas is
  inline-styled, and the rule was "reproduce its styles verbatim". That
  gives pixel matches per screen and no system between them, and screens
  with no canvas (renter account, notifications, tow, trips) were improvised
  in the same hand-styled way.

**Plain answer: yes, the way the UI is built is the cause.** The API and the
business rules are sound. The renter routes were hung on the marketing
shell, and the visual layer has no shared parts, so quality depends on which
session built which screen. Restyling screens one by one will not fix it;
a shell and a small shared kit will.

---

## Findings

Severity: **Blocker** = a person cannot finish a job, or money or data is at
risk. **Major** = they finish, but it is confusing, slow or looks
untrustworthy. **Minor** = polish. Size: S (hours), M (a session or two),
L (several sessions).

| ID | Sev | Where | What is wrong | Who it hurts, what it costs | Smallest fix | Size |
|---|---|---|---|---|---|---|
| F01 | Blocker | Ops `/bookings/:id`; `apps/api/src/modules/admin-bookings/routes.ts` (GET only); no `suspended` writer in `apps/api/src/modules` | Ops can look at a booking but cannot cancel, change, refund or suspend. | You and your client: every dispute, no-show or fraud needs a developer and a database. Money stuck, renters waiting. | Ops actions on a booking: cancel with refund, mark no-show; suspend/reactivate on merchant and renter files. | M |
| F02 | Blocker | Merchant `/create-account` (`CreateAccount.tsx:197,201`); onboarding Review (`steps/Review.tsx:232-233`) | Terms and privacy links go to `#`. Merchants tick "I have read the terms in full" with no way to open them - and the fee is only stated there. | Merchants and the business: an agreement they could not read; weak footing in any fee dispute. | Point both links at real terms pages. | S |
| F03 | Major | Customer, all signed-in routes; `SiteShell.tsx:6-31`, `App.tsx:53-82` | No renter app shell: marketing masthead, "List your car" CTA and 4-column footer on trips, documents, notifications, account. | Renters: it feels like a brochure, not a tool; this is the owner's core complaint. | Separate `AppShell` for signed-in routes (header with My trips / Documents / Alerts, bottom tabs on phone, no footer). | M |
| F04 | Major | Customer `/` after sign-in/sign-up | Home is the marketing hero; no "your next trip" or "what needs you". | Returning renters hunt for their trip through a hidden menu (3 taps). | Signed-in home = trips + pending actions; keep marketing home for visitors. | M |
| F05 | Major | Customer `/book/:id`; `Booking.tsx:315,762`; `auth/service.ts:281`; customer `CreateAccount.tsx:82` | Phone step says a code was sent but none is; the sign-up code is refused as "expired" (API 410). Sign-up also pays for an SMS that is never used, against the "no SMS at sign-up" rule. | First-time renters at the point of booking; wasted SMS on every sign-up. | Send the code when the step opens; stop the sign-up SMS (or accept it). | S |
| F06 | Major | Customer `/book/:id`; `customer-bookings/service.ts:701-719` | ID and licence requirement appears only after phone verification, at the final "Send request". | Renters do two hoops in a row and leave the page mid-request. | Ask for documents up front in the booking steps, or show the checklist before the form. | S |
| F07 | Major | Customer top menu; `Masthead.tsx:31-41`; `Parts.tsx:8`; `Services.tsx:8`; `AccountMenu.tsx:147,153` | 2 of 4 main menu items are "OPENING SOON"; account menu "Parts and service orders" and "Sell a car" are SOON too. | Every visitor: half the product looks unfinished. | Hide unbuilt verticals from menus; keep one "coming soon" mention on Home. | S |
| F08 | Major | Customer `/services/towing`; `App.tsx:76` | A tow needs an account first; the request's status is only on the tow form page; menu link for "service orders" points at Parts. Phone not pre-filled. | Stranded drivers, at their worst moment. | Allow a tow request with name + phone; list service requests in My trips. | M |
| F09 | Major | Customer masthead at 375px; `Masthead.tsx:96` | Menu clipped to "Find a"; no bottom tab bar; nav links 34px tall; 31/60 Home tap targets under 44px. | Most Kenyan users, who are on phones. | Phone layout with bottom tabs; 44px minimum targets. | M |
| F10 | Major | All three apps; `packages/ui/src/tokens.ts` (0 importers) | No shared type or colour system: 19 sizes + 21 clamps (customer), 35/33/8 off-token colours, two different ink colours. | Everyone: the "home-made" look; every fix must be repeated by hand. | Theme from tokens (CSS variables / Tailwind theme); 8 sizes, 1 ink. | M |
| F11 | Major | All three apps | No shared components: 39 (merchant) and 41 (Ops) button style objects; duplicate auth screens, status chips, plate badges, notifications pages. | You: every change costs three times; drift returns after each fix. | Build Button/Card/PageHeader/ListRow/StatusPill/EmptyState/Field in `packages/ui`; migrate per screen. | L |
| F12 | Major | Customer app pages at 1280 | Content width changes page to page: 213 / 534 / 560 / 802 / 860 / 1201px; page titles 20 / 30 / 34 / 38px. | Renters: pages feel unrelated and sparse. | One page container and one PageHeader. | S |
| F13 | Major | Customer and merchant greys | AA contrast failures: step labels 2.48:1, plate ref 3.27:1, spec labels 2.57:1, footer headings 3.54:1. | Anyone outdoors on a phone; older users. | Darken the two label greys in the theme. | S |
| F14 | Major | Merchant `/bookings/:id`; `BookingDetail.tsx:698,714,730,744,751` | "Booking sheet" and "Download receipt" buttons only toast "coming soon". | Merchants: looks broken; trust drops on a money screen. | Remove them until built. | S |
| F15 | Major | Merchant onboarding footer `Onboarding.tsx:302` vs `lib/support.ts:2` | Two support numbers: +254 733 376061 and 0735 656 066. | New merchants calling the wrong line. | One constant, used everywhere. | S |
| F16 | Major | Merchant nav at 375px (screenshot) | "Bookings" scrolled out of view in the top nav strip; 14/15 targets on Vehicles under 44px. | Owners running the business from a phone. | Bottom tabs on phone (Dashboard, Bookings, Vehicles, Payouts, More). | S |
| F17 | Major | Customer trip pickup; `TripDetail.tsx` `HANDOVER_STATE_COPY` | Pickup code exists only in an email; the app says "sent to your email". | Renters at the car, switching to email with the owner waiting. | Decision for the owner (security vs ease) - see questions. | S |
| F18 | Major | Customer `/account`; `pages/Sessions.tsx` | Unstyled leftover: raw device id, no layout, no profile/phone/password editing, generic tab title. | Renters checking their account: looks broken. | Real account page: name, phone, email, password, devices. | S |
| F19 | Major | Customer and merchant sign-up | Renter: name + phone + email + password, no email check, SMS sent. Merchant: email + password + email code. Two marketing sites (customer Home, merchant `Landing.tsx`). | Owners who are also renters see two products; support explains two flows. | Decide one account model and one marketing site (question 5). | M |
| F20 | Major | Ops profile-change approval, first admin; `apps/api/package.json:22-24` | Only by `npm run` scripts. | You: a developer is in the approval loop. | Profile-change queue on the merchant file. | M |
| F21 | Major | Local API boot (`npm run dev:api`), log shows 20 `[sms:console]` "Habari, testing." on start | Stale queued bulk SMS jobs run on boot. With the repo `.env` (`SMS_ADAPTER=textsms`) they would text real numbers. | You: real SMS spend and confused recipients from a laptop. | Clear the local queue; default local `.env` to console adapters. | S |
| F22 | Minor | Ops Settings `Settings.tsx:38,73-76`; profile menu `admin/src/App.tsx:65-66` | Settings opens on a placeholder; 5 of 6 tabs and 2 profile-menu items are "not built". | Ops staff. | Open on Team; hide unbuilt tabs and items. | S |
| F23 | Minor | Customer `/notifications` | Empty after sending a booking request and a tow request; avatar shows a red dot for "documents due" instead. | Renters wondering if it worked. | Write a renter notification for their own requests. | S |
| F24 | Minor | Customer `/cars/:id` | "What CRAL checked" shows "IN REVIEW" for all documents on a live car (test data, but nothing stops it). | Renters reading the trust block. | Hide the block unless documents are accepted. | S |
| F25 | Minor | `customer-bookings/service.ts:849` | Booking SMS dates use `toDateString()` (UTC, "Thu Dec 03 2026"). | Merchants reading SMS. | Nairobi date format. | S |
| F26 | Minor | Merchant onboarding header (screenshot) | Shows "NOT SAVED YET" right after a vehicle is saved. | Merchants. | Tie the chip to the real save state. | S |
| F27 | Minor | `steps/Vehicles.tsx:279-364` vs `vehicle/VehicleDetailsFields.tsx:86-145` | Same vehicle form written twice. | You: two places to fix. | Onboarding uses the shared component. | S |
| F28 | Minor | Merchant vehicle form | Defaults to "With driver (chauffeured)"; requires **exactly** 3 photos. | Merchants. | Default to self-drive; "at least 3". | S |
| F29 | Minor | Customer `TripDetail.tsx:1091`, `/documents` | Raw status word "requested"; documents page promises "you'll go straight back" but does not. | Renters. | Human status words; auto-return after both uploads. | S |
| F30 | Minor | Customer create-account labels; merchant onboarding stepper | Inputs named by placeholder, not label; stepper buttons have no name for screen readers. | Users of assistive tech. | Connect labels; name the step buttons. | S |
| F31 | Minor | Code size | 18 files over 400 lines; `Booking.tsx` 1,302. | You: every change is risky. | Split as screens are touched, not in a big-bang rewrite. | M |

---

## Questions for the owner

1. Should signed-in renters get their own app frame (trips-first home,
   bottom tabs on phone, no marketing footer)? **Recommend: yes, first.**
2. Publish real merchant terms (with the fee) at the link onboarding points
   to, before more merchants sign up? **Recommend: yes - this needs your
   wording or a lawyer's, not an AI session.** (The old question about
   hiding "opening soon" menu items is settled on `develop`.)
3. Fix the look by building a small shared kit in `packages/ui` and moving
   screens onto it one at a time, rather than restyling pages in place?
   **Recommend: kit first, customer app first, merchant portal kept as is
   until then.**
4. Give Ops cancel / refund / suspend before any new vertical (agents,
   garage, parts)? **Recommend: yes.**
5. Show the pickup code on the trip page (signed in) as well as by email?
   **Recommend: yes** - the email-only rule costs more at the car than it
   protects.
