# Conventions and platform rules

`CLAUDE.md` lists the non-negotiables in one line each. This file holds
the detail and the reasons. Read it before touching idempotency, the audit
log, uploads, auth middleware, error handling, plated references or the
test setup.

## IDs, money, errors, pagination, time, tables

- **IDs** are prefixed ULIDs. `packages/types/src/ids.ts` is the full,
  current prefix list (`usr_`, `mer_`, `veh_`, `bkg_`, `hnd_`, `pay_`,
  `dep_`, `pot_`, `inv_`, `dsp_`, `rev_`, `fil_`, `cmp_`, `doc_`, internal
  `aud_`, and later ones such as `svc_`, `dsb_`, `drv_`). Generate with
  `apps/api/src/lib/ids.ts#generateId`; never let Postgres generate a PK.
- **Money** is `{ amount: <integer cents>, currency: "KES" }`. DB columns
  are the `<name>_amount` (integer) / `<name>_currency` (char(3)) pair via
  `apps/api/src/db/schema-helpers.ts#addMoneyColumn`. Display formatting is
  the client's job, never the API's.
- **Errors** use one envelope: `{ error: { type, code, message, field?,
  doc_url?, request_id } }`, thrown as `ApiError` from `@cral/types`,
  rendered by `apps/api/src/middleware/error-handler.ts`.
- **Pagination** is cursor-based only, via `apps/api/src/lib/pagination.ts`.
  Queues change under the reader, so offset paging is never used.
- **Time** is stored and sent as UTC (RFC 3339). Nairobi time only for
  display and day-boundary logic. `lib/dates.ts#nairobiDayStartUtc` is the
  shared day-start helper.
- **Every table** has a prefixed-ULID PK and `created_at`/`updated_at`
  (timestamptz) via `addTimestamps`. Use `schema-helpers.ts` in every
  migration.

## Idempotency

Every POST that moves money or completes a handover requires an
`Idempotency-Key` header and replays safely within 24h. Enforced by
`apps/api/src/middleware/idempotency.ts` (table `idempotency_keys`),
mounted per route, never globally.

- **Keys are scoped per user**: PK `(user_id, key, route)`. A global
  namespace let two merchants' identical keys collide and serve one the
  other's stored response. `authenticate()` (or `requireAdmin`) must run
  **before** `requireIdempotencyKey()`; for admin routes the key falls back
  to `req.admin?.id`.
- **Only a successful request stores a response.** The row is claimed
  before the handler runs (a concurrent replay fails fast), and
  `res.on("finish")` releases it if `complete()` was never called. Don't
  "fix" a bug by storing error responses: replaying a 500 for 24h is not
  idempotency.
- **A claim has a 60s lease**, so a process that dies mid-handler doesn't
  wedge the key. Takeover is one atomic conditional `update`, so two
  racing retries can't both win.
- **The 24h window is enforced on read** (`expires_at` filter), and the
  insert is `onConflict().merge()` because an expired row is still there.
- **The different-body check runs before the in-flight and lease checks**:
  reusing one key for two bodies is a client bug worth reporting as
  `idempotency_conflict` either way.
- `purgeExpiredIdempotencyKeys` runs in the daily sweep.

## Audit log

Every admin or state-changing action writes an `audit_log` row **in the
same transaction** as the change. The table is append-only through a
`BEFORE UPDATE OR DELETE` trigger, because `REVOKE ... FROM PUBLIC` is a
no-op for the owning role the API connects as. **Nothing may update or
delete an audit row**, including test cleanup. There is no public reader:
an audit reader belongs only behind the Ops (`aud: "ops"`) token. An
anonymous `GET /audit-log` once dumped every state change; don't re-add
one anywhere public.

## Security baseline

- `app.set("trust proxy", 1)`: one proxy (nginx) sits in front. Without it
  every IP-keyed rate limit is one platform-wide bucket. Deliberately `1`,
  not `true`, so a caller can't pick its own bucket through
  `X-Forwarded-For`. Add a proxy, change the number.
- **Uploads have one policy**, `apps/api/src/lib/uploads.ts`: JPEG, PNG,
  WebP and PDF only, checked on the declared type (`fileFilter`) and on
  the actual bytes (`assertDeclaredTypeMatchesBytes`), because a
  `Content-Type` is a claim. Every multipart route uses `createUpload()`;
  don't hand-roll a `multer({...})`. Served files get `nosniff` and go
  through `safeContentType`/`safeDisposition`, so anything outside the
  allowlist downloads instead of rendering on the API origin.
