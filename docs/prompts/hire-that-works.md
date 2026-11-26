# Hire that works - check, plan, build

Owner's brief (2026-11-26):

1. A **Hire** section on the home page that brings cars, trucks and
   machinery together.
2. Clicking any of the three opens a page already filtered to it: **cars
   on hire**, **trucks on hire**, **machinery on hire**.
3. The whole thing must actually work, for all three: a merchant signs up
   and onboards, Ops approves, a customer hires.
4. At least **100 vehicles with photos** in the local database and in the
   `develop` database (`cral_dev`, behind `dev.api.cral.co.ke`).

This takes over from Session 2 of `docs/prompts/product-review.md` for now.
The findings in `docs/review/01-what-is-wrong.md` that touch hiring are an
input here; the rest of that review waits.

## How to run it

- Every session: fresh, **Opus 5.5, medium effort**, on `develop`.
- **Session 1** checks what works today and writes the plan. It builds
  nothing. Read the plan, answer its questions.
- **Build sessions** then take one PR each from the plan, using the build
  block at the bottom with the PR's ID filled in.
- **The last session** proves it: walks every job for every vehicle type
  and reports what passed.

---

## Session 1 - Check and plan

> You are a senior software engineer and business analyst working on CRAL
> (Cruz Ride Auto), a Kenyan marketplace with three web apps
> (`apps/customer`, `apps/merchant`, `apps/admin`) over one API
> (`apps/api`). The owner wants one thing made solid before anything else:
> **hiring a car, a truck or a machine, from listing to booking, across all
> three apps.** The brief is at the top of `docs/prompts/hire-that-works.md`;
> read it.
>
> **This session writes a plan and no application code.** No changes under
> `apps/`, `packages/` or `openapi/`. Output:
> `docs/plans/hire-that-works.md`.
>
> **Read first:** `docs/plans/verticals-roadmap.md` (phase table only),
> `docs/decisions/customer-portal.md`, `docs/decisions/trucks.md`,
> `docs/decisions/merchant-portal.md`, `docs/decisions/admin-ops.md`, and
> in `docs/review/01-what-is-wrong.md` only the re-check table and the
> findings about booking, onboarding and Ops. A document saying something
> works is a claim. Check the code and the running app.
>
> **Run it safely.** Start Postgres and Redis
> (`docker compose -f infra/docker-compose.yml up -d`) and the four dev
> servers. Start the API with `EMAIL_ADAPTER`, `SMS_ADAPTER`,
> `PAYMENT_ADAPTER` and `DISBURSEMENT_ADAPTER` set to `console` and
> `STORAGE_ADAPTER=local`, so nothing real is sent, charged or uploaded.
> The repo `.env` points SMS at the real provider; do not start the API
> without overriding it. For Ops, create your own local admin with
> `npm run admin:create -w apps/api` and read the sign-in code from the API
> log. Never use a password saved in the owner's browser.
>
> **Part 1 - What works today.** Walk each job below in the browser, at
> 375px and 1280px, once for a **car**, once for a **truck**, once for a
> **machine**. Nine walks in all.
>
> - **Merchant:** sign up, onboard, add the vehicle with photos and
>   documents, submit.
> - **Ops:** approve the merchant, review the vehicle, approve it, see it
>   go live.
> - **Customer:** find it from the home page, open it, request it, get
>   accepted (or quoted, for a truck), pay (console rail), reach the trip
>   page; then the merchant hands over and takes it back.
>
> Record one table: job, vehicle type, step, result (works / works with
> help / broken / not built), evidence (`file:line`, route or screenshot),
> and the smallest fix. Be exact about the differences between the three
> types: what a truck needs that a car does not (type, payload, route,
> load, quote), and what machinery needs (hourly hire is switched off in
> the API; say what a customer hiring an excavator can and cannot do
> today).
>
> **Part 2 - The Hire section and the three pages.** Find what `develop`
> has now: the home page, the masthead's service tabs, and the routes and
> components for cars, trucks and machinery
> (`apps/customer/src/routes.tsx`, `pages/Home.tsx`, `pages/Browse.tsx`,
> `pages/{cars,trucks,machinery}/`, `components/{subsite,cars,trucks,machinery}/`).
> Then propose, with text wireframes at 375px and 1280px:
>
> - the **Hire section** on the home page: three doors (Cars, Trucks,
>   Machinery), each with a real photo, a live count from the catalog and
>   a "from KES x" price, and where it sits among the other services;
> - the **three listing pages**: titled "Cars on hire", "Trucks on hire",
>   "Machinery on hire", already filtered, with a switch between the three
>   at the top, the filters each type needs (cars: county, dates, gearbox,
>   seats, driver; trucks: truck type, payload, route; machinery: type,
>   county), sort, paging, and designed loading, empty and error states;
> - what each **card** shows per type, so a truck card does not read like
>   a car card;
> - what happens to the masthead: today Cars, Trucks and Machinery are
>   three tabs beside Drivers, Towing, Garage and Parts. Say whether they
>   become one "Hire" entry, with your recommendation;
> - every URL that changes, with its redirect. Links in sent emails and
>   SMS must keep working.
>
> Reuse what exists. Add no endpoint unless the catalog cannot already
> filter by type; if it cannot, name the contract change.
>
> **Part 3 - 100 vehicles with photos.** Plan a seed script,
> `npm run seed:hire -w apps/api`, and write its rules into the plan:
>
> - **Mix:** about 60 cars (sedan, SUV, van), 25 trucks across the truck
>   types with payloads, 15 machines. Real makes and models hired in Kenya,
>   plausible KES rates, spread across at least 8 counties, owned by about
>   12 seeded merchants (individuals and companies), all approved, all
>   vehicles live with accepted documents, so the three listing pages and
>   their filters have something real to show. Trucks include per-day,
>   per-trip and quote-first listings.
> - **Photos:** real photographs that match the make and type, at least 3
>   per vehicle, stored through the storage adapter (local disk on a
>   laptop, the B2 bucket on dev), never hot-linked. Propose where they
>   come from and what licence covers them (owner-supplied folder, or a
>   free-licence source downloaded once and credited), how many distinct
>   images are needed if some are reused, the size limit per image, and
>   whether they live in the repo under
>   `apps/api/src/scripts/seed-assets/vehicles` or are fetched at seed
>   time. This is a question for the owner; do not download anything in
>   this session.
> - **Safety:** the script refuses to run when `NODE_ENV=production` or
>   when the database is the production one. Seeded merchants and renters
>   are recognisable (one email domain), have **no real phone number and
>   no verified phone**, so the dev server can never text a stranger. It is
>   re-runnable without duplicates, and `--clear` removes exactly what it
>   created and nothing else. Plates must be unique and obviously fake.
> - **Dev database:** how it runs on the VPS against `cral_dev`
>   (`/srv/cral-dev`), and how the photos get into the dev bucket. Nothing
>   is run on the server without the owner saying so.
>
> **Part 4 - The PR list.** Split the work into PRs, one fresh session
> each, each leaving `develop` working. Expected shape, change it if Part 1
> says otherwise:
>
> - **H1** seed script and assets, run locally;
> - **H2** Hire section on the home page and the three listing pages,
>   with redirects;
> - **H3...** one PR per group of broken steps from Part 1 (merchant
>   onboarding, Ops approval, customer booking), blockers first;
> - **last** an end-to-end check: a script or a written walk under
>   `tools/` that runs the nine walks and can be repeated before every
>   release.
>
> For each PR: goal in two sentences, files touched, what is deleted, how
> we will know it worked, size (S/M/L), and what the owner checks on
> `app-cral.vercel.app` afterwards.
>
> **Write the plan like this.** First, one screen for the owner: what
> works today in a 3-by-3 grid (job by vehicle type), what the client will
> see when this is done, how many PRs. Then Parts 1 to 4. Plain language.
>
> **Then stop.** Save the plan, do not commit. Finish with at most five
> decisions you need from the owner, each with your recommendation; the
> photo source and the masthead change must be among them. Final message
> under 20 lines.

