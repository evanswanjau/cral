# UI1b - Front door and the cars landing

Model: **Opus**. Size: M. Branch: `feature/ui1b-front-door`.
Needs UI1a merged.

> You are building PR UI1b of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** `/` stops being a car search and becomes CRAL's front door:
> "What do you need?" with five doors, trust, how CRAL works and one
> honest "Coming to CRAL" block. Car hire moves to its own landing at
> `/cars`, with the car search, collections and rails that used to be on
> the home page.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.1 rows H1-H12 and S1-S4, P1-P2, 4.2, 4.3 (Cars column), 4.5, 5.1, 5.2,
> 6.1 rows `/services` and `/parts`; `apps/customer/src/lib/services.ts`
> and `components/subsite/*` (from UI1a); `pages/Home.tsx`;
> `routes.tsx`.
>
> **Build.**
>
> 1. `pages/cars/CarsHome.tsx` at `/cars`: `SubsiteHero` with the cars
>    registry copy and the car search (county, from, until) moved from
>    `Home.tsx` (H1); collection tiles H5-H7 (sedans, SUVs, vans) and the
>    car rails moved from `Home.tsx`; `HowItWorksSteps` (4 steps: search,
>    request dates, owner accepts and you pay by M-Pesa, pickup code at
>    handover); `PriceExplainer` (per day, minimum hire, deposit held and
>    returned: say it the way `Booking.tsx` already explains it);
>    `FaqList` (5-6 real questions answered from how the product works
>    today; no claim the code doesn't back); `EarnBand` -> merchant `/`
>    (UI4 will change it to `/join/cars`). Until UI1c, the search and
>    tiles still submit to `/browse?...`. Extract the moved pieces into
>    `components/cars/*`; the page stays under ~400 lines.
> 2. `Home.tsx` rebuilt as the front door per sections 4.2 and 5.1-5.2:
>    hero with `ServiceDoors` (five live services, cars first), no car
>    search (decision 1); `TrustStrip`; `#how` "How CRAL works" in three
>    steps that hold for every service (towing said honestly: quoted by
>    CRAL and settled on the call); `#coming` `ComingServices`;
>    `EarnBand`. Under ~400 lines. `useSeo` title and description for
>    "everything a vehicle needs", not car hire.
> 3. Registry: cars `href` -> `/cars`; its `match` covers `/cars` and
>    `/browse` until UI1c.
> 4. Routes: `/services` and `/parts` -> `<Navigate to="/#coming"
>    replace />` (decision 2); make sure `/#coming` scrolls to the block.
>    Delete `Services.tsx`, `Parts.tsx`, `VerticalPage.tsx` and, if now
>    unused, `HireDriverBanner` (H2, S2-S4, P1-P2). Towing stays at
>    `/services/towing` until UI3; its tab already links there.
>
> **Don't touch:** `Browse.tsx`, `CarDetail.tsx`, `Booking.tsx`
> (UI1c), `Masthead.tsx`/`Footer.tsx` beyond a registry import fix, the
> merchant app, the API.
>
> **Acceptance.** Front door H1 computed `font-family` Archivo,
> `font-variation-settings` `"wdth" 112`, colour `#FFFFFF` on
> `#0B0F1A`; door label Instrument Sans 600 15px; each door is one link
> with a 44px+ tap target. `scrollWidth <= 375` on `/` and `/cars`.
> `/services` and `/parts` land on the coming block. From `/`: Cars door
> -> `/cars` -> search -> a car -> book reaches the payment step. Link
> check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Turn the home page into a front door and give car hire its own landing".
