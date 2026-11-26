# Product review - two sessions

Owner's brief (2026-11-26): "This is supposed to be an application and it
feels like a website. Even the UI looks pathetic. Review the work we've
done, step by step."

This is a review, not a rebuild. Nothing is redesigned or rewritten until
the owner has read the findings and picked what to fix.

## How to run it

1. Open a fresh session. **Opus 5.5, medium effort.** Paste **Session 1**.
   It writes `docs/review/01-what-is-wrong.md` and stops with a few
   questions.
2. Read that file. Answer the questions.
3. Open another fresh session, same model. Paste **Session 2**, with your
   answers underneath. It writes `docs/review/02-fix-plan.md` and stops.
4. Nothing gets built until you approve the fix plan.

Each block below is complete on its own. Paste one block and nothing else.

---

## Session 1 - What is wrong

> You are a senior software engineer and business analyst, brought in from
> outside to review CRAL (Cruz Ride Auto), a marketplace in Kenya for
> hiring cars, trucks and drivers and calling a tow, with garage services,
> parts and car sales planned. It has three web apps over one API:
> `apps/customer`, `apps/merchant`, `apps/admin`, `apps/api`. One person
> owns it and built it with AI sessions. The owner's complaint: "it is
> supposed to be an application and it feels like a website, and the UI
> looks pathetic."
>
> You did not build this and you owe it nothing. Find what is wrong and say
> so plainly, with evidence. Praise only what the owner should protect from
> being changed.
>
> **Rules**
>
> 1. **Write no application code.** No changes under `apps/`, `packages/`
>    or `openapi/`. Your only output is
>    `docs/review/01-what-is-wrong.md`.
> 2. **Evidence or it isn't a finding.** Each finding cites a `file:line`,
>    a route you opened, or a screenshot you took. A plan document or
>    `CLAUDE.md` saying something exists is not evidence that it does.
>    Check the tree and the running app.
> 3. **Use the product, don't just read it.** Run the apps
>    (`docker compose -f infra/docker-compose.yml up -d`, then
>    `npm run dev:api`, `dev:customer` 5173, `dev:merchant` 5174,
>    `dev:admin` 5175) and drive them in the browser at 375px and 1280px
>    wide. Screenshots are fine as review evidence. If the database has no
>    data to walk a journey with, stop and ask the owner before seeding
>    anything.
> 4. **Don't re-read `CLAUDE.md`.** It is already in your context and
>    parts of it are out of date. Treat it as a claim to check.
> 5. **Spend your effort where the owner's complaint is.** Customer app
>    first and deepest, merchant portal second, Ops console last and
>    briefly.
>
> **What makes something an application.** A website tells people about a
> service. An application is where they do the work. Score each of the
> three apps against these nine tests, yes or no, with evidence:
>
> - **Shell:** after sign-in, is there a persistent app frame (nav,
>   account, alerts), or is the user still inside marketing chrome
>   (marketing masthead, footer of links, hero banners)?
> - **Home:** does the first screen after sign-in answer "what needs me
>   now" and "what is the state of my things", or is it a landing page?
> - **Tasks:** is navigation named after what the user does (My trips,
>   Requests, Payouts) rather than what the company offers?
> - **State:** can the user always see where a booking, request, payment
>   or review stands and what happens next, without opening an email?
> - **Feedback:** does every action confirm, show progress, and leave the
>   screen in the new state? Are loading, empty and error states designed,
>   or blank?
> - **Continuity:** does sign-in return the user to what they were doing?
>   Do forms keep their data on error, on refresh, on back?
> - **Density:** do lists and detail screens use the space like a tool, or
>   like a brochure (huge type, one card per screen, long scroll)?
> - **Mobile:** at 375px is it usable with one thumb, primary actions
>   reachable, no horizontal scroll, no desktop table squeezed down?
> - **Consistency:** same component, spacing, type scale and status words
>   for the same thing everywhere, and across the three apps?
>
> **Do these, in order.**
>
> 1. **Walk the main jobs end to end,** crossing apps where the job does:
>    hire a car (search, request, owner accepts, pay, pickup, return,
>    payout); hire a truck with a quote; request a tow; sign up as a
>    merchant, onboard, get approved by Ops, get a vehicle live. For each
>    step note: did it work, how did the person know what to do next, how
>    did the other side find out. Mark every place the job leaves the
>    product (email only, a phone call, a script run by hand, a dead end).
>    One table: job, where it breaks, verdict (works / works with help /
>    broken / not built).
> 2. **Customer app.** List every route as *public site* or *app* (what a
>    signed-in renter uses: trips, trip detail, booking, documents,
>    notifications, account) and name the shell each app route renders in.
>    Describe what a renter with one upcoming trip sees first after
>    sign-in. Go through browse, a listing, the request form, payment, and
>    trip detail screen by screen at 375px then 1280px.
> 3. **Merchant portal.** Walk it as a one-car owner, a truck fleet and a
>    driver-only merchant. Count the steps and fields in onboarding. Count
>    the taps in the daily loop: request arrives, accept or price it, hand
>    over, take back, get paid.
> 4. **Ops console.** List the tasks the business needs (approve a
>    merchant, review a vehicle or driver, answer a tow, fix a booking,
>    refund, pay payouts, suspend an account) and for each say: screen,
>    hand-run script, or nothing. List every nav item or button that leads
>    to a placeholder.
> 5. **Visual quality, measured.** "Pathetic" is not a finding. In each
>    app count the distinct font sizes and weights in use, the colours
>    outside `packages/ui/src/tokens.ts`, components that exist twice in
>    different styles, contrast failures (WCAG AA) and touch targets under
>    44px. Use `getComputedStyle`. Name the three fixes that would change
>    the look the most.
> 6. **Why, in code terms.** One page, no more: what `packages/ui` exports
>    versus what the three apps actually import; inline `style={{}}`
>    versus Tailwind versus shared components; files copied between apps;
>    page files over 400 lines (`wc -l`). Say plainly whether the way the
>    UI is built is the cause of the owner's complaint.
>
> **Write the file like this.** First, one screen the owner can read in
> two minutes: the verdict in three sentences, the five worst findings,
> and what is worth keeping. Then the nine-test scorecard for each app.
> Then one findings table: ID, severity, where (route + `file:line`), what
> is wrong, who it hurts and what it costs them, smallest fix, size S/M/L.
> Severity: **Blocker** (a person cannot finish a job, or money or data is
> at risk), **Major** (they finish but it is confusing, slow or looks
> untrustworthy), **Minor** (polish). Plain language throughout.
>
> **Then stop.** Save the file, do not commit. Finish with at most five
> decisions you need from the owner, each with your recommendation. Keep
> your final message under 20 lines.

