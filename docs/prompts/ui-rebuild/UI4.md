# UI4 - Merchant "Earn with CRAL" landing and supplier pages

Model: **Sonnet**. Size: M. Branch: `feature/ui4-merchant-landing`.
Needs UI3 merged (independent of the customer PRs, but built in order).

> You are building PR UI4 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first, then
> `docs/decisions/merchant-portal.md`.
>
> **Goal.** The merchant site talks to every kind of supplier, not only
> car owners. `/` becomes "Earn with CRAL" with a door per supplier type,
> and each type gets its own page at `/join/cars`, `/join/trucks`,
> `/join/machinery`, `/join/drivers`, ending in sign-up that remembers the
> choice.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.2 rows L1-L24 and MA1-MA8, 2.3, 4.6 (Landing and Supplier pages),
> 5.5; `apps/merchant/src/pages/Landing.tsx`, `BrandPanel.tsx`,
> `CreateAccount.tsx`, `App.tsx`.
>
> **Build.**
>
> 1. `apps/merchant/src/lib/supplier-types.ts`: per type (cars and vans,
>    trucks, machinery, driving) the headline, lede, photo, estimator
>    units (cars: day; trucks: trip, day, km, tonne; machinery: day,
>    trip; driving: day, hour, trip), what you need (vehicles: logbook,
>    insurance, tracker plus ID and KRA PIN; drivers: driving licence, ID,
>    KRA PIN), how requests work, FAQ. Copy final, no em dashes.
> 2. `components/landing/{SupplierDoors,Estimator,DocsNeeded,LandingFaq}.tsx`.
>    `Estimator` shows take-home "after CRAL's service fee" in KES,
>    computed with `COMMISSION_RATE` from `@cral/types`, and never prints
>    the rate or a percentage.
> 3. `pages/join/JoinPage.tsx` at `/join/:type`, outside `RequireAuth`;
>    unknown type -> `/`. CTA -> `/create-account?offer=<type>`.
> 4. `Landing.tsx` cut under ~400 lines composing the above: doors (L2,
>    L11-L15 become doors), coming suppliers (garages, parts dealers, car
>    sellers) with one WhatsApp "tell us you're interested" link, shared
>    how-it-works, payouts, FAQ, final CTA. Cut L10, L16, L17, L20, L23,
>    L24 (WhatsApp CTAs from seven to four). `BrandPanel.tsx` copy for
>    every supplier; MA2 merged.
> 5. `CreateAccount.tsx` reads `?offer=` and keeps it in `sessionStorage`
>    for UI5 to pre-select. No API change.
> 6. Customer side: the `EarnBand` links on `/cars`, `/trucks`,
>    `/machinery`, `/drivers` point at `/join/<type>` (one prop each).
> 7. New photos as Unsplash placeholders in
>    `apps/merchant/public/images/landing/` with `CREDITS.txt` entries.
>
> **Don't touch:** onboarding steps (UI5), portal nav (UI6), the API.
>
> **Acceptance.** Each `/join/*` and `/` at 375px with no horizontal
> scroll; estimator shows a take-home amount; `grep -rn "%\|COMMISSION"`
> over the changed merchant files shows no rate printed to the page; no
> `—` in merchant copy; `/join/trucks` -> sign up -> `?offer=trucks` kept.
> Link check reports nothing new.
>
> **Finish:** README "Finish" steps. Commit message:
> "Turn the merchant landing into Earn with CRAL with a page per supplier".
