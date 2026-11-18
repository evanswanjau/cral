# UI services proposal - Phase 2A review

**Status:** approved by the owner 2026-11-18, all five decisions as
recommended (see "Decisions for the owner"). No application code changed.
**Written:** 2026-11-18, against `develop` after Phase 0 (design rules in
`docs/decisions/design.md`).
**Build:** section 7's seven PRs are split into eleven smaller ones (UI0,
UI1a-c, UI2a-b, UI3-UI7) so each fits one Pro usage window. The build
prompts are in [`docs/prompts/ui-rebuild/`](../prompts/ui-rebuild/README.md);
where a prompt and this document differ, the prompt wins.

---

## Two-minute summary

**The problem, measured.** The customer site has 92 navigating links and
the merchant side 57. Of the 149, **29 should go** (19 duplicates, 10 that
lead nowhere useful) and **39 land somewhere wrong** or say "car" where the
service isn't a car. Trucks, machinery and towing have no entry in the
masthead at all: trucks hide behind a "Find a car" filter, towing hides
behind a "coming soon" garage page and a sign-in wall. The home page H1 is
"Kenya's one-stop shop for cars", its only search is "Search cars", and its
hero photos are five cars. The merchant landing never mentions drivers, and
a driver-only merchant is greeted with "Add your first vehicle".

**What changes.**

1. **A front door, not a car search.** `/` asks "What do you need?" and
   shows five doors - Hire a car, Hire a truck, Hire machinery, Hire a
   driver, Call a tow - plus trust, "how CRAL works" for every service, and
   one honest "Coming to CRAL" block (garage, parts, buy and sell). This is
   the canvas's own `doors` idea, extended to what is live today.
2. **A sub-site per live service** at `/cars`, `/trucks`, `/machinery`,
   `/drivers`, `/towing`. Each has its own hero photo, icon, kicker,
   how-it-works, "what it costs", request flow and FAQ, inside one shared
   shell (same masthead, footer, type, tokens, trust strip). Trucks start
   with the route and load, not with car-hire dates.
3. **Merchants pick what they offer.** The merchant landing becomes "Earn
   with CRAL" with a door per supplier type (`/join/cars`, `/join/trucks`,
   `/join/machinery`, `/join/drivers`), sign-up starts with "What will you
   offer?", and the portal nav shows sections for what the merchant
   actually offers (a driver-only merchant never sees "Vehicles").
4. **Link cleanup.** 29 links removed, 39 fixed, 4 dead `href="#"` terms
   links repaired, and a script that walks every link against the router
   so it can't drift again.

**What the client will see.** A home page that reads as "everything a
vehicle needs", five places that each feel like their own site, a truck
flow that asks where the load is going, and a merchant sign-up that talks
to truck owners and drivers in their own words.

**How many PRs.** **7**, each one fresh Opus session, each leaving the site
working: UI1 front door + shell + cars, UI2 trucks + machinery, UI3 drivers
+ towing, UI4 merchant landing, UI5 "what do you offer", UI6 portal nav by
offering, UI7 link sweep + SEO. Roadmap expected 3-5; 7 keeps every PR
under the 400-line-per-file rule and small enough to review. UI4-UI6
(merchant) can run alongside UI2-UI3 (customer).

**What it costs.** No new endpoints, no migrations. One API change:
`routes/sitemap.ts` emits the new paths. Everything else reuses existing
calls (`/catalog/*`, `/merchant/*`, `/services/towing`, onboarding PATCH).

**Five decisions** are at the end, each with a recommendation.

---

## 0. Sources read, and what the canvas intended

- **Website canvas** (`docs/brand/canvas/Cruz Ride Auto - Website.dc.html`):
  - `doors` (hero right column, "WHAT CRAL COVERS"): Hire a car (LIVE),
    Parts (SOON), Service and repair (SOON), Buy and sell (NEXT). Each door
    is label + one-line note + mono tag; live doors get a lighter border.
  - `heroModes`: Hire a car / Parts / Service, switching the hero between
    the car search and an "ask" box ("What part do you need?").
  - `vertDefs`: `parts`, `services`, `selling`, each a kicker, status pill,
    title, sub, three numbered points and an "ask" field. Copy is good and
    is reused verbatim in "Coming to CRAL".
  - `navSpec`: Find a car / Find parts / Find services. `footerCols`:
    HIRING A CAR / THE REST OF CRAL / HELP / CRAL.
  - `roadmap` pills: LIVE / IN BUILD / NEXT / PLANNED. `trustCols`: four
    points, reused on the front door.
  - **Not in the canvas:** trucks, machinery, drivers, towing, any merchant
    landing. Those screens are built from tokens and flagged, the same
    footing `docs/decisions/design.md` "Screens built without a canvas file"
    already records.
- **Brand PDF v2.** It is the design-system export only (sections 00
  Signature to 11 Local rails). **It has no positioning or "doors" pages.**
  Binding rules from it: Ink `#0B0F1A` headings and mastheads; Cruz Blue
  `#0F23A8` actions; Cruz Red `#D81E32` brand rule and danger; Boost
  `#B5179F` paid only, never trust; Paper `#FBF8F2` documents only; the
  14° cut once per surface; plated identifiers; round = trust, angled =
  paid; icons on a 20px grid, 1.5 stroke, never carrying status colour on
  their own.
- **Tokens** (`packages/ui/src/tokens.ts`) have **no hue free for a
  per-service accent**: the four status colours mean state, boost means
  paid, red means danger. See decision 4.
- **Rules** from `docs/decisions/design.md` and `CLAUDE.md` (index).

---

## 1. Link inventory

Every element that navigates. Verdicts: **keep**, **merge** (a twin does
the same job), **fix** (wrong place, wrong label or dead), **cut** (nowhere
useful). Line numbers are on `develop` at the time of writing.

### 1.1 Customer site (`apps/customer/src`)

**Masthead** `components/site/Masthead.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| M1 | 88 | logo | `/` | keep | |
| M2 | 33 | Find a car | `/browse` | fix | Becomes the "Cars" tab, `/cars` |
| M3 | 37 | Hire a driver | `/drivers` | keep | Tab label "Drivers" |
| M4 | 38 | Find parts | `/parts` | cut | Not live. Shown once, in "Coming to CRAL" |
| M5 | 39 | Find services | `/services` | cut | Not live (garage). Live towing was hidden under it |
| M6 | 147 | Sign in | `/sign-in?next=` | keep | |
| M7 | 166 | List your car | merchant `/` | fix | "Earn with CRAL": every supplier, not car owners |

Missing today: Trucks, Machinery, Towing tabs (added in UI1).

**Account menu** `components/site/AccountMenu.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| A1 | 141 | Notifications | `/notifications` | keep | |
| A2 | 146 | My bookings | `/bookings` | keep | |
| A3 | 147 | Parts and service orders (SOON) | `/parts` | cut | No orders exist |
| A4 | 148 | My documents | `/documents` | keep | |
| A5 | 151 | List your car (FREE) | merchant `/` | merge | Twin of M7 |
| A6 | 152 | What CRAL checks first | `/how-we-protect-you` | merge | Twin of F3 |
| A7 | 153 | Sell a car (SOON) | nothing (inert) | cut | |
| A8 | 274 | Sign out | `/` | keep | |

With A5-A7 gone the "Hiring / Listing" tabs (32-34) hold nothing; drop
them. Orphan: `/account` (signed-in devices, `App.tsx:82`) has no entry
point except D4's wrong link; add a "Signed-in devices" row.

