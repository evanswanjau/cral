# UI0 - Link fixes that need no new page, and the link checker

Model: **Sonnet**. Size: S. Branch: `feature/ui0-link-fixes`.

> You are building PR UI0 of CRAL's Phase 2 UI rebuild. Read
> `docs/prompts/ui-rebuild/README.md` (rules and finish steps) first.
>
> **Goal.** Fix the broken and wrong links whose right target already
> exists today, and add a script that checks every link against the
> router so later PRs can't break one unseen. On screen: dead "terms"
> links on merchant sign-up work, a few mislabelled buttons say what they
> do, and two duplicate "Hire a driver" banners are gone.
>
> **Read only:** `docs/plans/ui-services-proposal.md` section 1 rows named
> below (search the ID), `apps/customer/src/App.tsx`,
> `apps/merchant/src/App.tsx`, and the files you change.
>
> **Build.**
>
> 1. `scripts/check-links.mjs` (Node, no new dependency). For each of
>    `apps/customer/src` and `apps/merchant/src`: collect route paths from
>    every `path="..."` / `path: '...'` literal in the app's route files
>    (today `App.tsx`; UI1a moves customer routes to `routes.tsx`, so read
>    both if present), then every link literal in `.tsx` files: `to="..."`,
>    `to={'...'}`, `` to={`...`} `` (template parts become `:param`),
>    `navigate('...')`, `href="..."`. A link is OK if it matches a route
>    pattern (treat `:id` and `*` as wildcards, ignore `?query` and
>    `#hash`), or is `mailto:`, `tel:`, `https://`, `wa.me`, or a `#hash`
>    on the same page. Report `file:line link reason` for the rest, and
>    every `href="#"`. Default mode prints and exits 0; `--strict` exits 1
>    on any finding (UI7 wires strict into the gate; don't do it now).
>    Add `"check:links": "node scripts/check-links.mjs"` to the root
>    `package.json`.
> 2. Fix these rows (IDs from proposal section 1):
>    - **C3** `CarDetail.tsx:480`: plain `<a href="/how-we-protect-you">`
>      becomes `<Link>`. Don't grow the file.
>    - **K3/K4** `Booking.tsx:733-737` and **U9/U10**
>      `CreateAccount.tsx:162-166` (customer): two links to `/legal`
>      become one, "terms and privacy notice".
>    - **R3** `TripDetail.tsx:895`: "Manage this booking" -> "All my
>      bookings" (it lands on the list).
>    - **B1** `Browse.tsx:430` and **T2** `Trips.tsx:129`: remove the
>      `HireDriverBanner` use. Leave the component and its Home use (UI1b).
>    - **MA7/MA8** merchant `CreateAccount.tsx:197,201` and **MO1/MO2**
>      merchant onboarding `Review.tsx:232-233`: dead `href="#"`. Point
>      both at the customer site's `/legal` (merchant terms don't exist
>      yet). Find how the merchant app already builds a customer-site URL
>      (grep `cral.co.ke` and `VITE_` in `apps/merchant/src`) and reuse
>      it; don't hardcode production if a constant exists. Open in a new
>      tab. Label "Read the terms" / "Privacy notice" unchanged.
>    - **P18** merchant `Notifications.tsx:234`: `/settings/notifications`
>      -> `/settings?tab=notifications`. Keep the old redirect route.
> 3. Run `node scripts/check-links.mjs`. Paste its summary (count per
>    app) into the PR summary as the baseline. Fix nothing else it finds:
>    later prompts own those.
>
> **Don't touch:** `Masthead.tsx`, `Footer.tsx`, `AccountMenu.tsx`,
> `Home.tsx`, `Landing.tsx`, `DriverBook.tsx` (D4 is UI3), the API.
>
> **Acceptance.** `node scripts/check-links.mjs` runs on both apps and
> lists no `href="#"`; the four merchant terms links open the customer
> `/legal`; booking a car still reaches the payment step; no banner on
> `/browse` or `/bookings`.
>
> **Finish:** README "Finish" steps. Commit message:
> "Fix dead and mislabelled links; add a link checker".
