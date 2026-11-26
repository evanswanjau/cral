# Buy and sell cars - build prompt

Design, approved by the owner on 2026-11-26:
[`docs/plans/buy-and-sell-cars.md`](../plans/buy-and-sell-cars.md).

## How to run it

- One PR = one fresh session, **Opus 5.5, medium effort**, on `develop`.
- Order: CS3a, CS3b, CS3c, CS3d, CS3e. Start CS3b only after the Hire
  section (`docs/plans/hire-that-works.md`, the home page and masthead PR)
  is merged, because both change the home page and the top menu. CS3a can
  run any time after the hire seed has settled the photo source.
- Paste the block below with the PR's ID filled in.

## The block

> Build PR **{ID}** from `docs/plans/buy-and-sell-cars.md` and nothing
> else. Read that file in full (it is short), then
> `docs/decisions/car-sales.md`, then only the code the PR touches:
> `apps/api/src/modules/sale-listings/`, `admin-sale-listings/`, the
> `openapi/*-sales.yaml` contracts, and the matching screens.
>
> - Branch off `origin/develop` as `feature/sales-{name}`.
> - **Contract first** for any new or changed endpoint.
> - Every state change is a conditional update with its `audit_log` row in
>   the same transaction. IDs are prefixed ULIDs. Money is integer cents.
>   Paging is by cursor. Any POST that moves money takes an
>   `Idempotency-Key`.
> - Public reads return only `live` listings, and never the logbook, the
>   seller's phone or the seller's surname before a viewing is confirmed.
> - Nothing on any page says "verified" or "inspected". Nothing suggests
>   paying to hold a car. The fee is always a shilling amount, never a
>   percentage.
> - No page file over about 400 lines; compose from
>   `apps/customer/src/components/subsite/`. Colours, type and spacing
>   from `packages/ui/src/tokens.ts`. Phosphor icons, no emojis. Works at
>   375px with no sideways scroll and 44px touch targets. Designed
>   loading, empty and error states.
> - Run the app with `EMAIL_ADAPTER`, `SMS_ADAPTER`, `PAYMENT_ADAPTER` and
>   `DISBURSEMENT_ADAPTER` set to `console` and `STORAGE_ADAPTER=local`
>   (the repo `.env` points SMS at the real provider), and walk what this
>   PR adds as a buyer, as a seller and in Ops before calling it done. Say
>   what you walked and what you saw.
> - Write API tests for every new rule in the design (who can see a phone
>   number and when, one open request per buyer per car, either "yes"
>   records the sale, the unpaid lock, the frozen fee amount).
> - Don't run the checks yourself. Hand off to the `shipper` agent in the
>   background with the branch name, a commit message and a one-paragraph
>   PR summary, with no AI attribution. Fix what it reports and hand off
>   again.
> - Mark the PR built in `docs/plans/buy-and-sell-cars.md` and in the
>   roadmap's Phase 6 table, and update `docs/decisions/car-sales.md`.
> - Report in 15 lines or fewer: what changed, the PR link, what the owner
>   should click on dev, anything left open. Do not start the next PR.
>
> **CS3a only:** follow the seed rules in the design and the photo source
> the owner chose for the hire seed. Run it on the local database and show
> counts by state, county and price band. Do not touch the dev server:
> print the exact commands for the dev run and wait for the owner.
>
> **CS3e only:** ship the fee bands as a setting with placeholder amounts
> marked "not agreed". With no real bands set, no invoice is raised.
> Replace the "no commission on a sale" decision in
> `docs/decisions/car-sales.md` and every line of page copy that says so.