**Footer** `components/site/Footer.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| F1 | 16 | Find a car | `/browse` | fix | Footer gets a SERVICES column from the registry |
| F2 | 17 | How it works | `/how-it-works` | fix | Page is car-only (`HowItWorks.tsx:8-23`); rewrite for all |
| F3 | 18 | How we protect you | `/how-we-protect-you` | keep | Copy fix (section 2) |
| F4 | 19 | Corporate hire | `/corporate` | keep | |
| F5 | 25 | Questions and answers | `/help` | keep | FAQ is car-only |
| F6 | 26 | Contact us | `/contact` | keep | |
| F7 | 27 | Terms & privacy | `/legal` | keep | |
| F8 | 33 | About us | `/about` | keep | |
| F9 | 34 | List your car | merchant `/` | fix | "Earn with CRAL" |

Also: phone and email at 111-113 are plain text; make them `tel:`/`mailto:`.

**Home** `pages/Home.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| H1 | 915, 964 | Search cars (form) | `/browse?county&from&to` | merge | Moves to the `/cars` hero |
| H2 | 465 | Hire a driver (banner) | `/drivers` | merge | Twin of the Drivers door |
| H3 | 247 | rail car card | `/cars/:id` | keep | Moves to `/cars` |
| H4 | 255 | rail "see all" | `/browse?collection=` | keep | Moves to `/cars`, to `/cars/search` |
| H5 | 528 | Sedans & small cars | `/browse?category=sedan` | fix | `/cars/search?category=sedan`, on `/cars` |
| H6 | 528 | SUV, 4x4 & pickup | `/browse?category=suv` | fix | Same |
| H7 | 528 | Vans & minibuses | `/browse?category=van` | fix | Same |
| H8 | 528 | Trucks & trailers | `/browse?category=truck` | fix | Becomes the truck door, `/trucks` |
| H9 | 528 | Construction & machinery | `/browse?category=machinery` | fix | Machinery door, `/machinery` |
| H10 | 768 | See how it works | `/how-it-works` | merge | Front door has its own "How CRAL works" |
| H11 | 784 | How we protect you | `/how-we-protect-you` | merge | Twin of F3; trust strip links once |
| H12 | 842 | List your car | merchant `/` | fix | Front door "Earn with CRAL" band |

**Browse** `pages/Browse.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| B1 | 430 | Hire a driver (banner) | `/drivers` | cut | Third copy; drivers are offered on the car page where they apply |
| B2 | 696 | result card | `/cars/:id` | keep | Trucks/machinery go to their own path |

**Car detail** `pages/CarDetail.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| C1 | 143 | Back (load error) | `backTo` | keep | |
| C2 | 217-229 | All cars in X | `backTo` | fix | Label per service ("All trucks in X") |
| C3 | 480 | how we protect you | `/how-we-protect-you` | fix | Plain `<a href>` reloads the app; use `<Link>` |
| C4 | 209, 891 | Request these dates | `/book/:id?from&to` | fix | Per-service path; quote trucks read "Ask for a price" |

**Booking** `pages/Booking.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| K1 | 591 | Sign in (have an account) | `/sign-in?next=` | keep | |
| K2 | 712 | Sign in (account exists) | `/sign-in?next=` | keep | |
| K3 | 733 | terms | `/legal` | merge | One "terms and privacy" link, twin K4 |
| K4 | 737 | privacy | `/legal` | merge | Twin K3 |
| K5 | 1061 | Add documents | `/documents?next=` | keep | |
| K6 | 1069 | My bookings (overlap) | `/bookings` | keep | |
| K7 | 296 | redirect when no dates | `/cars/:id` | keep | Per-service path |
| K8 | 517 | after send | `/bookings/:id` | keep | |

**Drivers** `pages/Drivers.tsx`, `pages/DriverBook.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| D1 | Drivers 71 | driver card | `/drivers/:id` | fix | Route is behind `RequireAuth` (`App.tsx:77`) though `GET /catalog/drivers/:id` is public; signed-out visitors see a sign-in form, not the driver |
| D2 | DriverBook 55 | See other drivers | `/drivers` | keep | |
| D3 | DriverBook 172 | Add your ID | `/documents` | keep | Add `?next=` back to the driver |
| D4 | DriverBook 174 | Confirm your phone | `/account` | fix | `/account` is the devices list (`Sessions.tsx`); no phone step there. Run phone verify inline as `Booking.tsx:746` does |
| D5 | DriverBook 88 | after send | `/bookings/:id` | keep | |

