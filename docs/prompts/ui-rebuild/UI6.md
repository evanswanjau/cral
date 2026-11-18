# UI6 - Merchant portal by offering

Model: **Sonnet**. Size: S. Branch: `feature/ui6-portal-nav`.
Needs UI5 merged.

> You are building PR UI6 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** The merchant portal shows the sections for what the merchant
> offers. A driver-only merchant has no "Vehicles"; an all-truck fleet
> reads "Trucks"; the dashboard's buttons and empty states follow.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.2 rows P1-P18, 2.3, 4.6 (portal nav table), 5.7;
> `apps/merchant/src/components/SideNav.tsx` (or wherever it lives),
> `AppLayout.tsx`, `pages/Dashboard.tsx`, `BookingList.tsx`,
> `PayoutList.tsx`.
>
> **Build.**
>
> 1. `components/portal/nav-sections.ts`: one pure function from the data
>    `AppLayout` already loads (`vehicles.counts`, categories,
>    `driversOnly`) to the nav items, per the 4.6 table. Vehicles shown
>    when there are vehicles or the merchant isn't driver-only; label
>    "Trucks" if all trucks, "Machinery" if all machinery, else
>    "Vehicles". Drivers second for driver-only.
> 2. `SideNav.tsx` and the mobile nav render from it.
> 3. `Dashboard.tsx`: header buttons, greeting and empty states by
>    offering (P11 "Your vehicles" / "Your trucks" / "Your drivers", P12
>    "Add a ..."), per-unit rate label at line ~285. Don't grow the file;
>    extract.
> 4. `BookingList.tsx`, `PayoutList.tsx`: driver bookings say "driver",
>    not "car".
>
> **Don't touch:** onboarding, landing, the API.
>
> **Acceptance.** On dev: a driver-only merchant sees no Vehicles item
> anywhere; an all-truck fleet reads "Trucks"; a mixed fleet "Vehicles".
> No em dashes, no percentage, no deposit shown. `scrollWidth <= 375` on
> the dashboard. Link check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Show merchant portal sections for what the merchant offers".
