# UI5 - Onboarding step 1, "What do you offer?"

Model: **Opus**. Size: M. Branch: `feature/ui5-what-you-offer`.
Needs UI4 merged.

> You are building PR UI5 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first, then
> `docs/decisions/merchant-portal.md` (onboarding, `drivers_only`, the
> "no `offers` column" decision).
>
> **Goal.** Merchant onboarding starts by asking what the merchant will
> offer, and every step after speaks to that choice: a driver-only
> merchant never adds a vehicle, a truck owner's vehicle form opens on
> trucks. Nothing new is stored.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.2 rows MO1-MO9, 2.3, 4.6 ("What do you offer?"), 5.6;
> `apps/merchant/src/pages/Onboarding.tsx` and
> `components/onboarding/steps/*`; the onboarding PATCH call in the
> merchant API client.
>
> **Build.**
>
> 1. `components/onboarding/steps/WhatYouOffer.tsx` replaces the Welcome
>    step content as step 1 (fold the useful Welcome copy in). Multi-select:
>    Cars and vans, Trucks, Machinery, Driving (you or your drivers).
>    Garages, parts and car sales listed below, not selectable. 44px+
>    targets, selection shown by more than colour.
> 2. The choice is **derived, never stored**: on load, from the draft's
>    vehicle categories and `drivers_only`; on first visit, pre-selected
>    from `?offer=` (kept in `sessionStorage` by UI4's `CreateAccount`).
>    Only Driving -> `drivers_only: true` through the existing PATCH.
> 3. Effects: only Driving -> step 3 is a short "Drivers" step, vehicle
>    documents skipped in `Documents.tsx`, and after submit the merchant
>    lands on `/drivers/new`. Trucks or Machinery -> the vehicle form
>    opens on that category with its fields; step label "Trucks" when
>    every vehicle is a truck. Earnings example and "Have these ready"
>    use the chosen units. Remove the drivers-only toggle at
>    `Vehicles.tsx:156`.
> 4. `Onboarding.tsx` step list and labels follow the choice.
>
> **Don't touch:** portal nav and dashboard (UI6), the landing (UI4), the
> API (if the existing PATCH can't express it, stop and report rather
> than adding an endpoint).
>
> **Acceptance.** On dev, sign up and submit three times: an individual
> car owner, a company truck owner, a driver-only merchant. Each reaches
> "submitted"; driver-only lands on `/drivers/new` and never sees a
> vehicle step; leaving and returning shows the same choice. No em
> dashes, no percentage. `scrollWidth <= 375` on every step. Link check
> reports nothing new.
>
> **Finish:** README "Finish" steps; update `merchant-portal.md` with the
> new step 1. Commit message:
> "Start merchant onboarding with what the merchant offers".
