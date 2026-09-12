# Deploy readiness (not deployed yet)

This is a checklist, not an action — nothing here has been done. Both
Railway and Render can host this shape (one Node service + managed Postgres
+ managed Redis) with comparable effort; Railway's multi-service-per-project
model maps a little more directly onto four independent app builds
(api/customer/merchant/admin), Render's free-tier Postgres is more
restrictive for anything beyond a demo. Either works — this list applies to
both.

## What's needed before a first deploy

1. **Managed Postgres + Redis** — provision on the chosen platform, get a
   `DATABASE_URL` / `REDIS_URL`, run `npm run migrate` against it once.
2. **`apps/api` as a service** — build command `npm run build -w apps/api`,
   start command `npm run start -w apps/api` (needs `npm run build` to have
   produced `dist/` first — see note below on workspace builds). Env vars:
   everything in `.env.example`. `EMAIL_ADAPTER=smtp` with the
   `SMTP_HOST`/`PORT`/`USER`/`PASSWORD`/`FROM` set — `SMTP_PASSWORD` goes in
   the platform's secret manager, never in a committed file. `SMS_ADAPTER`
   is still `console` until a real provider is chosen (spec §28 marks this
   as a real decision, not a default to ship with); note that with SMS on
   console, opt-in 2FA challenges cannot be delivered, so 2FA must stay off
   until an SMS provider is wired.
3. **Three static sites** for `apps/customer`, `apps/merchant`,
   `apps/admin` — build command `npm run build -w apps/<name>`, publish
   directory `apps/<name>/dist`, with `VITE_API_URL` pointed at the
   deployed API's URL.
4. **CORS** — wired. `apps/api` mounts `cors` scoped to `CORS_ORIGINS` (a
   comma-separated list), defaulting to the three local Vite ports. Set it
   to the deployed app origins; a wrong value here is the failure that looks
   like "the portal loads but every request fails". **Setting `CORS_ORIGINS`
   at all replaces the built-in default outright** — a value that omits the
   customer origin fails every customer-app fetch with no
   `Access-Control-Allow-Origin` header. Hit this in local dev on
   2026-09-10; the fix there was adding `:5173` to `.env`.
4a. **`/sitemap.xml`** — `apps/customer/public/robots.txt` points crawlers
   at `https://cral.co.ke/sitemap.xml`, but that route lives on `apps/api`
   (`GET /sitemap.xml`, real URLs from the live catalog, not a static
   file). The customer static site needs an edge rewrite so a request for
   `/sitemap.xml` on the customer origin reaches the API instead of 404ing
   on the static build. Set `CUSTOMER_SITE_URL` if staging's customer host
   isn't the production one — every URL in the sitemap is built from it.
5. **Secrets** — `JWT_ACCESS_SECRET` and `SMTP_PASSWORD` are the live ones
   today; store them in the platform's secret manager, never in a file the
   repo tracks. `.env` holds them locally and is gitignored.
   `npm run smtp:check -w apps/api` proves the mail credentials from
   whatever environment you run it in.
   **The API refuses to boot** when `NODE_ENV=production` and
   `JWT_ACCESS_SECRET` is still the `.env.example` placeholder or is under
   32 characters. Generate one with `openssl rand -base64 48`.
6. **Proxy hops** — `app.set("trust proxy", 1)` assumes exactly one proxy
   between the internet and the app, which is what Railway and Render each
   put there. If anything else is added in front (a CDN, a second load
   balancer), raise that number to match, or `req.ip` goes back to being the
   same address for every visitor and every IP-keyed rate-limit bucket
   silently becomes one global bucket.
6. **CI gate** — `.github/workflows/ci.yml` already runs lint/typecheck/test
   against real Postgres+Redis service containers; wire a deploy step (or
   the platform's own git-push-to-deploy) only once staging is intentionally
   being stood up.
7. **Daraja (M-Pesa) production credentials** — apply for these now,
   independent of any deploy step; the delivery plan calls this out as the
   longest lead time in the whole build and it blocks nothing else.

## Note on workspace builds

`npm run build` at the root runs `build --workspaces --if-present`, which
builds every workspace that has a build script. `packages/types` and
`packages/ui` don't have one — they're consumed as TS source directly via
each consumer's own bundler (Vite's esbuild transform for the three
frontend apps; a dedicated esbuild bundle step for `apps/api`, see below) —
so only `apps/api` and the three frontend apps produce `dist/` output.

`apps/api`'s build (`apps/api/esbuild.config.mjs`) specifically bundles
`@cral/types` into `dist/server.js` rather than leaving it as a plain
`node_modules` import, because `@cral/types` has no build step of its own —
plain `node dist/server.js` would otherwise try to resolve
`@cral/types`'s `.ts` source at runtime and fail. Real third-party
dependencies (express, pg, knex, ...) stay external/unbundled. If
`packages/types` ever needs to be consumed from somewhere that *can't*
bundle it this way, give it a real build step at that point rather than
before it's needed.

## Not decided yet

City/region, custom domain + DNS, whether staging and production share a
platform account, log/alerting destination (delivery plan Phase 12 —
deliberately deferred).
