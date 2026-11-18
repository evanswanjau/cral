# UI1c - Car search and booking under /cars, legacy redirects

Model: **Sonnet**. Size: M. Branch: `feature/ui1c-cars-paths`.
Needs UI1b merged.

> You are building PR UI1c of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** Car hire lives entirely under `/cars`: results at
> `/cars/search`, a car at `/cars/:id`, its request at `/cars/:id/book`.
> Every old link (`/browse`, `/book/:id`) keeps working by redirecting,
> including sign-in `?next=` links already in flight.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 4.1, 6.1 rows `/browse` and `/book/:id`, 6.4; `routes.tsx`;
> `lib/services.ts`; `pages/cars/CarsHome.tsx`; and only the parts of
> `Browse.tsx`, `CarDetail.tsx`, `Booking.tsx` that build or read paths
> (grep `/browse`, `/book/`, `navigate(`, `backTo`).
>
> **Build.**
>
> 1. Routes: `/cars/search` renders the search page; `/cars/:id/book`
>    renders `Booking`. `Browse.tsx` takes a locked category from the
>    route (cars only: sedan, SUV, van and other non-truck,
>    non-machinery categories); trucks and machinery get their own search
>    in UI2a/UI2b, so here the category filter offers car categories only.
> 2. `components/routing/LegacyBrowseRedirect.tsx`: `/browse?...` ->
>    `/cars/search?...` keeping the query; `category=truck` ->
>    `/browse?category=truck` stays rendered as today until UI2a (leave a
>    `TODO(UI2a)`), `category=machinery` likewise until UI2b. Keep forever.
> 3. `components/routing/LegacyBookRedirect.tsx`: `/book/:id?...` ->
>    `/cars/:id/book?...` keeping `from`, `to`, `driver` and every other
>    param (`Booking.tsx:351` puts this path in `?next=`). Keep forever.
> 4. Point every internal link at the new paths: CarsHome search and
>    tiles, `CarDetail` "Request these dates" (C4, cars only for now),
>    `Booking.tsx` `?next=` builder, C2 back link "All cars in X",
>    `TripDetail.tsx:948` R5 "Find another car" -> `/cars/search`. Touch
>    lines, don't restructure; an oversized file must not grow (extract
>    if you add logic).
> 5. Registry: cars `match` drops `/browse`.
>
> **Don't touch:** trucks or machinery flows (UI2a/UI2b), `Home.tsx`, the
> merchant app, the API (sitemap is UI2b).
>
> **Acceptance.** `/browse?county=Nairobi&from=...&to=...` lands on
> `/cars/search` with the same results; an old
> `/book/<id>?from=...&to=...` lands on `/cars/<id>/book` with dates
> filled; signed out, request a car -> sign in -> back on the request with
> dates kept -> payment step. `scrollWidth <= 375` on `/cars/search`.
> Link check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Move car search and booking under /cars with redirects from the old paths".
