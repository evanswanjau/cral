# UI rebuild - build prompts (Phase 2B)

Written 2026-11-18 from the approved
[`docs/plans/ui-services-proposal.md`](../../plans/ui-services-proposal.md).
One prompt = one PR = one fresh session. Paste the prompt file's block into
a new session with the model named below. Build in this order; each PR
leaves the site working, and the next one assumes the previous is merged
into `develop`.

| # | Prompt | What | Size | Model | Shows up on |
|---|--------|------|------|-------|-------------|
| 1 | [UI0](./UI0.md) | Link fixes that need no new page, and `scripts/check-links.mjs` (report mode) | S | Sonnet | Vercel + dev merchant |
| 2 | [UI1a](./UI1a.md) | Service registry, `components/subsite/*`, route table out of `App.tsx`, masthead/footer/account menu from the registry | M | Opus | Vercel |
| 3 | [UI1b](./UI1b.md) | Front door at `/`, `/cars` landing, coming services block, `/services` and `/parts` redirects | M | Opus | Vercel |
| 4 | [UI1c](./UI1c.md) | `/cars/search`, `/cars/:id/book`, `/browse` and `/book/:id` redirects | M | Sonnet | Vercel |
| 5 | [UI2a](./UI2a.md) | Trucks sub-site and the route-first request flow | M | Opus | Vercel |
| 6 | [UI2b](./UI2b.md) | Machinery sub-site, sitemap paths | S | Sonnet | Vercel + dev API |
| 7 | [UI3](./UI3.md) | Drivers landing (public profiles), public towing page | M | Opus | Vercel + dev API |
| 8 | [UI4](./UI4.md) | Merchant "Earn with CRAL" landing and `/join/:type` pages | M | Sonnet | dev merchant |
| 9 | [UI5](./UI5.md) | Onboarding step 1 "What do you offer?" | M | Opus | dev merchant |
| 10 | [UI6](./UI6.md) | Portal nav and dashboard by offering | S | Sonnet | dev merchant |
| 11 | [UI7](./UI7.md) | Copy sweep, strict link check in the gate | M | Sonnet | Vercel + dev merchant |

Vercel = `app-cral.vercel.app`, deploys `develop` by itself. Dev merchant
and dev API deploy `develop` from the VPS by themselves. Production
(`cral.co.ke`) moves only when the owner says "ship phase 2", after UI7.

**Model rule** (`docs/decisions/deploy.md`): Opus for design-heavy PRs and
anything the rest builds on; Sonnet for mechanical PRs against a written
spec. If a Sonnet PR comes out weak, the owner reruns it on Opus. The owner
looks at each PR on Vercel or dev merchant before starting the next.

## Owner decisions (2026-11-18, all as recommended)

1. Front door is **doors only**; the car search lives on `/cars`.
2. Services not live yet appear **once**, in "Coming to CRAL" on the front
   door. `/parts` and `/services` redirect to `/#coming`.
3. **Machinery has its own sub-site** at `/machinery` and `/join/machinery`.
4. **No colour per service.** Photo, icon and kicker tell them apart.
5. No owner photos yet: **Unsplash placeholders**, credited in a
   `CREDITS.txt` next to them, named so a real photo can replace the file
   by keeping its name (the pattern in
   `apps/merchant/public/images/landing/`). Each build report lists the
   placeholders it added.

## Rules every build follows

Each prompt says "read the README rules". These are they.

1. **Scope.** Build only what your prompt lists. Don't touch files owned by
   a later prompt, the API (except where your prompt says), payments,
   migrations or `CLAUDE.md`.
2. **No page file over ~400 lines.** Compose from `components/site/` or
   `components/subsite/`. `Booking.tsx`, `TripDetail.tsx`, `CarDetail.tsx`
   and `Browse.tsx` are already over: never grow them; extract the part you
   touch into a component.
3. **No new endpoints, no migrations.** Reuse existing API calls.
4. **Brand.** Tokens from `packages/ui/src/tokens.ts` only, no new hex.
   Archivo for display, Instrument Sans for UI, IBM Plex Mono for
   identifiers. One skewed rule per surface. Status never by colour alone.
   Phosphor icons, never emojis. No Google Fonts CDN. Read
   `docs/decisions/design.md` before the first screen. Reuse canvas copy
   where the proposal quotes it (`doors`, `trustCols`, `vertDefs`). No
   canvas exists for the new sub-site screens: say so in each new page's
   header comment ("Not from a canvas; built from tokens.ts and
   docs/plans/ui-services-proposal.md section N").
5. **Mobile first.** 375px with no horizontal page scroll, tap targets at
   least 44px, then desktop at 1280px.
6. **Merchant surfaces:** no em dashes; never the commission percentage
   (take-home "after CRAL's service fee" only); never the hirer's deposit.
7. **Never fabricate a trust signal.** No badge, count, rating or "verified"
   that real data doesn't back.
8. **Copy** is final and written out, in CRAL's voice: plain, short,
   Kenyan English, shillings as `KES`. No placeholders, no lorem.
9. **Links.** Run `node scripts/check-links.mjs` (from UI0 on) before
   handing off; it must report no new broken link.
10. **Checks.** Verify fonts and colours with `getComputedStyle` in the
    running app, not screenshots. Don't run `tsc`, `eslint`, tests or the
    build yourself: `shipper` does.

## Finish (every prompt)

1. Tick your row in the Phase 2 table of `docs/plans/verticals-roadmap.md`
   (`built`, with the PR number once known) and update a decisions file if
   your prompt changes a decision.
2. Hand off to the `shipper` agent **in the background** with the branch
   (`feature/<id>-<name>` off `develop`), the commit message and the PR
   summary. No AI attribution in either (no `Co-Authored-By`, no
   "Generated with" line).
3. On `GATE FAILED`, fix only the returned lines and hand off again.
4. Report to the owner in 15 lines or fewer: PR link, what changed on
   screen, where to see it (Vercel or dev merchant URL and path),
   placeholders added, anything left undone.
