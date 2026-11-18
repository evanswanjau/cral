# UI2b - Machinery sub-site and sitemap paths

Model: **Sonnet**. Size: S. Branch: `feature/ui2b-machinery`.
Needs UI2a merged.

> You are building PR UI2b of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** Machinery hire gets its own sub-site at `/machinery` (decision
> 3: site work by the day is a different job from moving a load), built
> by copying the cars pattern. The API sitemap lists the new paths.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 4.3 (Machinery column), 6.1 row `/browse`, 6.3;
> `pages/cars/CarsHome.tsx` and the `/cars/*` routes (the pattern);
> `pages/trucks/TrucksHome.tsx` (spec-row hiding); `lib/services.ts`;
> `apps/api/src/routes/sitemap.ts` and its test.
>
> **Build.**
>
> 1. `pages/machinery/MachineryHome.tsx` at `/machinery`: `SubsiteHero`
>    with county/from/until search; `HowItWorksSteps` 4; `PriceExplainer`
>    (per day or per trip; per hour is switched off, don't mention it);
>    rail; `FaqList` 4-5; `EarnBand` -> merchant `/`.
> 2. `/machinery/search`, `/machinery/:id`, `/machinery/:id/book` reusing
>    the car pages with the category locked; spec rows as trucks (no
>    seats, no "drive yourself").
> 3. Redirects: `/browse?category=machinery` -> `/machinery/search`
>    (finish `TODO(UI2b)`); `/cars/:id` and `/book/:id` for machinery ->
>    `/machinery/...`. Registry: machinery `href` `/machinery`.
> 4. API, the one allowed change: `routes/sitemap.ts` `STATIC_PATHS` gains
>    `/cars`, `/cars/search`, `/trucks`, `/trucks/search`, `/machinery`,
>    `/machinery/search`, `/drivers`; drops `/browse`; each vehicle is
>    emitted under its category path (add `v.category` to the select).
>    Update `sitemap.test.ts` (it asserts `/browse` and `/cars/${id}`).
>    `/towing` is added by UI3.
>
> **Don't touch:** trucks flow, `Home.tsx`, the merchant app, any other
> API file.
>
> **Acceptance.** Book a machinery item end to end on dev; an old
> `/browse?category=machinery` and `/cars/<machinery id>` redirect;
> `scrollWidth <= 375` on `/machinery`; `GET /sitemap.xml` on dev lists a
> truck under `/trucks/` and no `/browse`. Link check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Give machinery hire its own sub-site and list sub-sites in the sitemap".
