# UI1a - Service registry, sub-site components, shared shell

Model: **Opus**. Size: M. Branch: `feature/ui1a-service-shell`.
Needs UI0 merged.

> You are building PR UI1a of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** Lay the foundation every later sub-site PR composes: one
> registry of CRAL's services, the shared sub-site components, and a
> masthead, footer and account menu driven by the registry. On screen:
> the masthead gains a second row of service tabs (Cars, Trucks,
> Machinery, Drivers, Towing), "Find parts" and "Find services" go, and
> "List your car" becomes "Earn with CRAL". Pages themselves don't change
> yet.
>
> **Read only:** `docs/decisions/design.md`; proposal
> (`docs/plans/ui-services-proposal.md`) section 0 (canvas copy:
> `doors`, `trustCols`, `vertDefs`), 1.1 rows M1-M7, A1-A7, F1-F9, 4.3,
> 4.4, 4.5, and 5.1-5.3 (masthead and the components' layout only);
> `packages/ui/src/tokens.ts`; `apps/customer/src/App.tsx`,
> `components/site/Masthead.tsx`, `Footer.tsx`, `AccountMenu.tsx`.
>
> **Build.**
>
> 1. `apps/customer/src/routes.tsx`: move the route table out of
>    `App.tsx` unchanged (same paths, same guards), exported so
>    `scripts/check-links.mjs` reads it. `App.tsx` renders it.
> 2. `apps/customer/src/lib/services.ts`, the registry. One entry per
>    service: `key`, `tab` label, door `label` and `note`, `kicker`, `h1`,
>    `lede`, Phosphor `icon`, `photo` (path under
>    `public/images/services/`), `href`, `match` (path prefixes for the
>    active tab), `status: 'live' | 'coming'`. Live: cars (`Car`), trucks
>    (`Truck`), machinery (`Tractor`), drivers (`SteeringWheel`), towing
>    (`TruckTrailer`). Coming: garage (`Wrench`, pill `NEXT`), parts
>    (`Engine`, `PLANNED`), buy and sell (`Handshake`, `PLANNED`), with the
>    canvas `vertDefs` title and sub verbatim.
>    **`href` is where the service works today**, until its sub-site PR
>    changes it: cars `/browse`, trucks `/browse?category=truck`,
>    machinery `/browse?category=machinery`, drivers `/drivers`, towing
>    `/services/towing`. Write the final path in a comment beside each
>    (`/cars`, `/trucks`, `/machinery`, `/drivers`, `/towing`). Copy for
>    kicker, h1, lede and door notes: write it now, final, from the
>    proposal's wireframes and the service map (section 3).
> 3. `apps/customer/src/components/subsite/`: `ServiceTabs`,
>    `ServiceDoors`, `SubsiteHero` (ink `#0B0F1A` background, photo slot,
>    overline with the one skewed rule, H1, lede, a `children` slot for
>    the task widget), `TrustStrip` (canvas `trustCols` worded for every
>    service, one "How we protect you" link), `HowItWorksSteps`,
>    `PriceExplainer`, `FaqList` (emits FAQPage JSON-LD through the
>    existing `useSeo` or a script tag, whichever the codebase already
>    uses), `ComingServices` (reads `status: 'coming'`; rows are not
>    links; one `mailto:` "Tell me when it opens" per row, as
>    `VerticalPage.tsx` does today), `EarnBand` (links to the merchant
>    site `/`, or a `/join/<type>` path passed in). Each one reads its
>    content from props or the registry, none over ~150 lines.
> 4. Photos: one hero per live service in `public/images/services/`
>    (`cars.jpg`, `trucks.jpg`, `machinery.jpg`, `drivers.jpg`,
>    `towing.jpg`), Unsplash placeholders with `CREDITS.txt`, as the
>    merchant landing does (README decision 5). Reuse an existing car
>    photo for cars if one fits.
> 5. `Masthead.tsx`: row 1 logo, Sign in / account, "Earn with CRAL"
>    (merchant site `/`, replacing M7 "List your car"). Row 2
>    `ServiceTabs` from the registry, active by `match`, scrolling
>    sideways at 375px, coming services never shown. Cut M4 and M5.
> 6. `Footer.tsx`: a SERVICES column from the registry's live entries,
>    one "What's coming" link to `/#coming`; F9 becomes "Earn with CRAL".
> 7. `AccountMenu.tsx`: cut A3 and A7, drop A5 and A6 (twins of the
>    masthead and footer links).
>
> **Don't touch:** `Home.tsx`, `Browse.tsx`, `CarDetail.tsx`,
> `Booking.tsx`, `Drivers.tsx`, `Towing.tsx`, `Services.tsx`, `Parts.tsx`,
> `VerticalPage.tsx` (later PRs own them), the merchant app, the API.
>
> **Acceptance.** Every tab lands on a working page today. At 375px the
> masthead has no horizontal page scroll (`document.documentElement
> .scrollWidth <= 375` on `/` and `/browse`); the tab row scrolls inside
> itself. Tab label computed font Instrument Sans; active tab is marked by
> more than colour. `node scripts/check-links.mjs` reads `routes.tsx` and
> reports nothing new. Book a car still works.
>
> **Finish:** README "Finish" steps. Commit message:
> "Add the service registry, sub-site components and service tabs".
