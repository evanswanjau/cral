# UI7 - Copy sweep and strict link check

Model: **Sonnet**. Size: M. Branch: `feature/ui7-copy-sweep`.
Needs UI6 merged. Last PR of Phase 2; after it the owner decides
"ship phase 2".

> You are building PR UI7 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** No page says "car" where the service isn't a car, the company
> pages explain every service, and the link checker becomes part of the
> gate so a broken link can't merge again.
>
> **Read only:** proposal (`docs/plans/ui-services-proposal.md`) sections
> 1.1 rows F2, G1-G8, T1, U1-U6, 2 (all leakage tables), 6.3;
> `scripts/check-links.mjs`; `tools/gate.mjs`; the files named below.
>
> **Build.**
>
> 1. Rewrite for every live service: `HowItWorks.tsx` (F2, G8 "Pick a
>    service" -> `/`), `HowWeProtectYou.tsx`, `Help.tsx`, `About.tsx`
>    (G1 "Earn with CRAL"). Facts only from how the product works; no
>    claim the code doesn't back.
> 2. `Trips.tsx` T1 empty state "Pick a service" -> `/`;
>    `TripDetail.tsx` leakage lines from section 2 (extract, don't grow).
> 3. `AuthShell.tsx` U1 "Back to the car" -> back to what was being
>    booked (car, truck, driver, tow); U3 "Offering a service on CRAL?";
>    `BrandPanel.tsx` U6 merged.
> 4. Every remaining section-2 leakage line on both apps.
> 5. Footer phone and email become `tel:` / `mailto:` links.
> 6. `scripts/check-links.mjs --strict` passes on both apps; fix what it
>    finds. Add it as a step in `tools/gate.mjs` (before typecheck,
>    quiet on success like the other steps).
>
> **Don't touch:** `Legal.tsx` (stale payment line is the owner's text to
> approve), the API, payments, flows.
>
> **Acceptance.** `node scripts/check-links.mjs --strict` exits 0;
> `grep -rni "\bcar\b"` over customer pages for trucks, machinery,
> drivers and towing, and over merchant copy shown to driver-only or
> truck merchants, shows no car-only wording on a non-car surface. Book a
> car, request a truck, request a tow, merchant sign-up all still work on
> dev.
>
> **Finish:** README "Finish" steps; mark Phase 2 "built, waiting for the
> owner to ship" in the roadmap. Commit message:
> "Sweep car-only copy and make the link check part of the gate".
