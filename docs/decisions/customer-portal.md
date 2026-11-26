# Customer portal (`apps/customer`)

The detailed status, gaps and decisions are in
[`docs/plans/customer-portal.md`](../plans/customer-portal.md) - read it
before working here. This file keeps the rules that cross into other
portals.

- **A renter's booking is a real `bookings` row** the merchant sees in
  their Bookings screen; `POST /bookings` prices server-side
  (`bookings-payouts.md`). Payment is an STK push (`payments.md`).
- **Renters get their own notifications.** `notifications.merchant_id` is
  nullable and `user_id` exists; `notify()` takes exactly one of
  `merchantId` / `userId`. Confirming, declining or merchant-cancelling a
  booking writes the hirer an in-app row (`GET /me/notifications`,
  `openapi/customer-notifications.yaml`). Renter documents (ID, licence
  with expiry) use `documents.user_id` the same way.
- **Hire groups** (PR H1 of `docs/plans/hire-that-works.md`, 2026-11-26):
  the catalog takes `group=cars|trucks|machinery`, cars = sedan + SUV +
  van, so "any type" on the cars page never lists a truck or a machine.
  `GET /catalog/hire-summary` gives each group's live count and cheapest
  price in that listing's own unit (quote-first listings counted, never
  priced); `GET /catalog/counties?group=` counts one group. Machines carry
  a `machine_type` filter.
- **The pickup code is never shown in the customer app**: only a hash
  exists and the code goes out by email; trip detail shows the handover's
  state.
- **Renters see a driver's full name** and nothing else about them
  (`drivers.md`).
- Auth screens share the merchant auth layout; a renter's reset link opens
  on the customer site.
- "List your car" sends people to the merchant app; the customer copy was
  dropped.
- Several screens were built without a canvas file (marketing pages, C8
  trips/account/notifications, towing, truck forms); see `design.md`.
- Deployed twice: `cral.co.ke` (production, VPS) and
  `app-cral.vercel.app` (tracks `develop`, talks to the dev API) - see
  `deploy.md`.

- Customer PRs are numbered `C*` (C4 booking flow, C8 trips, C9 marketing, C11 Ops renters/bookings). Renter documents: `documents.merchant_id` nullable + `user_id`.
- **One hire search at `/hire`** (PR H4, 2026-11-26,
  `docs/plans/hire-search-first.md`; replaces H3's three listing pages).
  `?type=cars|trucks|machinery`, none = All; titles "Vehicles / Cars /
  Trucks / Machinery on hire". A Type dropdown (not tabs) opens the filter
  bar; each type keeps H3's filters, and All has county and dates only.
  Changing type keeps `county`, `from`, `to` and a sort the type offers,
  and drops the rest. The county is `county` for every type (a truck's
  "from"), sent to `/trucks/:id` as `from_county`.
  - **"All" never sorts or caps by price**: per-day, per-trip and
    quote-first listings have no one price to compare. It offers
    Recommended (newest first), Newest and Best-rated owners; a price sort
    in an All link is ignored. Pick a type for price.
  - Paging is a "Show 24 more" button on the cursor (no infinite scroll).
    Filters past where and when sit behind one "Filters" pill (a bottom
    sheet on a phone) and show as removable tags.
  - The short text for search engines (a paragraph and three questions
    with FAQPage JSON-LD) sits **below** the results.
  - `/cars`, `/cars/search`, `/trucks`, `/trucks/search`, `/machinery`,
    `/machinery/search` and `/browse` redirect to `/hire?type=...` with
    their query. Detail and booking paths (`/cars/:id`,
    `/trucks/:id/request`, ...) did not move. The sitemap lists `/hire`
    and its three typed views (each its own canonical URL), not the old
    paths.
- **Masthead "Hire"** is a dropdown (All vehicles, Cars, Trucks,
  Machinery), each straight to results: opens on click or tap, closes on
  Escape and outside click, arrow keys move, 44px rows, portalled so the
  phone's scrolling tab row can't clip it. Drivers, Towing, Garage and
  Parts stay plain tabs. **"Buy and sell" goes first in the menu and on
  home only once its pages exist** (CS3b); until then no link to it.
- **Home opens with the hire search** (Type, County, dates, Search; dates
  hide for Trucks) and submits to `/hire`. Below it only the trust strip
  and the other services' doors; "How CRAL works", "Coming to CRAL" and
  the earn band were cut, and the footer's "What's coming" link with them.
