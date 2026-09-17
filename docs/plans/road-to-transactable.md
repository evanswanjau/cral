# Road to transactable

> **STATUS: PLAN. NOTHING IN THIS DOCUMENT IS BUILT.**
> Written 2026-09-15. Every section below is future work. When a section
> ships, move it into CLAUDE.md's "Recorded product decisions" and mark it
> here with the date and the PR - do not leave this file claiming work is
> done. (See `admin-bookings-payouts.md` for why this warning exists: it
> was written in past tense before the work happened and misled the next
> session.)

## Definition of done

A real renter pays a real merchant end to end, on staging, with real
money. The proof script is `customer-portal.md` §6. Anything that does
not move that script forward is out of scope for this plan.

---

## D3 (callback authentication) - can it wait?

**Yes, it can be deferred to the end - under one hard condition.**

The callback endpoint must not be reachable by real money before D3 is
answered. That is a *launch* gate, not a *build* gate.

Why deferral is safe: with a payment simulator (Gate 2) the whole money
state machine can be built and proven without Co-op. D3 only governs the
final flip to real funds.

Why it must still be asked today: it has an external clock. Co-op's
OpenAPI document says nothing about callback authentication - no
signature header, no shared secret, no published IP range. That answer
comes from their support desk or relationship manager, and may take
weeks. Send the question now; work continues in parallel.

**The standing risk while it is open.** `handleCallback` currently trusts
nothing but the obscurity of its URL. Anyone who learns that URL can mark
bookings paid. A simulator makes this *less* visible, because our own
simulated callbacks always authenticate perfectly - we wrote both ends.

**Guardrails until D3 closes:**

- `COOPBANK_STK_PATH_CONFIRMED` stays `false` in production.
- The callback route stays off any production-reachable host, or returns
  503 when `PAYMENT_ADAPTER !== "coopbank"`.
- No production deploy of the payments path is treated as "live" until
  D3 is answered and implemented, whatever else is finished.

**Acceptable answers**, in order of preference: a signature header we can
verify (HMAC or similar); mutual TLS; a shared secret in a header over
HTTPS; a documented static IP allowlist. If Co-op offers none of these,
the fallback is **never trust the callback as the source of truth** -
treat it only as a hint, and confirm every payment with a server-to-server
status query against Co-op before marking a booking paid.

---

## The gates, in order

### Gate 0 - Back up unpushed work *(precondition, ~20 min)*

Four commits exist only on this machine, on four `feature/portal-round-5-*`
branches, plus `docs/plans/portal-round-5.md` (194 lines) which is in no
remote. Push all four to `origin`. Commit the uncommitted admin-payouts
groundwork to a branch. No merges, no deletions.

Verified safe to delete *afterwards*, separately: `develop` (zero unique
patches by `git cherry`) and the 14 fully-merged branches.

### Gate 1 - Decisions

| Decision | Owner | Blocks |
|---|---|---|
| **D3** callback auth | Co-op (external) - **ask today** | Real money only |
| **D1** deposit custody | Owner | Gate 3, admin refunds, merchant claim flow |
| **D4** delivery fees: platform-set or merchant-set | Owner | Gate 3 pricing |

D1 can be explored empirically once Gate 2 exists - `amountFor` already
branches on `"deposit" | "full"`, so both options can be run and compared
before committing.

### Gate 2 - Payment simulator

Removes Co-op from the critical path for every gate below.

Already present: `PaymentAdapter` interface, `ConsolePaymentAdapter`,
`PAYMENT_ADAPTER` env selection (defaults to `console`),
`payment_requests`, `initiatePayment`, idempotent `handleCallback`, and
`payments.test.ts`.

**The gap:** `ConsolePaymentAdapter` acks the initiate leg but nothing
ever fires the callback, so a simulated payment sits in `pending`
forever and the flow dies one step in.

**To build:**

- A simulated adapter that, after acking, enqueues a BullMQ job to invoke
  `handleCallback` a second or two later with a Co-op-shaped payload
  echoing our own `messageReference`. Reproduces the real async timing.
- Scenario control, dev-only: success, user cancels, insufficient funds,
  no response / timeout, **duplicate callback** (proves the existing
  idempotency), late callback after expiry.
- `NODE_ENV !== "production"` guard, same footing as the other dev-seeds.
- Separately, point the adapter at Co-op's real sandbox
  (`openapi-sandbox.co-opbank.co.ke`, already the default base URL) to
  test D2's wire format against something real and to observe what an
  actual callback carries in its headers. Sandbox evidence informs D3 but
  does not settle it - absence of an auth header in sandbox is not proof
  about production.

