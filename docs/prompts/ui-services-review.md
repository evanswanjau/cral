# UI services review - prompt for Phase 2A

Owner's brief (2026-11-18): today the website and the merchant portal read
as a car-hire product. The client wants **each service to feel like its own
sub-site** - hire cars, trucks, drivers, towing, and later garage services,
parts and buy-and-sell - while staying inside the CRAL brand. Onboarding
must be easy, and the many links that go nowhere useful must go. An earlier
attempt in another tool (commit `6bcae2f`, reverted in PR #77/#78) rewrote
`Home.tsx` and the merchant `Landing.tsx` as two ~1,700-line files without a
plan. This review exists so that doesn't happen again.

The work runs in two stages, in **two separate sessions**, with the owner's
approval in between.

---

## Stage A - review and proposal (paste into a fresh **Opus** session)

> You are reviewing the CRAL web UI before a rebuild. **Write no
> application code in this session.** Your output is one proposal document
> and nothing else. Stop at the end and ask the owner to approve it.
>
> **Read first, in this order:**
> 1. `docs/plans/verticals-roadmap.md` - "What we're building" and Phase 2.
>    Phases 4-6 tell you which services are coming and how each works.
> 2. `CLAUDE.md` - the "Design tokens" section and "What NOT to do" (or
>    `docs/decisions/design.md` if Phase 0 has moved it). These rules are
>    binding: tokens from `packages/ui/src/tokens.ts`; three fonts with one
>    job each (Archivo display, Instrument Sans UI, IBM Plex Mono for
>    identifiers); status is never colour alone; the 14 degree skew is
>    for "boosted" and the masthead rule only, once per surface; no emojis
>    (Phosphor icons); no em dashes in the merchant portal; never build from
>    a screenshot of the canvas.
> 3. `docs/brand/CRAL-Brand-Strategy-and-Design-System-v2.pdf` - brand
>    voice, colour roles, photography direction. Read the pages on
>    positioning and the vertical ("doors") system closely.
> 4. `docs/brand/canvas/Cruz Ride Auto - Website.dc.html` and its
>    `README.md` - the website canvas. It already has a `vertDefs` object
>    and a "doors" hero with modes per vertical. Find what it intended for
>    each service before inventing anything.
> 5. The code: `apps/customer/src/App.tsx` (routes),
>    `components/site/{Masthead,Footer,AccountMenu,VerticalPage}.tsx`,
>    `pages/{Home,Browse,CarDetail,Booking,Drivers,Towing,Services,Parts}.tsx`;
>    `apps/merchant/src/App.tsx`, `pages/Landing.tsx`, the sign-up and
>    onboarding steps under `components/onboarding/`, and the portal
>    `SideNav`.
>
> **Do these, in order, and write each into the proposal:**
>
> 1. **Link inventory.** A table of every link and button that navigates,
>    on every customer page and on the merchant landing, sign-up and portal
>    shell: where it appears, its label, its destination, and a verdict -
>    *keep*, *merge* (name the twin), *fix* (it lands somewhere wrong or
>    empty) or *cut* (it goes nowhere useful). Count them at the end. Be
>    exhaustive; this table is what makes "so many useless links" fixable.
> 2. **Car-hire leakage.** List every place a non-car service is described
>    in car-hire words: copy ("Find a car", "your car", "hire days"), flows
>    (booking steps that assume a car, date pickers where a truck needs a
>    route), page furniture (car photos on a towing page), and the merchant
>    side (onboarding that assumes a vehicle, a portal whose first item is
>    "Vehicles" for a driver-only merchant). File and line for each.
> 3. **Service map.** For each service - hire cars, trucks, machinery,
>    drivers, towing, garage (coming), parts (coming), buy and sell
>    (coming) - one row: what a customer comes to do, what the supplier
>    does, how money moves, what exists in code today, which canvas section
>    covers it, and whether it is live.
> 4. **Proposed structure.** A sitemap (as an indented list or a mermaid
>    diagram) with:
>    - a **front door** (home) whose only job is "which service do you
>      need", plus trust and how-CRAL-works-for-everything;
>    - one **sub-site per service** under its own path (propose the paths;
>      today's are `/browse`, `/cars/:id`, `/drivers`, `/services/towing`,
>      `/services`, `/parts`), each with its own hero, how-it-works, price
>      explanation, request flow and FAQ;
>    - a **shared sub-site shell** that makes them all feel like CRAL: what
>      stays constant (masthead, footer, tokens, type, trust strip) and
>      what each service owns (headline, photography, icon, kicker, a
>      service accent if the tokens allow one - name the token, never a new
>      hex);
>    - how services that aren't live yet appear: once, honestly, never as a
>      dead link or an "opening soon" page dressed as a product;
>    - the **merchant side**: a landing that speaks to each supplier type
>      (car owner, truck/fleet owner, driver, garage, parts dealer, seller),
>      a "what do you offer?" step at sign-up that shapes onboarding, and a
>      portal nav that shows sections per offering.
> 5. **Wireframes.** Low-fidelity, in text (ASCII boxes or annotated
>    lists) for: the front door, one sub-site landing (trucks), one
>    request flow (trucks: route -> quote -> pay), the merchant landing,
>    the "what do you offer?" step, and the portal nav for a driver-only
>    merchant and a truck owner. Mobile first (375px), then desktop.
> 6. **Redirects and risk.** Every URL that changes, with its redirect.
>    Links in already-sent emails, SMS and notifications must keep working.
>    Both customer deployments (`cral.co.ke` on the VPS and
>    `app-cral.vercel.app`) serve the same build. SEO titles, `useSeo`,
>    the sitemap route (`apps/api` `sitemap.test.ts`).
> 7. **Build plan.** Split the rebuild into PRs that each ship on their
>    own and leave the site working: expected shape - (a) shared shell +
>    front door, (b) one PR per live service sub-site, (c) merchant landing
>    + "what do you offer", (d) portal nav by offering, (e) link cleanup +
>    redirects. For each PR: files touched, new components, what is
>    deleted, acceptance checks, size (S/M/L), and which model should build
>    it (Opus for the shell and merchant onboarding, Sonnet for pages that
>    follow an approved shell).
> 8. **Rules for the builders,** which the Stage B prompts will repeat:
>    no page file over ~400 lines (compose from components in
>    `components/site/` or a new `components/subsite/`); reuse existing
>    API calls, add no endpoints unless the plan names one; every link
>    checked by a test or a script that walks the router; verify styles
>    with `getComputedStyle`, not screenshots; mobile at 375px; no em
>    dashes on merchant surfaces; never show the commission percentage to
>    a merchant.
>
> **Write it all to `docs/plans/ui-services-proposal.md`.** Lead with a
> one-screen summary the owner can read in two minutes (what changes,
> what the client will see, how many PRs). Put the inventory tables
> after. Then commit it on a branch `docs/ui-services-proposal`, open a
> PR to `develop`, **do not merge**, and stop with: the PR link, the
> summary, and the decisions you need from the owner (at most five,
> each with your recommendation).

---

## Stage B - turn the approved proposal into build prompts (fresh **Opus** session, after approval)

> Read `docs/plans/ui-services-proposal.md` (approved by the owner) and the
> owner's comments on its PR. Apply the owner's decisions to the proposal
> first and note them in its header. Then, for each PR in its build plan,
> write one self-contained build prompt to
> `docs/prompts/ui-rebuild/<ID>.md` (`UI1.md`, `UI2.md`, ...). Each prompt
> must let a fresh session build that PR without reading this
> conversation or the whole proposal. Each one contains:
>
> - **Goal** in two sentences, and what the client will see.
> - **Read only:** the exact files and proposal sections needed.
> - **Build:** components to create, files to change, files and links to
>   delete, routes and redirects, copy (written out, final, in the brand
>   voice - no placeholders), icons, photography slots.
> - **Don't touch:** files owned by other UI PRs, the API, payments.
> - **Acceptance checks:** the link walk passes; named elements' computed
>   font family, size and colour (exact token values); 375px layout has
>   no horizontal scroll; the specific flows that must still work
>   (book a car, request a truck, request a tow, merchant sign-up).
> - **Model:** Opus or Sonnet, per the proposal.
> - **Finish:** `npm run gate` once, PR to `develop`, merge, report in 15
>   lines or fewer, update the roadmap's Phase 2 table.
>
> Also add a `docs/prompts/ui-rebuild/README.md` listing the prompts in
> build order with one line each. Update `docs/plans/verticals-roadmap.md`
> Phase 2's table to list the real PR IDs. Commit on
> `docs/ui-rebuild-prompts`, PR to `develop`, merge, and stop with the list.

---

## Why two stages

The review is where judgement matters and mistakes are cheap: it reads a
lot, writes a document, and changes nothing. The owner approves the
direction once. After that each build session reads one short prompt and a
handful of files, which is both cheaper and much harder to get wrong than
one session redesigning two portals from scratch.