- `verifyAccessToken` pins `audience: "public"` and `algorithms: ["HS256"]`;
  the Ops token has its own key and audience (see `admin-ops.md`).
- Boot fails in production when `JWT_ACCESS_SECRET` (or
  `JWT_ADMIN_SECRET`) is the `.env.example` placeholder or under 32
  characters.
- `helmet` is mounted with `contentSecurityPolicy` and
  `crossOriginEmbedderPolicy` off: the API serves JSON and files to other
  origins and has no pages of its own.
- Request logs are one readable line and never carry bearer tokens.

## Reliability

- **`authenticate()` checks the session row, not just the signature**, so
  a revoked session stops working at once. It's a primary-key lookup per
  request on purpose: many places revoke sessions and a denylist that
  misses one is a silent hole. If it ever shows in profiling, cache
  *positively* (session id -> live, short TTL); don't add a denylist.
  Test helpers must create a real `sessions` row (`createVerifiedTestUser`
  does).
- `MulterError` has its own branch in `error-handler.ts`:
  `LIMIT_FILE_SIZE` -> `413 file_too_large` naming the limit.
- The API drains on SIGTERM/SIGINT: stop accepting, finish requests, close
  the BullMQ workers, then Knex and Redis, with a 15s force-exit backstop.
- Redis failures fail open rather than crash-looping the API.
- The portals have error boundaries (`components/ErrorBoundary.tsx`); the
  merchant portal and the console use two levels (inside the shell, keyed
  on the pathname, and around the whole app). `queryClient` doesn't retry
  4xx (401 is refreshed once by `lib/api.ts` itself).

## Plated references

Both plated refs read "which day, which one that day": a letter, the
Nairobi date `YYMMDD`, and a 3-digit sequence that restarts each Nairobi
day, hyphenated.

- Listing ref `H-260924-001`: `lib/vehicle-events.ts#nextListingRef`,
  backed by `listing_ref_daily_counters` (approval fills one in if a
  listing has none yet).
- Booking ref `CB-260922-001`: `lib/booking-ref.ts#nextBookingRef`,
  backed by `booking_ref_daily_counters`.
- Old sequences (`vehicle_listing_ref_seq`, `booking_ref_seq`) stay in the
  database, unused.
- Daraja's 12-char `AccountReference` gets `compactRef(booking.ref)`
  (`CB260922001`).
- A car-sale ref, when that vertical is built, takes the same shape.

## Tests

- `apps/api/vitest.config.ts` pins `EMAIL_ADAPTER`/`SMS_ADAPTER`/
  `PAYMENT_ADAPTER` to `console` and `STORAGE_ADAPTER` to `local`, plus a
  test `JWT_ADMIN_SECRET` and fixed app URLs. Don't remove the pins:
  without them a test run emails `@example.test` addresses, fires STK
  pushes or uploads fixtures to the real bucket.
- The worker pool is capped at 4 forks. Each worker opens a Knex pool (max
  10) and Postgres tops out at 100 connections; the suite is Postgres-bound
  so this is also faster.
- `src/test/global-setup.ts` clears `ratelimit:*` keys before a run.

## Copy and pages

- **No em or en dashes in the merchant portal** (`-` only), in new copy
  too.
- Every page sets a specific `document.title` via the app's
  `usePageTitle`. Merchant titles are prefixed `Merchant:`; the console's
  suffix is "CRAL Ops".
- Icons, not emojis (Phosphor in the merchant portal).

## Code anchors

- Audit rows via `writeAuditEntry` (`lib/audit.ts`). Idempotency release is `attachHandle`; an in-flight replay gets `409 idempotency_in_progress`. IP-keyed `rateLimit` buckets read `req.ip`. Documents are served at `GET /merchant/onboarding/documents/:id` with `nosniff`.
- Tests: `apps/api/src/__tests__/security.test.ts`, `reliability.test.ts`, `middleware/__tests__/idempotency.test.ts`, `modules/admin-auth/__tests__/`; admin-merchants tests insert vehicles directly. Merchant `main.tsx` holds the outer error boundary.
- Open review findings (groups 4-6): `docs/plans/merchant-review-2026-09-03.md`.
- Older `CRAL-V-*` listing refs are left as they are.