**What the simulator cannot do:** answer D3, prove real settlement or
timing, or cover disbursement (there is no B2C adapter at all;
`markPayoutRunPaid` stays the manual stand-in).

### Gate 3 - Collection (renter pays)

Needs D1, D4, and Gate 2.

- Model **delivery / collection fees** - nothing exists today (no
  `delivery_fee`, no `handover_location` anywhere in `apps/api/src`). The
  design offers four handover options at different prices, and they change
  both the renter's total and the merchant's net, so this must land in
  `computeBookingPricing`, not in a client.
- Deposit handling per D1.
- Give `POST /bookings/:id/pay` its missing status guard - it will
  currently prompt for a `requested` or `declined` booking.
- Single-source `COMMISSION_RATE`. It is a money path and is presently
  hand-copied into `apps/customer/src/pages/ListYourCar.tsx` and
  `apps/merchant/src/components/onboarding/RateField.tsx`.

### Gate 4 - Disbursement (merchant gets paid)

- Finish the admin Payouts slice properly, **contract first this time**:
  freeze `openapi/admin-payouts.yaml`, then `modules/admin-payouts/`, then
  the two screens, then tests. The groundwork is already in the working
  tree (`payout_held` migration, `merchantsWithPayableBookings`,
  `markPayoutRunPaid`, `destinationFor` exported).
- Land `feature/portal-round-5-return-no-code` first - it changes handover
  behaviour, and handover completion is what makes a booking
  payout-eligible.
- **Recommendation: launch on manual `mark-paid` with a written runbook**,
  not Daraja B2C. Safaricom B2C onboarding has its own long lead time, and
  manual reconciliation is honest at low volume - it is already what
  `markPayoutRunPaid` was designed for.

### Gate 5 - Only the admin screens money needs

- **Payouts** (delivered by Gate 4).
- **Disputes.** Once money moves, a dispute must be resolvable. This is
  where the deferred "refund the renter" lands - via extracting
  `cancelBooking`'s late-fee arithmetic into something both the merchant
  route and an admin route call. Do not fork that math; a second copy is
  the `cutPayoutRun` mistake.

### Gate 6 - Prove it

Run `customer-portal.md` §6 end to end on staging, for real.

---

## Storage: switch to Cloudinary

### Why now

Three bugs below share one root cause, and the migration is the natural
moment to fix them. It also directly helps the customer portal: browse and
detail pages currently proxy every image through the API.

### The problem with the current adapter

`StorageAdapter` has **three** methods - `putObject`, `getObject`,
`getSignedUrl`. There is **no delete**. `deleteObject` / `removeObject`
appear nowhere in `apps/api/src`. Consequences:

- `deleteDocument` (`modules/merchant/service.ts`) removes the row and
  **leaves the bytes forever**.