**Services, Parts** `pages/Services.tsx`, `pages/Parts.tsx`, `components/site/VerticalPage.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| S1 | Services 76 | Request towing | `/services/towing` | fix | Live service hidden under a garage "opening soon" page and sign-in; becomes `/towing` |
| S2 | Services 118 | Hire a driver | `/drivers` | merge | Twin of the Drivers door |
| S3 | VerticalPage 201 | Email us (garage) | `mailto:` | merge | Into "Coming to CRAL" |
| S4 | VerticalPage 228 | Find a car (garage) | `/browse` | cut | Car-hire CTA on a garage page |
| P1 | VerticalPage 201 | Email us (parts) | `mailto:` | merge | Into "Coming to CRAL" |
| P2 | VerticalPage 228 | Find a car (parts) | `/browse` | cut | Same |

`pages/Towing.tsx` has no outbound links.

**Trips** `pages/Trips.tsx`, `pages/TripDetail.tsx`

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| T1 | Trips 113 | Find a car (empty) | `/browse` | fix | "Pick a service", `/` |
| T2 | Trips 129 | Hire a driver (banner) | `/drivers` | cut | |
| T3 | Trips 140 | booking row | `/bookings/:id` | keep | |
| R1 | TripDetail 756 | My bookings | `/bookings` | keep | |
| R2 | TripDetail 790 | linked booking | `/bookings/:id` | keep | |
| R3 | TripDetail 895 | Manage this booking | `/bookings` | fix | Says "this booking", lands on the list: "All my bookings" |
| R4 | TripDetail 911 | Back to CRAL | `/` | keep | |
| R5 | TripDetail 948 | Find another car | `/browse` | fix | Back to the booking's own service |

**Account pages**

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| N1 | Notifications 94 | row CTA | `cta_href` (server) | keep | |
| X1 | Documents 219 | back | `?next=` | keep | |

**Company pages**

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| G1 | About 47 | List your car | merchant `/` | fix | "Earn with CRAL" |
| G2 | Contact 25 | email | `mailto:` | keep | |
| G3 | Contact 36 | phone | `tel:` | keep | |
| G4 | Corporate 30 | email | `mailto:` | keep | |
| G5 | Corporate 34 | phone | `tel:` | keep | |
| G6 | Help 98 | Contact us | `/contact` | keep | |
| G7 | HowItWorks 77 | how we protect you | `/how-we-protect-you` | keep | |
| G8 | HowItWorks 86 | Find a car | `/browse` | fix | "Pick a service", `/` |
| G9 | HowWeProtectYou 81 | how it works | `/how-it-works` | keep | |
| G10 | Legal 41 | email | `mailto:` | keep | |

**Customer auth** `components/auth/*`, auth pages

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| U1 | AuthShell 51 | Back to CRAL / Back to the car | `/` or `next` | fix | "Back to the car" also shows for a driver, truck or tow |
| U2 | AuthShell 69 | Sign in / Create an account | auth pages | keep | |
| U3 | AuthShell 78 | Go to the merchant portal ("Listing a car?") | merchant `/` | fix | "Offering a service on CRAL?" |
| U4 | AuthShell 86 | WhatsApp help | `wa.me` | keep | |
| U5 | BrandPanel 76 | logo | `/` | keep | |
| U6 | BrandPanel 93 | WhatsApp | `wa.me` | merge | Twin U4, same screen |
| U7 | SignIn 106 | Forgot password | `/forgot-password` | keep | |
| U8 | CreateAccount 109 | Sign in instead | `/sign-in` | keep | |
| U9 | CreateAccount 162 | terms | `/legal` | merge | One link, twin U10 |
| U10 | CreateAccount 166 | privacy | `/legal` | merge | Twin U9 |
| U11 | ResetPassword 90 | Ask for a new link | `/forgot-password` | keep | |

**Customer total: 92** - keep 46, fix 24, merge 14, cut 8.

### 1.2 Merchant side (`apps/merchant/src`)

**Landing** `pages/Landing.tsx` (signed-out `/`)

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| L1 | 331 | logo | `/` | keep | |
| L2 | 335 | What you can list | `#vehicles` | fix | "Who it's for": supplier doors |
| L3 | 336 | Earnings | `#earnings` | keep | |
| L4 | 337 | How it works | `#how` | keep | |
| L5 | 338 | FAQ | `#faq` | keep | |
| L6 | 341 | Talk to us | WhatsApp | keep | |
| L7 | 345 | Sign in | `/sign-in` | keep | |
| L8 | 348 | Get started | `/create-account` | keep | |
| L9 | 375 | List your vehicle | `/create-account` | fix | Each door's own CTA, carrying `?offer=` |
| L10 | 379 | Chat on WhatsApp | WhatsApp | merge | Twin L6 |
| L11 | 442 | Sedan card | estimator | fix | Becomes the "Cars and vans" door, `/join/cars` |
| L12 | 442 | SUV card | estimator | fix | Same door |
| L13 | 442 | Van card | estimator | fix | Same door |
| L14 | 442 | Truck card | estimator | fix | `/join/trucks` |
| L15 | 442 | Machinery card | estimator | fix | `/join/machinery` |
| L16 | 511 | Start earning | `/create-account` | merge | Twin L9 |
| L17 | 649 | Ask us about documents | WhatsApp | cut | Seven WhatsApp CTAs on one page |
| L18 | 700 | Chat with us (after FAQ) | WhatsApp | keep | |
| L19 | 720 | Create a merchant account | `/create-account` | keep | |
| L20 | 724 | Get help on WhatsApp | WhatsApp | cut | |
| L21 | 750 | footer Create an account | `/create-account` | keep | |
| L22 | 751 | footer Sign in | `/sign-in` | keep | |
| L23 | 752 | footer How it works | `#how` | merge | Twin L4 |
| L24 | 753 | footer Questions | `#faq` | merge | Twin L5 |
| L25 | 760 | footer WhatsApp | WhatsApp | keep | |
| L26 | 765 | footer Call | `tel:` | keep | |
| L27 | 806 | floating WhatsApp | WhatsApp | keep | |

Missing: no door for drivers at all.

**Auth and onboarding**

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| MA1 | BrandPanel 56 | logo | `/` | keep | |
| MA2 | BrandPanel 91 | WhatsApp | WhatsApp | merge | Twin MA4 |
| MA3 | AuthShell 93 | Sign in / Register | auth pages | keep | |
| MA4 | AuthShell 101 | WhatsApp help | WhatsApp | keep | |
| MA5 | SignIn 221 | Forgot your password | `/forgot-password` | keep | |
| MA6 | SignIn 151 | WhatsApp (code help) | WhatsApp | keep | |
| MA7 | CreateAccount 197 | terms | `#` | fix | Dead link |
| MA8 | CreateAccount 201 | privacy notice | `#` | fix | Dead link |
| MA9 | ResetPassword 90 | request a new link | `/forgot-password` | keep | |
| MO1 | Review 232 | Read the merchant terms | `#` | fix | Dead link |
| MO2 | Review 233 | Privacy notice | `#` | fix | Dead link |
| MO3 | Onboarding 196 | sign out | `/sign-in` | keep | |

**Portal shell**

| ID | Line | Label | Goes to | Verdict | Note |
|----|------|-------|---------|---------|------|
| P1 | SideNav 53 | Dashboard | `/` | keep | |
| P2 | SideNav 61 | Vehicles | `/vehicles` | fix | Hidden for driver-only; label by fleet (section 4.6) |
| P3 | SideNav 70 | Drivers | `/drivers` | keep | Second item for a driver-only merchant |
| P4 | SideNav 81 | Bookings | `/bookings` | keep | |
| P5 | SideNav 90 | Payouts | `/payouts` | keep | |
| P6 | SideNav 98 | Notifications | `/notifications` | keep | |
| P7 | SideNav 109 | Settings | `/settings` | keep | |
| P8 | AppHeader 28 | Help | WhatsApp | keep | |
| P9 | ProfileMenu 166 | My profile | `/settings` | keep | |
| P10 | ProfileMenu 108 | Log out | `/sign-in` | keep | |
| P11 | Dashboard 395 | Your vehicles | `/vehicles` | fix | By offering ("Your drivers", "Your trucks") |
| P12 | Dashboard 398 | Add a vehicle | `/vehicles/new` | fix | By offering |
| P13 | Dashboard 421 | needs-action open | `/vehicles/:id` | keep | |
| P14 | Dashboard 522 | fleet row | `/vehicles/:id` | keep | |
| P15 | Dashboard 526 | See all vehicles | `/vehicles` | keep | |
| P16 | Dashboard 499 | booking row | `/bookings/:id` | keep | |
| P17 | Notifications 111 | row CTA | `cta_href` | keep | |
| P18 | Notifications 234 | notification settings | `/settings/notifications` | fix | Old URL kept alive by a redirect; use `/settings?tab=notifications` |

**Merchant total: 57** - keep 35, fix 15, merge 5, cut 2.

### 1.3 Totals

| | keep | fix | merge | cut | total |
|---|---|---|---|---|---|
| Customer | 46 | 24 | 14 | 8 | 92 |
| Merchant | 35 | 15 | 5 | 2 | 57 |
| **All** | **81** | **39** | **19** | **10** | **149** |

---

## 2. Car-hire leakage

Places a non-car service is described or handled in car-hire terms.

### 2.1 Customer copy

| Where | What it says | Problem |
|-------|--------------|---------|
| `Masthead.tsx:31-40` | Find a car / Hire a driver / Find parts / Find services | No Trucks, Machinery or Towing; "car" leads |
| `Masthead.tsx:166`, `Footer.tsx:34`, `About.tsx:47`, `AccountMenu.tsx:151` | List your car | Suppliers are also truck owners, drivers |
| `Footer.tsx:14`, `106-108` | HIRING A CAR; "We start with hire: each car's paperwork..." | Only service in the footer |
| `AccountMenu.tsx:32-34` | Hiring / Listing tabs; "Sell a car" | |
| `Home.tsx:278` | SEO: "hire, parts and services" | No trucks, drivers, towing |
| `Home.tsx:411` | H1 "Kenya's one-stop shop for cars." | |
| `Home.tsx:920`, `964` | "Hire a car" kicker, "Search cars" | The only hero action |
| `Home.tsx:470`, `478`, `502` | "Loading cars...", "list your own car", "Browse by car type" | Trucks/machinery are "car types" |
| `Home.tsx:654-656` | "Car hire in Kenya often goes wrong..." | Trust band speaks to hire only |
| `Home.tsx:752-763` | "Search for cars... go and collect the car" | |
| `Home.tsx:829-857` | "HAVE A CAR OF YOUR OWN?" | |
| `Browse.tsx:259`, `266`, `406`, `422`, `425` | Title and H1 "Find a car", "cars in X" for every category | A truck search is titled "Find a car" |
| `Browse.tsx:499`, `537`, `722`, `737` | "THE CAR", "HOW YOU'LL DRIVE", "Show more cars", "EVERY CAR" | Shown for trucks and machinery |
| `CarDetail.tsx:229`, `440`, `549`, `586` | "All cars in X", "What CRAL checked on this car", "N cars listed", "No reviews for this car" | On a truck page |
| `CarDetail.tsx:176`, `822` | SEATS row; "Don't want to drive? Book a driver." | On machinery and trucks |
| `Booking.tsx:291`, `1089`, `1213`, `1240` | "Book a car"; "This car is hired for N days"; "N seats"; "cars are back with their owner by six" | On truck requests |
| `TripDetail.tsx:363-364`, `383`, `510`, `557`, `949` | "Match the plate on the car", "the car is yours", "Find another car" | Driver-only and truck bookings |
| `Trips.tsx:126`, `Drivers.tsx:66` | "Find a car"; "hire a car with a driver from Browse" | |
| `VerticalPage.tsx` (Parts, Services) | "Hiring is live today... the first time you hire a car... Find a car" | Car-hire CTA on garage and parts pages |
| `AuthShell.tsx:53`, `77` | "Back to the car", "Listing a car?" | Also after a driver or tow |
| `components/auth/BrandPanel.tsx:28`, `37` | "Sign in to request a car", "Hire a car you can trust." | |
| `HowItWorks.tsx:8-40` | Four car steps; "Collect the car, settle up directly" | Car-only and stale (payment is through CRAL now) |
| `HowWeProtectYou.tsx:40`, `Help.tsx:12-32`, `About.tsx:25` | "Each car's paperwork", car FAQs, "We start with the keys" | |
| `routes/sitemap.ts` (API) | Every vehicle as `/cars/:id`; no `/drivers`, no towing | Trucks indexed as cars |

### 2.2 Customer flows and furniture

- **Trucks start with car dates.** `CarDetail.tsx` (FROM/UNTIL, ~670-715)
  asks for hire dates first and the CTA reads "Request these dates"; the
  route and load are only asked on the next page (`Booking.tsx:1028`).
  `BookingSteps.tsx:17,20` shows "Request · Owner accepts · Pay ·
  Confirmed" on a quote truck, whose real flow is Request · Price · Accept
  and pay · Booked.
- **Price filter is per day.** `Browse.tsx:42-47` filters on
  `daily_rate_amount`, unlabelled; on trip, km and tonne listings it filters
  on a number the renter never sees.
- **Towing is behind sign-in** (`App.tsx:76`). Someone broken down and
  signed out gets a sign-in form, with no explanation of towing and no
  phone number. Their requests show only on that page, not in My bookings.
- **Driver profiles are behind sign-in** (`App.tsx:77`), though the API
  is public.
- **Photography is cars.** Home hero rotates five car photos
  (`Home.tsx:15-19, 117`); `assets/` has one truck and one machinery tile
  and nothing for drivers or towing. Towing and Drivers use the plain
  `PageHero` with no photo.

### 2.3 Merchant side

| Where | What it says | Problem |
|-------|--------------|---------|
| `Landing.tsx:365` | FOR CAR, VAN, TRUCK AND MACHINERY OWNERS | No drivers |
| `Landing.tsx:369`, `375`, `431`, `777` | "Your vehicle earns...", "List your vehicle", "One car or a whole fleet.", title "Earn with your car" | |
| `Landing.tsx:102`, BrandPanel 36 | "Charge per day or per trip" | Also per km, per tonne, quote first |
| `Landing.tsx:96-104` | Keys, pickup code at every handover | Not how a driver job or a truck job runs |
| `Landing.tsx:643` | "Have these ready": vehicle documents only | Drivers need licence, ID, KRA PIN |
| `components/BrandPanel.tsx:21-32` | "Your vehicles, your money", "first vehicle come next" | |
| `CreateAccount.tsx:96`, `149` | "company papers", "Company papers and vehicles come next" | Individuals and drivers too |
| `Onboarding.tsx:26` | Step 3 "Vehicles" for everyone | |
| `Welcome.tsx:19-29`, `66-74`, `95-99` | "Put your vehicles to work", "An SUV at KES 8,500 a day", "FOR EACH VEHICLE" docs | |
| `Vehicles.tsx:156-159` | Driver-only is a toggle at the bottom of "Your vehicles": "I don't have a vehicle - I only drive" | A driver has to read a vehicle form to find it |
| `Vehicles.tsx:452`, `469` | "Listed price, per day", "You earn, per day" | Trip, km, tonne listings |
| `SideNav.tsx:61-69` | "Vehicles 0" second for every merchant | Driver-only |
| `Dashboard.tsx:95`, `395-399` | "Add your first vehicle...", "Your vehicles / Add a vehicle" | Driver-only |
| `Dashboard.tsx:285` | `/ day` with the daily rate for any non-trip unit | km and tonne listings show a wrong price |
| `Dashboard.tsx:578`, `BookingList.tsx:170`, `PayoutList.tsx:153` | "after you receive the vehicle" | Driver bookings |
| `BookingList.tsx:49`, `102` | VEHICLE column; "books one of your vehicles" | Driver bookings |

---

## 3. Service map

| Service | Customer comes to | Supplier does | Money | In code today | Canvas | Live |
|---------|------------------|---------------|-------|---------------|--------|------|
| Hire cars | Hire a car for dates, self-drive or with a driver | Lists a car, accepts, hands over with a pickup code | Renter pays CRAL by M-Pesa after the owner accepts; merchant paid out less commission | Catalog, `/browse`, `/cars/:id`, `/book/:id`, Daraja, payouts | home, browse, detail, booking | Yes |
| Trucks | Move a load from A to B | Lists truck type and payload; prices per trip, day, km, tonne, or quotes | Quote (or flat trip) -> accept -> M-Pesa -> payout | T1-T3: filters, route and cargo, quote endpoints | none | Yes (prod deploy pending) |
| Machinery | Plant for site work, by the day | Lists machinery | As cars (day or trip; hour switched off) | A category slug on the car pages | none | Yes, as a category |
| Drivers | A checked driver for their own car, or one added to a self-drive car | Uploads drivers (licence, ID, KRA); Ops approves | Through CRAL; linked second booking when another owner's driver | `/drivers`, `/drivers/:id`, driver legs | none | Yes |
| Towing | Breakdown or accident, needs a tow | CRAL dispatches; no merchant | Lead capture: Ops quotes, settled on the call | `/services/towing` (sign-in), Ops queue | none | Yes (lead capture) |
| Garage | Service or repair at a price agreed first | Garage outlet quotes itemised; second quote for extra work | Paid upfront to CRAL, paid out on confirmation | Nothing; `/services` "opening soon" | `vertDefs.services`, door | Phase 4 |
| Parts | The right part for their chassis | Parts outlet quotes genuine/OEM/used, fitted or delivered | Paid to CRAL; dealer paid after "right part" | Nothing; `/parts` "opening soon" | `vertDefs.parts`, door | Phase 5 |
| Buy and sell | Buy a car whose logbook matches, or sell one | Seller lists; Ops checks the logbook | None through CRAL (later: listing fee, boosts) | Nothing (`car-sales.md`) | `vertDefs.selling`, door | Phase 6 |

---

## 4. Proposed structure

### 4.1 Sitemap

Customer, `cral.co.ke` (both deployments serve the same build):

- `/` **Front door** - doors, trust, `#how` (how CRAL works), `#coming`
  (Coming to CRAL), Earn with CRAL band
- `/cars` **Hire a car**
  - `/cars/search` results (was `/browse`)
  - `/cars/:id` car (unchanged)
  - `/cars/:id/book` request (was `/book/:id`)
- `/trucks` **Hire a truck**
  - `/trucks/search`, `/trucks/:id`, `/trucks/:id/request`
- `/machinery` **Hire machinery** (decision 3)
  - `/machinery/search`, `/machinery/:id`, `/machinery/:id/book`
- `/drivers` **Hire a driver** - landing and list together
  - `/drivers/:id` public profile; the request needs an account
- `/towing` **Call a tow** - landing, request form, your requests
- Coming, no page until built: `/garage` (GS4), `/parts` (PT2),
  `/buy-and-sell` (CS3)
- Account (unchanged): `/bookings`, `/bookings/:id`, `/documents`,
  `/notifications`, `/account`
- Company (unchanged paths, copy rewritten): `/how-it-works`,
  `/how-we-protect-you`, `/corporate`, `/about`, `/help`, `/contact`, `/legal`
- Auth (unchanged): `/sign-in`, `/create-account`, `/forgot-password`,
  `/reset-password`
- Redirect only: `/browse`, `/book/:id`, `/services/towing`, `/services`,
  `/parts` (until Phase 5) - section 6

Merchant, `merchant.cral.co.ke`:

- `/` signed out: **Earn with CRAL** - supplier doors
- `/join/cars`, `/join/trucks`, `/join/machinery`, `/join/drivers` -
  supplier pages, outside `RequireAuth`
- `/create-account?offer=<type>` -> `/onboarding` (step 1 "What you offer")
- Portal: Dashboard, [Vehicles | Trucks | Machinery], Drivers, Bookings,
  Payouts, Notifications, Settings, shown by offering

`/join/*` rather than `/trucks` etc. because the portal already owns
`/drivers` and `/vehicles`.

### 4.2 Front door

Its only job: "which service do you need?". Sections, top to bottom:

1. **Hero** (ink `#0B0F1A`): overline with the one skewed rule, H1, one
   lede, and the **doors** list - the canvas's `doors` column, extended to
   the five live services. Each door is one `<Link>`: icon, label, note.
   No car search here (decision 1).
2. **Trust strip**: canvas `trustCols`, worded for every service, with the
   single "How we protect you" link.
3. **How CRAL works** (`#how`): three steps that hold for every service -
   Tell us what you need (dates, a route, where you are) / Agree the price
   first (the owner's rate, or a quote you accept) / Pay through CRAL by
   M-Pesa (the supplier is paid after). Towing is said honestly: quoted by
   CRAL and settled on the call for now.
4. **Coming to CRAL** (`#coming`): garage, parts, buy and sell, once each
   (section 4.5).
5. **Earn with CRAL** band -> merchant `/`.

### 4.3 Sub-site template

Every live service sub-site is the same set of components with its own
content:

| Section | Component | Cars | Trucks | Machinery | Drivers | Towing |
|---------|-----------|------|--------|-----------|---------|--------|
| Hero + task | `SubsiteHero` + widget | county/from/until search | from/to county, load, truck type | county/from/until | county | request form (signed out: form, then sign in to send) |
| How it works | `HowItWorksSteps` | 4 steps | 4 steps incl. quote | 4 | 4 | 3 |
| What it costs | `PriceExplainer` | per day, min hire | per trip/day/km/tonne, quote, minimum charge | per day/trip | per day/hour/trip | quoted per job, or on the call |
| Listings | existing cards | collection rails | rail of trucks near you | rail | driver list | your requests |
| FAQ | `FaqList` + FAQPage JSON-LD | 5-6 | 5-6 | 4-5 | 4-5 | 4-5 |
| Supplier band | `EarnBand` | -> `/join/cars` | -> `/join/trucks` | -> `/join/machinery` | -> `/join/drivers` | none (CRAL dispatches) |

Commission is never stated anywhere a merchant reads; the customer price
explainer talks about the price the customer pays, never CRAL's cut.

### 4.4 Shared shell

**Constant** (makes it CRAL): masthead, footer, tokens, three fonts with
their jobs, the trust strip, `BookingSteps`, status pills, plated refs,
ink hero background, Cruz Blue actions, one skewed rule per surface.

**Masthead:** row 1 logo, Sign in / account, "Earn with CRAL". Row 2
service tabs from the registry (Cars, Trucks, Machinery, Drivers, Towing),
active by path prefix; scrolls sideways at 375px. Coming services are not
tabs.

**Per service** (from `lib/services.ts`): kicker, H1, lede, hero photo,
Phosphor icon (`Car`, `Truck`, `Tractor`, `SteeringWheel`, `TruckTrailer`;
coming: `Wrench`, `Engine`, `Handshake` - all present in the installed
`@phosphor-icons/react`), how-it-works steps, price explainer, FAQ, request
widget, supplier band copy.

**No per-service colour** (decision 4). Tokens have no free hue: status
colours mean state, Boost means paid, Red means danger. Services are told
apart by photo, icon and kicker.

### 4.5 Services not live yet

- Appear **once**: the front door's "Coming to CRAL" block. Not in the
  masthead, not in the account menu, not as a footer column (the footer
  gets one "What's coming" link to `/#coming`).
- Each row: icon, the canvas `vertDefs` title and sub verbatim, a neutral
  grey pill with a word (`NEXT` for garage, `PLANNED` for parts and buy and
  sell, per the roadmap order), and one real "Tell me when it opens"
  `mailto:` (the existing `VerticalPage` decision; no fake form).
- Rows are not links. No "opening soon" pages. `/parts` and `/services`
  redirect to `/#coming` until their phase builds the real sub-site at
  `/parts` and `/garage` (decision 2).

### 4.6 Merchant side

**Landing (`/`).** "Earn with CRAL". Doors: Cars and vans, Trucks and
fleets, Machinery, Driving. Coming: Garages, Parts dealers, Car sellers -
one WhatsApp "tell us you're interested" link for the block. Then one
shared how-it-works, payouts, FAQ, final CTA. WhatsApp CTAs go from seven
to four.

**Supplier pages (`/join/:type`).** Own photo and headline; an estimator
in that type's units (trucks: trip, day, km, tonne; drivers: day, hour,
trip) showing take-home "after CRAL's service fee", never the rate; what
you need (vehicles: logbook, insurance, tracker plus ID and KRA; drivers:
driving licence, ID, KRA PIN); how requests work for that type; FAQ; CTA
to `/create-account?offer=<type>`.

**"What do you offer?"** replaces the Welcome step content as onboarding
step 1. Multi-select: Cars and vans, Trucks, Machinery, Driving (you or
your drivers). Coming services listed below, not selectable. Effects, all
on existing data:

- Only Driving -> `drivers_only: true` (existing PATCH); step 3 becomes a
  short "Drivers" step; after submit the merchant lands on `/drivers/new`.
  The toggle at `Vehicles.tsx:156` goes.
- Trucks -> the vehicle form opens on category `truck` with truck fields;
  step label "Trucks" when every vehicle is a truck.
- The earnings example and "Have these ready" adapt to the choice.
- **Nothing new is stored.** On return the choice is derived from the
  draft's vehicle categories and `drivers_only`; `?offer=` pre-selects on
  first visit. This keeps the recorded "no `offers` column" decision.

**Portal nav by offering** (`components/portal/nav-sections.ts`), from data
`AppLayout` already loads:

| Section | Shown when | Label |
|---------|-----------|-------|
| Dashboard | always | |
| Vehicles | `vehicles.counts.all > 0` or not `driversOnly` | "Trucks" if every vehicle is a truck, "Machinery" if all machinery, else "Vehicles" |
| Drivers | always; second for driver-only | |
| Bookings, Payouts, Notifications, Settings | always | |
| (Phase 4) Premises | an outlet exists | |

Dashboard header buttons, greeting and empty states follow the same rule.

---

## 5. Wireframes

Annotations name tokens; copy is draft, final in Stage B.

### 5.1 Front door, 375px

```
+---------------------------------------+
| [CRAL]            Sign in  [Earn]     |  row 1, solid white
| Cars  Trucks  Machinery  Drivers  To> |  row 2 tabs, scroll sideways
+---------------------------------------+
| ink #0B0F1A                           |
| =/ CRAL . CRUZ RIDE AUTO LIMITED      |  the one skewed rule; Plex Mono 10px
| Everything cars in Kenya.             |  Archivo 700 wdth 112, ~34px, #FFF
| Hire a car, a truck or a driver.      |  same, #AEB8C6 (canvas pattern)
| Call a tow.                           |
| Every supplier checked by a person,   |  Instrument Sans 15/24
| every price agreed before you pay.    |
|                                       |
| WHAT DO YOU NEED?                     |
| +-----------------------------------+ |
| | [Car]  Hire a car              >  | |  door = one Link, min 64px tall
| |        Self-drive or with a driver| |  label 600 15px, note 12.5px
| +-----------------------------------+ |
| | [Truck] Hire a truck           >  | |
| |        Say the route, get a price | |
| +-----------------------------------+ |
| | [Tractor] Hire machinery       >  | |
| | [SteeringWheel] Hire a driver  >  | |
| | [TruckTrailer] Call a tow      >  | |
| +-----------------------------------+ |
+---------------------------------------+
| 01 Read before it is listed           |  trust strip, stacked
| 02 Paid only after a yes              |
| 03 Judged on evidence                 |
| 04 Expiry is enforced                 |
| How we protect you >                  |
+---------------------------------------+
| HOW CRAL WORKS              id=how    |
| 1 Tell us  2 Agree price  3 Pay       |  stacked
+---------------------------------------+
| COMING TO CRAL           id=coming    |
| [Wrench] Garage service      (NEXT)   |  neutral pill + word
|   A garage that agrees the price...   |  vertDefs title
|   Tell me when it opens               |  mailto
| [Engine] Parts            (PLANNED)   |
| [Handshake] Buy and sell  (PLANNED)   |
+---------------------------------------+
| EARN WITH CRAL (ink band)             |
| Cars, trucks, machinery or driving.   |
| [Start earning >]                     |  -> merchant /
+---------------------------------------+
| footer: CRAL | SERVICES | HELP | CRAL |
+---------------------------------------+
```

### 5.2 Front door, desktop (1280)

```
+------------------------------------------------------------------------------------+
| [CRAL]  Cars  Trucks  Machinery  Drivers  Towing            Sign in [Earn with CRAL]|
+------------------------------------------------------------------------------------+
| ink hero                                       | WHAT DO YOU NEED?                 |
|  =/ CRAL . CRUZ RIDE AUTO LIMITED              | [Car] Hire a car               >  |
|                                                |   Self-drive or with a driver     |
|  Everything cars in Kenya.                     | [Truck] Hire a truck           >  |
|  Hire a car, a truck or a driver.              | [Tractor] Hire machinery       >  |
|  Call a tow.                                   | [SteeringWheel] Hire a driver  >  |
|                                                | [TruckTrailer] Call a tow      >  |
|  lede                                          |                                   |
+------------------------------------------------------------------------------------+
| trust: 4 columns                                                                   |
| HOW CRAL WORKS: 3 columns                                                          |
| COMING TO CRAL: 3 cards in a row                                                   |
| EARN WITH CRAL band                                                                |
| footer                                                                             |
+------------------------------------------------------------------------------------+
```

### 5.3 Trucks sub-site landing, 375px

```
+---------------------------------------+
| masthead, "Trucks" tab active         |
+---------------------------------------+
| truck photo, ink shade                |
| =/ HIRE A TRUCK                       |  kicker from registry
| Tell us the load.                     |  Archivo H1
| Owners send the price.                |
| Tippers, flatbeds and box bodies from |
| owners CRAL has checked. You pay only |
| once you accept a price.              |
| +-----------------------------------+ |
| | FROM (county)     [Nairobi     v] | |  filters by county
| | TO (county)       [Mombasa     v] | |  carried into the request
| | LOAD (tonnes)     [8            ] | |  -> payload_min_kg
| | TRUCK TYPE        [Any         v] | |
| | [ Find trucks ]                   | |  -> /trucks/search?...
| +-----------------------------------+ |
+---------------------------------------+
| HOW IT WORKS                          |
| 1 Pick a truck that can carry it      |
| 2 Send the route and load. Free.      |
| 3 The owner sends a price             |
| 4 Accept and pay by M-Pesa            |
+---------------------------------------+
| WHAT IT COSTS                         |
| Per trip   flat, whatever the dates   |
| Per day    rate x days                |
| Per km     a guide; the quote is the  |
|            price                      |
| Per tonne  a guide; the quote is the  |
|            price                      |
| A minimum charge shows when set.      |
+---------------------------------------+
| TRUCKS NEAR YOU                       |
| [Tipper . 14 t . KES x / trip] ->     |  existing card, specLine
| See all trucks >                      |
+---------------------------------------+
| QUESTIONS (5)                         |
+---------------------------------------+
| Have a truck? Earn with CRAL >        |  -> merchant /join/trucks
+---------------------------------------+
```

Desktop: hero splits copy left, search card right; how-it-works and
price explainer side by side; rail full width.

### 5.4 Truck request: route -> quote -> pay, 375px

```
A. /trucks/:id                        B. /trucks/:id/request
+-------------------------------+     +-------------------------------+
| photo, plate [KDL 442N]       |     | 1 ROUTE 2 PRICE 3 PAY 4 BOOKED|  BookingSteps
| Tipper . carries 14 t         |     | (flat-trip truck: 2 = OWNER   |
| KES 25,000 / trip  or         |     |  ACCEPTS)                     |
| "Priced by quote"             |     | From  Industrial Area, Nairobi|
|                               |     | To    Changamwe, Mombasa      |
| ASK FOR A PRICE               |     | Load  Cement, 8 t             |
| From [address] [county v]     |     | Day   Mon 23 Nov              |
| To   [address] [county v]     |     | Note to owner [            ]  |
| Load [what]  [tonnes]         |     | (signed out: account stage    |
| Day  [date] (until: per-day   |     |  from Booking.tsx here)       |
|       trucks only)            |     | [ Ask for a price ]           |
| [ Ask for a price ]           |     | Free. Nothing is charged until|
+-------------------------------+     | you accept a price.           |
                                      +-------------------------------+
C. /bookings/:id (TripDetail)
+-------------------------------+
| CB-261123-004   (Waiting)     |  plated ref; pending pill + word
| The owner has 12 hours to     |
| send a price.                 |
|  ... then ...                 |
| PRICE  KES 41,000             |
| Valid until Wed 18:00         |
| [ Accept and pay ] [No thanks]|  accept-quote -> STK prompt
|  ... then ...                 |
| (Verified) Booked. Paid by    |
| M-Pesa QGR7X2M1               |
+-------------------------------+
```

Route fields move to step A so route comes first; `Booking.tsx` keeps
its existing route and quote logic, only fed from the query string.

### 5.5 Merchant landing, 375px and desktop

```
375px                                  desktop
+-------------------------------+      +--------------------------------------------------+
| [CRAL]   Sign in [Get started]|      | [CRAL] Who it's for  Earnings  How  FAQ  Sign in |
+-------------------------------+      +--------------------------------------------------+
| photo hero                    |      | photo hero: copy left, doors 2x2 right           |
| =/ FOR OWNERS, FLEETS AND     |      |                                                  |
|    DRIVERS                    |      | [Car] Cars and vans   [Truck] Trucks and fleets  |
| Put what you own, or how you  |      | [Tractor] Machinery   [Wheel] Driving            |
| drive, to work.               |      +--------------------------------------------------+
| WHAT DO YOU OFFER?            |      | COMING: Garages . Parts dealers . Car sellers    |
| [Car] Cars and vans       >   |      | how it works (3) | payouts | FAQ | final CTA    |
| [Truck] Trucks and fleets >   |      +--------------------------------------------------+
| [Tractor] Machinery       >   |
| [SteeringWheel] Driving   >   |      Each door -> /join/<type>
| COMING TO CRAL                |
| Garages . Parts . Car sellers |
| Tell us you're interested     |  one WhatsApp link
| HOW IT WORKS (3)              |
| PAYOUTS: M-Pesa or bank       |
| FAQ                           |
| [Create a merchant account]   |
+-------------------------------+
```

### 5.6 "What do you offer?" step, 375px

```
+-------------------------------+
| STEP 1 OF 5 . WHAT YOU OFFER  |
| What will you offer on CRAL?  |
| Pick all that apply. You can  |
| add more later.               |
| [x] [Car] Cars and vans       |  pre-selected from ?offer=
|     Self-drive or with your   |
|     driver                    |
| [ ] [Truck] Trucks            |
|     By trip, day, km or       |
|     tonne, or quote each job  |
| [ ] [Tractor] Machinery       |
| [ ] [SteeringWheel] Driving   |
|     You, or drivers who work  |
|     for you                   |
| COMING TO CRAL                |
| Garage services, parts and    |
| selling cars. We'll message   |
| you when each one opens.      |
| [ Continue ]                  |
+-------------------------------+
Stepper: What you offer . Your details . Vehicles|Trucks|Drivers . Documents . Review
```

### 5.7 Portal nav: driver-only and truck owner

```
Desktop side nav                      Mobile strip (scrolls)
Driver-only        Truck owner        Driver-only:
. Dashboard        . Dashboard        Dashboard  Drivers 1  Bookings 2  Payouts ...
. Drivers     1    . Trucks      3
. Bookings    2    . Drivers          Truck owner:
. Payouts          . Bookings    4    Dashboard  Trucks 3  Drivers  Bookings 4 ...
. Notifications 3  . Payouts
. Settings         . Notifications
                   . Settings
Dashboard header:  "Your drivers / Add a driver"   |  "Your trucks / Add a truck"
```

---

## 6. Redirects and risk

### 6.1 URL changes

Both customer deployments serve the SPA with a catch-all rewrite
(`apps/customer/vercel.json`, nginx on the VPS), so redirects are
client-side `<Navigate replace>` routes in the shared build. No server
config change. Production only sees them at "ship phase 2".

| Old | New | How | Keep |
|-----|-----|-----|------|
| `/browse?...` | `/cars/search?...`; `category=truck` -> `/trucks/search`, `machinery` -> `/machinery/search` | `LegacyBrowseRedirect` maps the query | forever (indexed, in sitemap today) |
| `/cars/:id` when the vehicle is a truck or machinery | `/trucks/:id`, `/machinery/:id` | detail page redirects after load | forever |
| `/book/:id?from&to&driver` | `/cars/:id/book`, `/trucks/:id/request`, `/machinery/:id/book` | resolver loads the vehicle, keeps the query | forever: in-flight `?next=` sign-in links carry it (`Booking.tsx:351`) |
| `/services/towing` | `/towing` | Navigate | forever: emailed "View request" button (`admin-service-requests/service.ts:190`); UI3 also points the email at `/towing` |
| `/services` | `/#coming` | Navigate | until GS4 builds `/garage`, then -> `/garage` |
| `/parts` | `/#coming` | Navigate | until PT2 reclaims `/parts` |
| merchant `/settings/security`, `/settings/notifications` | already redirect | | keep |

### 6.2 Deliberately unchanged

- Customer `/bookings/:id` - notification `cta_href` is built server-side
  at read time (`notifications/service.ts:55-70`).
- Merchant `/bookings/:id`, `/vehicles/:id`, `/drivers/:id`,
  `/payouts/:id` - same.
- Merchant `/onboarding` - emailed "Continue onboarding"
  (`merchant/service.ts:1166`).
- `/reset-password?token=` on both apps (`auth/service.ts:1495`).
- `/sign-in?next=`, `/documents?next=`.
- SMS: no SMS body carries a URL today (checked `notification-delivery.ts`,
  `comms-bulk-send.ts`, `auth/service.ts`).

### 6.3 SEO

- `useSeo` per sub-site: title, description, canonical `path`; FAQPage
  JSON-LD on each FAQ; Vehicle JSON-LD stays on detail pages.
- `apps/api/src/routes/sitemap.ts`: `STATIC_PATHS` gains `/cars`,
  `/cars/search`, `/trucks`, `/trucks/search`, `/machinery`,
  `/machinery/search`, `/drivers`, `/towing`; drops `/browse`; vehicles
  emitted under their category path (adds `v.category` to the select).
  `sitemap.test.ts` asserts `/browse` and `/cars/${id}` today; update it.

### 6.4 Risks

| Risk | Mitigation |
|------|-----------|
| Repeating the reverted rewrite (two 1,700-line files) | Every new page composes `components/subsite/*`; 400-line cap; one PR per sub-site |
| `Booking.tsx` (1,302), `TripDetail.tsx` (1,147), `CarDetail.tsx` (898), `Browse.tsx` (743) are already over the cap | Not rewritten. A PR that touches one must not grow it: extract the touched part into a component |
| Car hire one click further from home | Cars is the first, largest door and the first tab |
| Truck route moved to the detail page | Same fields, same validation (`truckRouteProblem`), passed by query; acceptance runs request -> quote -> pay |
| Towing form public, POST still needs auth | Form kept in `sessionStorage` through sign-in; phone number shown for the urgent case |
| `?offer=` lost on another device | Harmless: step 1 asks again, derived from what exists |
| Interim states between PRs | Visible only on dev; production ships after UI7 |

---

## 7. Build plan

Superseded for building by the eleven prompts in `docs/prompts/ui-rebuild/`
(UI1 became UI0 + UI1a-c, UI2 became UI2a-b; built in order, Opus or
Sonnet per prompt). Kept as the record of what each area needs.

### UI1 - Shell, front door, cars sub-site (L)

- **New:** `apps/customer/src/lib/services.ts` (registry: key, path,
  match, tab label, door label/note, kicker, icon, photo, status);
  `components/subsite/{SubsiteHero,ServiceDoors,ServiceTabs,TrustStrip,HowItWorksSteps,PriceExplainer,FaqList,ComingServices,EarnBand}.tsx`;
  `pages/cars/CarsHome.tsx`; `apps/customer/src/routes.tsx` (route table
  out of `App.tsx`); `scripts/check-links.mjs`.
- **Changed:** `Masthead.tsx`, `Footer.tsx`, `AccountMenu.tsx` (from the
  registry; cut A3, A5-A7, tabs; add devices row), `Home.tsx` rebuilt as
  the front door (car rails, tiles and search move to `CarsHome`),
  `Browse.tsx` becomes the search page for a locked category,
  `CarDetail.tsx`/`Booking.tsx` paths.
- **Redirects:** `/browse`, `/book/:id`, `/services`, `/parts` (section 6).
- **Deleted:** `Parts.tsx`, `Services.tsx`, `VerticalPage.tsx` (copy moves
  into `ComingServices`), `HireDriverBanner` uses on Home/Browse/Trips.
- **Accept:** link walk passes; front door H1 computed `font-family`
  Archivo, `font-variation-settings` `"wdth" 112`, colour `#FFFFFF` on
  `#0B0F1A`; door label Instrument Sans 600 15px; 375px
  `scrollWidth <= 375` on `/` and `/cars`; book a car end to end.

### UI2 - Trucks and machinery (L)

- **New:** `pages/trucks/TrucksHome.tsx`, `pages/machinery/MachineryHome.tsx`,
  `components/subsite/TruckSearch.tsx`, `components/subsite/TruckRequestPanel.tsx`.
- **Changed:** detail and request routes per category with redirects;
  `CarDetail.tsx` shows the route-first panel for trucks (extracted, not
  grown); `BookingSteps.tsx` gains the quote sequence; spec rows hide seats
  and "drive yourself" for trucks/machinery; `Browse.tsx` copy per service;
  price filter labelled per day or hidden off cars; `sitemap.ts` + test.
- **Accept:** request a quote truck -> owner quotes on dev merchant ->
  accept -> STK; flat-trip truck path; old `/cars/<truck id>` redirects;
  375px no horizontal scroll.

### UI3 - Drivers and towing (M)

- **New:** `pages/towing/TowingHome.tsx` (public), drivers landing in
  `Drivers.tsx` via `SubsiteHero`; `components/subsite/PhoneVerify.tsx`
  (extracted from `Booking.tsx`'s verify stage).
- **Changed:** `/drivers/:id` public, request gated; D4 runs phone verify
  inline; `/services/towing` -> `/towing`; towing email link
  (`admin-service-requests/service.ts:190`) -> `/towing`.
- **Accept:** signed out, open a driver and a towing page without a sign-in
  wall; request a tow through sign-in with the form kept; book a driver.

### UI4 - Merchant landing and supplier pages (M)

- **New:** `components/landing/{SupplierDoors,Estimator,DocsNeeded,LandingFaq}.tsx`,
  `pages/join/JoinPage.tsx` with a per-type content file
  `lib/supplier-types.ts`; routes `/join/:type` outside `RequireAuth`.
- **Changed:** `Landing.tsx` cut under 400 lines composing the above; cut
  L10, L16, L17, L20, L23, L24; `BrandPanel.tsx` copy; `CreateAccount.tsx`
  reads `?offer=` and stores it; MA7/MA8 point at the customer `/legal`.
- **Accept:** each `/join/*` at 375px; estimator shows take-home and no
  percentage anywhere (grep for `%`, `COMMISSION`); no em dashes.

### UI5 - "What do you offer?" (M)

- **New:** `components/onboarding/steps/WhatYouOffer.tsx`.
- **Changed:** `Onboarding.tsx` steps and labels; `Welcome.tsx` folded in;
  `Vehicles.tsx` loses the drivers-only toggle, opens on the chosen
  category, per-unit earnings labels; `Documents.tsx` skips vehicle docs
  for driver-only; Review MO1/MO2 links.
- **Accept:** sign up as individual car owner, company truck owner and
  driver-only on dev; each submits; driver-only lands on `/drivers/new`.

### UI6 - Portal by offering (S-M)

- **New:** `components/portal/nav-sections.ts`.
- **Changed:** `SideNav.tsx`, `AppLayout.tsx`, `Dashboard.tsx` (header
  buttons, greeting, per-unit rate label at 285), `BookingList.tsx`,
  `PayoutList.tsx` copy for driver bookings; P18 link.
- **Accept:** driver-only merchant sees no Vehicles item; all-truck fleet
  reads "Trucks"; mixed fleet "Vehicles".

### UI7 - Link sweep and SEO (M)

- **Changed:** `HowItWorks.tsx`, `HowWeProtectYou.tsx`, `Help.tsx`,
  `About.tsx` for every service; `Trips.tsx`, `TripDetail.tsx` (T1, R3, R5,
  leakage lines); `AuthShell.tsx`/`BrandPanel.tsx` (U1, U3, U6); `Booking`
  and `CreateAccount` term links merged; footer `tel:`/`mailto:`;
  `check-links.mjs` strict (fails on `href="#"` and unknown paths) and
  wired into `npm run gate`.
- **Accept:** link walk strict passes on both apps; grep of customer and
  merchant copy for car-only wording on non-car surfaces is clean.

---

## 8. Rules for the builders

1. No page file over ~400 lines. Compose from `components/site/` or
   `components/subsite/`. Don't grow an already-oversized file; extract.
2. Reuse existing API calls. No new endpoints. The only API edit is
   `routes/sitemap.ts` (UI2) and the towing email link (UI3).
3. Every link is checked by `scripts/check-links.mjs`, which reads the
   exported route tables and every `to=`, `navigate(`, `href=` literal.
4. Tokens from `packages/ui/src/tokens.ts` only; no new hex. Archivo for
   display, Instrument Sans for UI, IBM Plex Mono for identifiers. Status
   never by colour alone. One skewed rule per surface. Phosphor icons, no
   emojis. Never build from a canvas screenshot; reuse canvas copy where it
   exists (`vertDefs`, `doors`, `trustCols`).
5. Verify styles with `getComputedStyle`, not screenshots.
6. Mobile first at 375px; no horizontal page scroll; tap targets >= 44px.
7. No em dashes on merchant surfaces.
8. Never show the commission percentage to a merchant; take-home "after
   CRAL's service fee" only.
9. Screens with no canvas file say so in their header comment.

---

## Found in passing (not in this phase)

- `Legal.tsx` still says "There is no payment rail live yet" - stale since
  Daraja (2026-09-22).
- **Merchant terms don't exist**, though they are the only place the
  commission rate may be shown. UI4/UI5 point the dead links at `/legal`;
  the real text needs the owner.
- The towing quote email hardcodes `https://cral.co.ke`, so dev and Vercel
  demo renters get a production link.

---

## Decisions for the owner

1. **Front door: doors only, or keep a car search on it?** Recommend
   **doors only**; the car search lives on `/cars`, one tap away. Keeping
   it (the canvas `heroModes` pattern) keeps the site reading as car hire.
2. **Coming services: one block, or a page each?** Recommend **one
   "Coming to CRAL" block** on the front door, no pages; `/parts` and
   `/services` redirect to it until each phase builds its sub-site.
3. **Machinery: its own sub-site, or a section of Trucks?** Recommend
   **its own `/machinery`** (and `/join/machinery`), built in the same PR
   as trucks from the same template; site work by the day is a different
   job from moving a load.
4. **Per-service colour?** Recommend **none**: services differ by photo,
   icon and kicker. The tokens have no free hue; a colour per service needs
   a brand doc v3 first.
5. **Photography for trucks, machinery, drivers and towing.** Recommend
   the **owner supplies real photos before UI2/UI3** (one hero and one
   tile each). Otherwise licensed stock placeholders, flagged for swap,
   as the merchant landing already does.

**Owner's answers (2026-11-18):** all five as recommended. Doors only;
one "Coming to CRAL" block with `/parts` and `/services` redirecting to
`/#coming`; machinery its own sub-site; no per-service colour; no photos
yet, so Unsplash placeholders with credits, swapped by keeping the file
name.
