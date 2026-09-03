# Merchant app review - frontend, API, database, tests

Full sweep of the merchant stack on `develop` @ `a46053f`, 2026-09-03.

## Status

Group 1 of the suggested order - the **security patch** (#1, #2, #3, #4,
#12, #13, #14) - is **done**, on branch `feature/security-patch`.
Regression tests live in `apps/api/src/__tests__/security.test.ts`, one
block per finding, and CLAUDE.md carries the decisions. Those seven
sections are left in place below as the record of what was wrong and why
the fix looks the way it does; each is marked **FIXED**.

Group 2 - **idempotency correctness** (#5, #6) - is also done, same
branch, tests in `apps/api/src/middleware/__tests__/idempotency.test.ts`.

Groups 3-6 (#7-#11, #15-#20) are still open.

## What's already green

Worth stating plainly, because most of the stack is in good shape and the
list below is deliberately only the problems:

- `npm run typecheck` - clean across all six workspaces.
- `npx eslint . --max-warnings=0` - clean. (`MEMORY.md` still claims six
  lint errors are waiting on CI; that's stale, they're fixed.)
- `npm run test -w apps/api` - **144 tests, 13 files, all passing** in 80s.
  Every backend module has a test file: auth, phone verification, 2FA,
  onboarding, reminders, settings, vehicles, bookings, payouts,
  notifications, dashboard.
- `npm run build -w apps/merchant` - clean.
- Money is integer cents + `char(3)` currency everywhere; no floats. The
  net-to-gross round-trip in `RateField` reconciles exactly against the
  server's `computeBookingPricing`.
- IDs are prefixed ULIDs throughout, no auto-increment PKs.
- Cursor pagination only; no offset paging anywhere.
- Refresh tokens rotate and keep `previous_token_hash` for reuse detection.
- FKs and indexes on `bookings` etc. are well chosen; every migration has a
  real `down()`.
- Zero `TODO`/`FIXME`/`HACK` markers in the entire source tree.

---

## P0 - fix before anything is deployed

### 1. `GET /audit-log` is public and unauthenticated - FIXED

`apps/api/src/routes/health.ts:44` mounts a cursor-paginated dump of the
**entire platform audit log** with no `authenticate()` and no role check.
Verified live against the running dev API:

```
curl http://localhost:4000/audit-log?limit=3    ->  200, real rows
```

It returns `actor_id`, `entity_id`, `ip`, `request_id` and the
`before`/`after` JSONB for every state change on the platform, and
`next_cursor` lets an anonymous caller walk the whole table. Current rows
include `merchant.profile_updated` payloads carrying `company_name` and
`trading_name`, plus a complete activity map of every merchant.

This is Phase-0 scaffolding ("proves the whole Phase 0 pipeline end to
end" - its own docstring) that was never removed, and it now sits in front
of a database of merchant PII.

**Fix:** delete the route. The pipeline it was proving is proven by 144
tests. If an audit reader is wanted later it belongs in the Phase-3 admin
surface behind an `aud: "ops"` token, not on the health router.

### 2. No `trust proxy` - IP rate limits collapse into one global bucket - FIXED

`createApp()` never calls `app.set("trust proxy", ...)`. Behind Railway or
Render (the documented deploy target) `req.ip` is the edge proxy's address,
identical for every visitor. Since `rateLimit` keys on `req.ip` by default,
every IP-keyed bucket becomes **platform-wide**:

| bucket | limit | real-world effect once deployed |
|---|---|---|
| `otp_request` | 5/hour | 5 verification codes an hour, for all users combined |
| `register` | 10/hour | 10 sign-ups an hour, platform-wide |
| `password_reset` | 10/hour | 10 resets an hour, platform-wide |
| `onboarding_upload` | 60/hour | 60 document uploads an hour, platform-wide |

That is a self-inflicted denial of service on the sign-up funnel, and it
simultaneously means the per-IP abuse controls those numbers were chosen
for do not exist. `login` is the one exception - it keys on
`req.body.identifier` first.

**Fix:** `app.set("trust proxy", 1)` in `createApp()` (one hop - the
platform edge). Add a test asserting two different `X-Forwarded-For`
values get independent buckets.

### 3. Idempotency keys are not scoped to the user - FIXED

`idempotency_keys` has `primary(["key", "route"])` and the middleware looks
up `where({ key, route })` with no user dimension. Two merchants who
generate the same `Idempotency-Key` on the same route - a counter, a weak
client-side UUID, a copied cURL - collide, and **the second one is served
the first one's response body verbatim**. On
`POST /merchant/payouts/{id}/queries` or `/bookings/{id}/reports` that is a
cross-tenant data disclosure; on a state-changing POST it silently
swallows the second merchant's action.

**Fix:** add `user_id` to the table and to the PK, and to both the lookup
and the insert. Migration + a test that the same key from two users does
not collide.

### 4. Uploads: no MIME allowlist, and the file is echoed back inline - FIXED

All three multer instances (`merchant`, `vehicles`, `bookings` routes) set
only `limits.fileSize`. There is no `fileFilter`, no magic-byte check, and
the **client-supplied** `req.file.mimetype` is stored as
`documents.content_type` and later replayed by
`GET /merchant/onboarding/documents/:id` as:

```
Content-Type: <whatever the client claimed>
Content-Disposition: inline; ...
```

with no `X-Content-Type-Options: nosniff`. Uploading `evil.html` as
`text/html` yields script execution on the API origin. Impact today is
limited (the API is a separate origin from the merchant app, so portal
tokens aren't reachable), but it is hosted XSS on a `cral.co.ke` host and
becomes serious the moment the API and app share a parent domain.

**Fix:** a shared `fileFilter` allowlist (`image/jpeg`, `image/png`,
`image/webp`, `application/pdf`), validate magic bytes server-side rather
than trusting the header, send `nosniff`, and serve anything that isn't a
PDF or image as `attachment`.

---

## P1 - correctness and reliability

### 5. A failed handler poisons its Idempotency-Key permanently - FIXED

`requireIdempotencyKey` inserts the row with `response_status: null`
*before* the handler runs, and only `req.idempotency.complete()` on the
success path ever fills it in. If the handler throws - a transient DB
error, a Redis blip - the null-status row is never cleaned up, and every
subsequent retry with that key returns `409 idempotency_in_progress`
**forever**. A merchant whose "confirm booking" hit a hiccup can never
retry that action.

**Fix:** delete the row in an error path (an `onFinish` / try-catch wrapper
around the handler), and treat a null-status row older than a short lease
(say 60s) as abandoned rather than in-progress.

### 6. The 24h replay window isn't real, and nothing purges the table - FIXED

`expires_at` is written and indexed, and then **never read**. The lookup is
`where({ key, route })` with no expiry predicate, and no job purges old
rows. So a key replays forever, not for 24h as spec section 2 and the
middleware's own docstring claim, and the table grows without bound.

**Fix:** add `.where("expires_at", ">", new Date())` to the lookup, and
purge expired rows in the existing daily `runDailyReminderSweep` alongside
the 90-day notification purge.

### 7. Multer errors surface as "Something went wrong on our end"

Nothing anywhere handles `MulterError`. A file over the 10MB limit throws
`LIMIT_FILE_SIZE`, misses both the `ApiError` and `ZodError` branches in
`error-handler.ts`, and returns a generic **500** with
`"Something went wrong on our end. Please try again."` The client-side
`MAX_DOC_BYTES` guard hides this on the happy path, but any request that
reaches the server oversized gets a wrong status and a misleading message.

**Fix:** a `MulterError` branch in `errorHandler` mapping `LIMIT_FILE_SIZE`
to `413 file_too_large` with real copy.

### 8. Revoked sessions keep working for up to 15 minutes

`authenticate()` verifies the JWT signature and nothing else - it never
looks up `sessions` to check whether `sid` is revoked. So `logout`,
`POST /auth/sessions/revoke-all`, the per-session `DELETE`, and the
close-account revocation all leave existing **access tokens valid until
they expire**.

CLAUDE.md documents the refresh-cycle delay as the accepted design for
*suspension*, and that's a reasonable call. But Settings > Security's
"Sign out everywhere else" is a direct promise to a merchant who thinks
someone is in their account, and it doesn't currently keep it.

**Fix:** check `sessions.revoked_at` for `req.auth.sid` in
`authenticate()`. A Redis set of revoked session ids keeps it to one cheap
lookup rather than a DB round-trip per request.

### 9. `audit_log` is not actually append-only

CLAUDE.md states the table is "append-only at the DB level
(`REVOKE UPDATE, DELETE`)". It isn't. The app connects as `cral`, which
**owns** the table, and owner privileges bypass `REVOKE ... FROM PUBLIC`.
Verified:

```sql
-- as the app's own role
DELETE FROM audit_log WHERE false;   -->  DELETE 0   (permitted)
```

**Fix:** a `BEFORE UPDATE OR DELETE` trigger that raises an exception -
triggers apply to the owner too. (Running the app as a non-owner role is
the stronger fix but a bigger operational change.) Either way the CLAUDE.md
claim needs to match reality.

### 10. No graceful shutdown

`server.ts` calls `app.listen` with no `SIGTERM` handler, and the three
BullMQ workers are never closed. Every deploy kills in-flight requests
mid-transaction and drops jobs a worker had claimed.

**Fix:** a `SIGTERM`/`SIGINT` handler that stops accepting connections,
drains in-flight requests, then closes the workers, the Knex pool and Redis.

### 11. The merchant app has no error boundary

There is no `ErrorBoundary`, no `componentDidCatch`, and no `Suspense`
anywhere in `apps/merchant/src`. Any render-time throw in any of the 70
components unmounts the entire React tree to a blank white page with
nothing but a console error - no message, no reload affordance. On a portal
where merchants manage payouts that's a bad failure mode, and it is the one
class of bug the 144 backend tests cannot catch.

**Fix:** a top-level boundary in `main.tsx` plus a per-route one in
`AppLayout`, rendering the existing `packages/ui` state screen so a broken
page doesn't take the nav down with it.

---

## P2 - hardening

### 12. JWT verification pins neither audience nor algorithm - FIXED

`verifyAccessToken` is a bare `jwt.verify(token, secret())`. The claims
declare `aud: "public"` and `jwt.ts`'s own comment says Phase-3 admin
tokens will carry `aud: "ops"` - but nothing checks it, so an ops token
will be accepted by every public merchant endpoint the day it exists.
Latent today, free to fix now.

**Fix:** `jwt.verify(token, secret(), { audience: "public", algorithms: ["HS256"] })`.

### 13. Nothing stops the dev JWT secret reaching production - FIXED

`secret()` throws only when `JWT_ACCESS_SECRET` is unset. The committed
`.env.example` default `dev_only_change_me_access` would boot and sign real
tokens in production.

**Fix:** refuse to boot when `NODE_ENV === "production"` and the secret is
the known dev value or under ~32 chars.

### 14. No security headers - FIXED

No `helmet`, no `nosniff`, no `Referrer-Policy`, no HSTS. Cheap to add and
partly mitigates #4.

---

## P3 - contract, test and consistency gaps

### 15. `/merchant/vehicles/*` has no OpenAPI contract at all

The repo's stated rule is contract-first: "one file per domain, frozen
before that domain is built." Nine implemented endpoints have no spec file:

```
GET|POST          /merchant/vehicles
GET|PATCH|DELETE  /merchant/vehicles/:vehicleId
POST              /merchant/vehicles/:vehicleId/{documents,duplicate,
                    messages,pause,resume,submit,verification}
```

`merchant-onboarding.yaml` covers `/merchant/onboarding/vehicles`, which is
a different surface. Every other merchant domain - bookings, payouts,
notifications, settings, dashboard - has its file. Vehicles, the largest
one, is the gap.

**Fix:** write `openapi/merchant-vehicles.yaml` from the implementation.
Retroactive, but it closes the one hole in the convention.

### 16. Zero frontend tests, anywhere

No Vitest, no Testing Library, no Playwright in `apps/merchant`,
`apps/customer`, `apps/admin`, `packages/ui` or `packages/types`. 70
merchant source files, including all the money-facing form logic, have no
test of any kind. The backend is well covered; the client is not covered at
all.

**Fix:** add Vitest + Testing Library to `apps/merchant` and start with the
logic where a silent bug costs money or blocks a merchant, not with
snapshot coverage:

- `RateField`'s `grossFromNet`/`netFromGross` round-trip (pure functions,
  trivially testable, directly money-affecting)
- `lib/api.ts`'s 401-refresh-and-retry and the `refreshInFlight`
  single-flight guard
- `lib/auth.ts`'s storage switching and the `queryClient.clear()` on
  session change (the thing stopping one account's cache leaking into the
  next)
- the onboarding wizard's step gating (the client mirror of
  `assertCompleteForSubmission`)

### 17. The commission rate is duplicated, in a money path

`booking-pricing.ts#COMMISSION_RATE = 0.1` and
`RateField.tsx#COMMISSION_PCT = 10` are held in step by a comment. This is
the same pattern already flagged for `NOTIFICATION_KIND` and the vehicle
categories - but those are labels and this one prices vehicles. If they
ever drift, the merchant is quoted a take-home the platform won't pay.

**Fix:** move it to `packages/types` (already the home for money and ID
conventions) and import it on both sides, so drift becomes impossible
rather than merely discouraged.

### 18. `identity.yaml` has drifted from the implementation

Specified, never built: `/auth/email/verify/request`, `/auth/email/verify`,
`/auth/login/otp`, `/auth/pin/set`, `/auth/phone/change/request`,
`/auth/phone/change/confirm`, `/auth/email/change/request`,
`/me/data-export`, `/me/delete-request`.

Most are dead by decision and should simply be **cut** from the contract -
`/auth/login/otp` and `/auth/pin/set` contradict the 2026-08-24 "SMS is
only ever a 2FA challenge" call; the phone/email-change pair is superseded
by `PATCH /merchant/profile` + phone verification; `/me/delete-request` is
superseded by `/auth/account/deletion`.

The one that is a real gap rather than stale text is **`/me/data-export`**.
Account deletion shipped as genuine self-service, but the matching data
*portability* right under Kenya's Data Protection Act 2019 has no
implementation. Worth a decision - build it or record why it's deferred -
rather than leaving it as an unimplemented line in a frozen contract.

### 19. No role guard exists anywhere

No route or middleware checks `req.auth.roles`. Every merchant endpoint is
`authenticate()` only, and safety comes entirely from
`getOrCreateMerchant(userId)` scoping each query to the caller's own
merchant row. That holds today because merchant is the only portal - but
note the side effect: any authenticated user hitting a **GET** endpoint
(`/merchant/dashboard`, `/merchant/vehicles`) silently **creates** a
merchant row for themselves. Once the customer portal exists, customers
browsing with a valid token will start minting empty merchant records.

**Fix:** not urgent, but before Phase 2 add a `requireRole("merchant")`
middleware, and split `getMerchant` (read, 404s) from `getOrCreateMerchant`
(used only by the onboarding write path).

### 20. Smaller items

- `queryClient` is constructed with no default options, so TanStack Query
  retries **3x on every failure including 4xx**. Set
  `retry: (n, e) => n < 2 && e.status >= 500`.
- The merchant bundle is a single **592KB** chunk (162KB gzipped) with no
  route-level code splitting; Vite warns about it on every build.
- `fetch` in `lib/api.ts` has no timeout or `AbortSignal` - a hung request
  hangs that part of the UI indefinitely.
- The dashboard chart renders `Math.round(net / 100 / 1000)` with a `k`
  suffix, so any month under KES 500 displays as `0k`.
- `MEMORY.md`'s "six lint errors waiting for CI" note is stale - lint is
  clean.

---

## Suggested order

Each group is independently shippable.

1. ~~**Security patch** (#1, #2, #3, #4, #12, #13, #14)~~ - **done**, branch
   `feature/security-patch`.
2. ~~**Idempotency correctness** (#5, #6)~~ - **done**, same branch. Both
   touch the same middleware.
3. **Reliability** (#7, #8, #9, #10, #11) - the error-shape, shutdown and
   boundary fixes.
4. **Frontend test harness** (#16) - Vitest + the four suites above.
5. **Contract catch-up** (#15, #18) - write `merchant-vehicles.yaml`, prune
   the dead identity paths, decide on `/me/data-export`.
6. **Consistency** (#17, #19, #20) - shared commission constant, role
   guard, query defaults.