- Single-slot replacement (`uploadDocument`'s `else` branch) deletes the
  old row and **leaks its file**. Replace a logbook five times, leak four.
- `runAccountDeletionSweep` scrubs the `users` row but never touches
  `documents` or storage - so a **deleted user's National ID and KRA PIN
  scans persist indefinitely**, with no mechanism to remove them. That is
  a retention problem today and a billing problem on Cloudinary.

### Two classes of asset - the key design decision

The `documents` table currently conflates them. Cloudinary must not.

**Class A - compliance documents.** `national_id`, `kra_pin`, `logbook`,
`comprehensive_insurance`, `tracker_certificate`,
`certificate_of_incorporation`, `company_kra_pin`, `cr12`,
`driving_licence`. Spec §22: never a public bucket. Use Cloudinary's
**authenticated/private delivery type**, signed URLs with a short TTL,
and keep serving them through the existing authenticated API route so the
security-patch rules still apply (`nosniff`, `safeContentType`,
`safeDisposition`). **No Class A asset ever gets a public URL.**

**Class B - vehicle photos** (`vehicle_photo`). Already shown to anonymous
visitors via `/catalog/vehicles/:id/photos/:photoId`. These can use public
delivery with named transformations - auto WebP/AVIF, responsive widths,
thumbnails for the catalog rails. This takes image bytes off the API
entirely and is the single biggest performance win available to the
browse page.

### Migration approach

1. Add `deleteObject(key)` to `StorageAdapter`; implement in the local
   adapter first, and **fix the three leaks above before migrating** - do
   not carry orphans into a service that bills for storage.
2. Add a `documents.storage_provider` column (`local` | `cloudinary`,
   default `local`). Old rows stay readable; new uploads go to Cloudinary.
   Honest coexistence beats a big-bang rewrite.
3. `CloudinaryStorageAdapter` behind `STORAGE_ADAPTER=cloudinary`, with
   `CLOUDINARY_*` credentials in the gitignored `.env` and empty keys in
   `.env.example`. `local` stays the default for dev and is pinned for the
   test run, exactly as the SMS/email adapters are - **do not let the test
   suite upload to Cloudinary.**
4. A backfill script (`npm run storage:migrate -w apps/api`) that walks
   `documents` where `storage_provider = 'local'`, uploads each to the
   right delivery type for its class, rewrites `storage_key`, and flips
   the provider. Idempotent and resumable; dev/staging first.
5. Only once backfill is clean: make Class B reads serve Cloudinary URLs
   directly from the catalog instead of proxying.

### Rules to preserve

- Storage keys stay server-generated from ids
  (`buildStorageKey`), never caller-supplied paths.
- Upload validation stays as-is: `createUpload()` for all multipart
  routes, type checked twice (declared type and actual leading bytes).
  **Do not hand-roll a Cloudinary upload widget** that bypasses it, and do
  not allow unsigned client-side uploads straight to Cloudinary - that
  would skip every check in `lib/uploads.ts`.
- Once `deleteObject` exists, extend `runAccountDeletionSweep` to remove a
  deleted user's Class A documents and their bytes.

---

## Bugs found on the onboarding car-photo upload

All four are real and verified in the source.

### 1. A mid-batch failure silently discards successful uploads *(user-visible dead end)*

`apps/merchant/src/components/onboarding/PhotoUpload.tsx`, `addFiles`.
Files upload in a sequential loop, accumulating into `uploaded`, and
`onChange` is called **only after the whole loop succeeds**. If the second
of three files fails, the `catch` runs and `onChange` is never called - so
the first photo, **already stored on the server**, vanishes from the UI.

The user then sees zero photos, retries, and uploads duplicates. After
enough retries the server returns 422 `too_many_photos` while the screen
still shows nothing. The merchant is stuck on the onboarding photo step
with no way to understand why.

**Fix:** commit whatever succeeded (`onChange([...photos, ...uploaded])`)
before surfacing the error, and name the file that failed.

### 2. The real server error is swallowed

Same function: `catch { setError("Couldn't upload one or more photos. Try
again.") }` discards the API error. `too_many_photos` becomes "try again",
which is precisely the wrong advice - retrying cannot succeed.

**Fix:** surface the server's `message`, and reconcile from the server
when the cap is hit so the UI stops disagreeing with reality.

### 3. Bytes are written to storage before validation

`modules/merchant/service.ts#uploadDocument`: `putObject` runs **before**
the transaction that checks `MAX_VEHICLE_PHOTOS`. A rejected fourth photo
is already on disk when the 422 is thrown, and nothing cleans it up. Every
rejected upload leaks a file.

**Fix:** check the cap before writing bytes, or delete the object when the
transaction fails (needs `deleteObject`). Note the count-then-insert is
also a TOCTOU race - low severity today because the client uploads
serially, but two tabs could exceed the cap.

### 4. Stale comment

`PhotoUpload.tsx` lines 60-66 claim re-fetching "isn't wired up yet" and
that a photo whose blob is gone shows a generic icon. That is no longer
true - `loadPhotoPreview` and `usePhotoPreview` fetch the bytes back from
`GET /merchant/onboarding/documents/:id`. Delete the stale half.

*Minor, not worth its own PR:* the empty photo slot is a `<button
disabled>` when no vehicle exists yet, and drop events do not fire on a
disabled element - so drag-and-drop silently does nothing rather than
showing the "Fill in the vehicle details above first" message.

---

## Explicitly out of scope

Admin Dashboard, Invoicing, four of the five placeholder Settings tabs
(Review rules, Money, Communication, Audit log), the staff notification
bell, impersonation, the profile-change review UI (the CLI script stays),
Parts/Services, build-time prerendering, the People/roles tab. All stay
honestly labelled "not built" rather than half-built.

## Verification, every PR here

1. Contract frozen in `openapi/` before the service.
2. `npm run test -w apps/api`.
3. `npm run typecheck` and `npm run lint` at the root - both exit 0.
   (Both are green as of 2026-09-15.)
4. CI is billing-locked, so local is the gate.
5. For the storage work specifically: confirm no test run ever writes to
   Cloudinary, and confirm a deleted document's bytes are actually gone.