---

## Build sessions - one per PR

> Build PR **{ID}** from `docs/plans/hire-that-works.md` and nothing else.
> Read that PR's section, the owner's decisions recorded at the top of the
> plan, and only the files it names.
>
> - Branch off `origin/develop` as `feature/hire-{name}`. Contract first if
>   the PR adds or changes an endpoint.
> - No page file over about 400 lines; compose from
>   `apps/customer/src/components/`. Colours, type and spacing from
>   `packages/ui/src/tokens.ts`, never a new hex. Phosphor icons, no
>   emojis. Works at 375px with no sideways scroll and 44px touch targets.
> - Run the app with the console adapters (see Session 1) and walk the
>   steps this PR touches, for a car, a truck and a machine, before you
>   call it done. Say which you walked and what you saw.
> - Don't run the checks yourself. When the code is done, hand off to the
>   `shipper` agent in the background with the branch name, a commit
>   message and a one-paragraph PR summary, with no AI attribution. If it
>   reports failures, fix them and hand off again.
> - Mark the PR built in `docs/plans/hire-that-works.md`.
> - Report in 15 lines or fewer: what changed, the PR link, what the owner
>   should click on dev to see it, anything left open. Do not start the
>   next PR.
>
> **For H1 only:** run the seed on the local database and show the counts
> per type and per county. Do not touch the dev server; print the exact
> commands for the dev run and wait for the owner's go-ahead.

---

## Last session - prove it

> Run the end-to-end check from the last PR of
> `docs/plans/hire-that-works.md` against local, then walk the same nine
> jobs by hand on dev (`app-cral.vercel.app`, the dev merchant and Ops
> apps) with the seeded data. Write `docs/review/hire-proof.md`: the
> 3-by-3 grid again, each cell pass or fail with a screenshot or a booking
> reference, the counts on each listing page, and every failure with its
> `file:line`. Fix nothing in this session. Stop with the grid and, if
> anything failed, the one PR you would do next.