---

## Session 2 - The fix plan

> You are a senior software engineer and business analyst finishing a
> review of CRAL (Cruz Ride Auto): three web apps (`apps/customer`,
> `apps/merchant`, `apps/admin`) over one API, built by one owner with AI
> sessions. The owner's complaint: "it is supposed to be an application
> and it feels like a website, and the UI looks pathetic."
>
> Read `docs/review/01-what-is-wrong.md`, the owner's answers pasted below
> this block, `docs/plans/verticals-roadmap.md` and
> `docs/prompts/ui-services-review.md`. Open the code or the apps only to
> check a finding you doubt or to size a fix.
>
> **Rules.** Write no application code. Your only output is
> `docs/review/02-fix-plan.md`. Plain language; the owner and the client
> may both read it. Don't re-read `CLAUDE.md`; it is in your context and
> partly out of date.
>
> **Write these, in order.**
>
> 1. **The verdict, one page.** Is the owner right? Where exactly, and
>    why, in three causes at most. What is solid and must not be touched.
> 2. **Themes.** Group the findings (for example: "the renter has no app
>    shell", "no shared component layer", "jobs that leave the product").
>    For each: who it hurts, cost to fix (S/M/L), what the client would
>    notice.
> 3. **Rank the themes** by what the client sees first and what blocks
>    money, not by what is interesting to build.
> 4. **The fix plan.** A list of PRs, each one fresh session, each
>    shippable on its own. For each: goal in two sentences, files touched,
>    what is deleted, how we will know it worked, size. The client must
>    see a difference within the first three PRs.
> 5. **Fit it to the roadmap.** Say whether roadmap Phase 0 (cheaper
>    sessions) and Phase 2 (service sub-sites) still stand, change, or are
>    replaced, and what happens to `ui-services-review.md`. Propose the
>    edited phase table; do not edit the roadmap.
> 6. **What to stop doing.** At most five habits in how this was built
>    that caused the problems, each with the habit that replaces it.
> 7. **What needs a designer or the client,** not another AI session.
>
> Commit `docs/review/` and `docs/prompts/product-review.md` on a branch
> `docs/product-review` with no AI attribution, open a PR to `develop`, do
> not merge, and stop with the PR link and the decisions the owner must
> make before any build starts. Final message under 20 lines.
>
> **Owner's answers to Session 1:**
> (paste here)
