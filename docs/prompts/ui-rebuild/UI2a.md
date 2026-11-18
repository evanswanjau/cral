# UI2a - Trucks sub-site

Model: **Opus**. Size: M. Branch: `feature/ui2a-trucks`.
Needs UI1c merged.

> You are building PR UI2a of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first, then
> `docs/decisions/trucks.md`.
>
> **Goal.** Hiring a truck becomes its own sub-site that starts with the
> job, not with car-hire dates: where the load goes from and to, what it
> is, what truck. Results, the truck page and the request (quote or flat
> trip) all live under `/trucks`.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 2 (truck rows), 4.3 (Trucks column), 5.3, 5.4, 6.1 rows `/browse` and
> `/cars/:id`, 6.4; `lib/services.ts`; `components/subsite/*`;
> `pages/cars/CarsHome.tsx` (the pattern to copy); in `Browse.tsx`,
> `CarDetail.tsx`, `Booking.tsx`, `BookingSteps.tsx` only the truck
> branches (grep `truck`, `truckRouteProblem`, `quote`).
>
> **Build.**
>
> 1. `pages/trucks/TrucksHome.tsx` at `/trucks`: `SubsiteHero` with
>    `components/subsite/TruckSearch.tsx` (from county, to county, load,
>    truck type; same validation as `truckRouteProblem`);
>    `HowItWorksSteps` (4 steps including "the owner quotes, you accept");
>    `PriceExplainer` (per trip, day, km, tonne, a quote, minimum charge:
>    from the real pricing units in `trucks.md`); a rail of trucks;
>    `FaqList` 5-6; `EarnBand` -> merchant `/` (UI4 makes it
>    `/join/trucks`).
> 2. `/trucks/search` (search page locked to trucks, truck filters, price
>    label per unit or hidden), `/trucks/:id` (detail with the route-first
>    panel: extract `components/subsite/TruckRequestPanel.tsx` from
>    `CarDetail.tsx` rather than growing it; spec rows hide seats and
>    "drive yourself"), `/trucks/:id/request` (the existing request and
>    quote flow; button "Ask for a price" for quote trucks, per C4).
>    `BookingSteps` shows the quote sequence for quote trucks. The route
>    and cargo travel by query param.
> 3. Redirects: `/browse?category=truck...` -> `/trucks/search?...`
>    (finish the `TODO(UI2a)` in `LegacyBrowseRedirect`); `/cars/:id` and
>    `/book/:id` for a truck redirect to `/trucks/:id` and
>    `/trucks/:id/request` after the vehicle loads. Keep forever.
> 4. Registry: trucks `href` -> `/trucks`, `match` `/trucks`.
>
> **Don't touch:** machinery (UI2b), `Home.tsx`, the merchant app, the
> API, payments.
>
> **Acceptance.** On dev: request a quote truck -> owner quotes on the
> dev merchant portal -> accept -> STK push prompt; a flat-trip truck
> goes straight to payment; an old `/cars/<truck id>` lands on
> `/trucks/<id>`. `scrollWidth <= 375` on `/trucks`, `/trucks/search`,
> `/trucks/<id>`. No seats or "drive yourself" on a truck. Link check
> reports nothing new. Book a car still works.
>
> **Finish:** README "Finish" steps. Commit message:
> "Give truck hire its own sub-site with a route-first request".
