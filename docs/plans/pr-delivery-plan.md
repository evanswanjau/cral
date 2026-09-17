# PR delivery plan and deploy playbook

> **STATUS: PLAN. NOTHING HERE IS BUILT.** Written 2026-09-15.
> Companion to [`road-to-transactable.md`](./road-to-transactable.md),
> which holds the *why* for each item. This file holds the *how*: one
> ordered list of PR-sized phases, and the exact ritual for committing,
> pushing and deploying each one.
>
> When a PR ships, tick it here and record the decision in CLAUDE.md. Do
> not rewrite this file into past tense.

---

## Part 1 - The working agreement

### One PR, one deploy, one thing

Every phase below is sized to be a single PR that can be merged and
deployed on its own, then verified in the browser before the next one
starts. **Never merge two PRs and deploy once** - when something breaks
you lose the ability to say which change did it, which is exactly the
confusion this plan exists to end.

### Branching

`main` is the deploy branch. `~/redeploy.sh` fetches `origin/main`, so
**merging to `main` is the deploy trigger.**

`develop` is dead - it holds zero unique patches and is 20+ commits
behind. Delete it rather than leaving two apparent trunks. Every plan
doc that says "branch work off develop" is wrong and should be corrected
as it is touched.

```
main ──┬── feature/<short-name> ──┬── PR ── merge ── deploy ── verify
       └────────────────────────── next branch starts from updated main
```

Always start a branch from a freshly pulled `main`. Never stack a branch
on an unmerged branch unless the dependency is real and stated in the PR.

### The local gate is the only gate

GitHub Actions is billing-locked - a red check means zero steps ran, not
a code failure. **Local is the gate.** Nothing merges until all four are
green:

```bash
npm run typecheck
npm run lint
npm run test -w apps/api
npm run build
```

(All green as of 2026-09-15.)

---

## Part 2 - Pre-flight: do these once, before PR 1

These are not features. They protect everything that follows.

### P0.1 - Push the unpushed work *(~20 min)*

Four commits exist **only on this machine**, on four
`feature/portal-round-5-*` branches, plus `docs/plans/portal-round-5.md`
which is in no remote. One disk failure loses them.

```bash
git push -u origin feature/portal-round-5-edit-vehicle
git push -u origin feature/portal-round-5-return-no-code
git push -u origin feature/portal-round-5-dashboard-links
git push -u origin feature/portal-round-5-hide-deposit
```

Then commit the uncommitted admin-payouts groundwork to its own branch.
No merges, no deletions yet.

### P0.2 - Database backups ✅ **DONE 2026-09-16**

Was blocking: every deploy runs `npm run migrate` against live data, and
there were no backups at all.

What now exists on the box:

- **`/home/cral/cral-backup.sh`** - `pg_dump` run *inside* the container so
  its version always matches the server. Writes to a `.partial` file and
  renames only on success, so an interrupted dump is never left looking
  like a usable backup. Verifies the gzip and checks for pg_dump's own
  completion marker - a truncated dump is a failure wearing a success
  costume. Aborts if free disk is under 2GB, because this box is shared
  with ~10 other production apps and a backup must never be what takes them
  down. 30-day retention, plus a sweep of abandoned `.partial` files.
- **Nightly cron**, 01:00 UTC (04:00 Nairobi). Verified to run under cron's
  minimal environment, not just an interactive shell - `docker` not being
  on cron's `PATH` is the classic silent failure here.
- **A backup step inside `~/redeploy.sh`**, now step 4 of 6, immediately
  before migrate. The script is `set -e`, so **a failed backup aborts the
  deploy before the schema changes**. Nightly alone would leave up to 24h
  of data behind a bad migration, which is the whole risk of deploying on
  every merged PR.

**Verified by restore, not by the file existing.** A dump was restored into
a throwaway `cral_restore_test` database: 34 tables, and `users`,
`merchants`, `vehicles`, `bookings`, `documents` and `audit_log` row counts
all matched production. The scratch database was then dropped.

**Still open: these are on-box backups.** They protect against a bad
migration, a wrong DELETE, a deploy that mangles data. They do **not**
protect against losing the host or the disk. An off-box copy is still
needed and is not done.

### P0.3 - Rewrite `DEPLOY.md`

It currently opens "Deploy readiness (not deployed yet)" and describes
Railway/Render. The real deployment is a VPS and has been live since
2026-09-09. Replace it with the actual layout (or point it at the
deployment memory). A deploy doc that describes a platform you do not use
is worse than none.

### P0.4 - Verify the live box ✅ **DONE 2026-09-16**

Confirmed on the box rather than trusted from notes - and it was worth
doing. The deploy was **behind `origin/main`**: the 2026-09-16 redeploy
applied a migration that had never run in production
(`20260916090000_admin_communications.ts`), meaning the admin Communications
work was merged but not live.

It is now at `6c7e41a`, `/readyz` reports database and redis ok, and
`cral-api` is active. Postgres and Redis containers are healthy, the disk
is at 65% (17GB free), and the production database is ~10MB (a compressed
dump is ~20KB, so retention costs nothing).

**The lesson, not the snapshot:** merging did not mean deployed. Check the
deployed SHA against `origin/main` rather than assuming the last merge went
out.

## Part 3 - The deploy ritual (run for every PR)

### Step 1 - Branch and work

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

### Step 2 - Gate locally

```bash
npm run typecheck && npm run lint && npm run test -w apps/api && npm run build
```

### Step 3 - Commit

Review what you are staging - `git status` after any broad `git add`.
Stage named files, not `-A`.

```bash
git add <specific files>
git commit -m "$(cat <<'EOF'
<Area>: <what changed and why, one line>

<optional body>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

### Step 4 - Push and open the PR

```bash
git push -u origin feature/<short-name>
gh pr create --title "<short title>" --body "..."
```

### Step 5 - ENV FIRST *(the biggest footgun)*

**`~/redeploy.sh` does not touch `.env`.** If the PR introduces a new
required environment variable, add it to `/srv/cral/.env` **before**
merging. A missing required value fails the production boot guard and the
API crash-loops - a live outage caused by a deploy that "should have been
safe".

```bash
ssh cral@46.202.128.68
nano /srv/cral/.env          # add the new keys
sudo systemctl restart cral-api
curl localhost:4100/readyz   # confirm still healthy BEFORE the merge
```

PRs in this plan that need this are flagged **`ENV`** below.

### Step 6 - Back up, then merge

For any PR flagged **`MIGRATION`**, take the manual dump from P0.2 first.

```bash
gh pr merge --merge   # merging to main IS the deploy trigger
```

### Step 7 - Deploy

```bash
ssh cral@46.202.128.68 '~/redeploy.sh'
```

This fetches `origin/main`, `npm ci`, builds api + merchant + admin +
customer, runs `npm run migrate`, restarts `cral-api`, and checks
`/readyz`. The API restart is a brief interruption - expected, seconds.

### Step 8 - Verify in the browser, not just `/readyz`

`/readyz` proves the process booted. It does not prove the feature works.
Each phase below names its own smoke check. Run it against the real host:

- https://cral.co.ke - customer
- https://merchant.cral.co.ke - merchant
- https://admin.cral.co.ke - Ops
- https://api.cral.co.ke - API (`/admin/` returns 404 here by design)

### Step 9 - If it breaks, revert forward

`redeploy.sh` always deploys `origin/main`, so rolling back means moving
`main`, not checking out an old SHA on the box:

```bash
git revert -m 1 <merge-sha>
git push origin main
ssh cral@46.202.128.68 '~/redeploy.sh'
```

**A reverted migration is not automatically undone.** Prefer
expand-then-contract (add nullable, backfill, switch reads, drop later)
so a code revert alone is always safe. Never edit a migration that has
been deployed - stack a new one.

---

## Part 4 - The phases

Each is one PR. Flags: **`MIGRATION`** (needs a backup first),
**`ENV`** (needs `.env` on the box updated before merge),
**`DECISION`** (blocked on an owner or external answer).

### Phase A - Land the stranded work

Nothing new is built. This clears four branches so the tree stops lying
about what shipped.

**A1 - Handover: drop the code step on the return leg**
Land `feature/portal-round-5-return-no-code`. First because it changes
handover behaviour, and handover completion is what makes a booking
payout-eligible - Phase G depends on it.
*Smoke:* complete a return on merchant; confirm no return code is asked
for and the booking still reaches `completed`.

**A2 - Vehicles: edit logbook fields after creation**
Land `feature/portal-round-5-edit-vehicle` (492 insertions, 9 files).
*Smoke:* edit a vehicle's details on merchant; confirm it persists.

**A3 - Dashboard: bookings-this-week rows link only to the booking**
Land `feature/portal-round-5-dashboard-links`. Then **close
`feature/portal-round-5-hide-deposit` without merging** - `main` already
has no deposit references in the merchant booking screen; it is
superseded, not pending.
*Smoke:* dashboard row click lands on the booking.

**A4 - Docs truth pass** *(no deploy needed, but deploy anyway to stay in rhythm)*
Bring `docs/plans/portal-round-5.md` into the repo. Correct
`admin-bookings-payouts.md` from past tense to a plan. Fix
`customer-portal.md`'s claim that nothing expires stale requests -
`expireStaleBookingRequests` exists, is tested, and is scheduled in
`jobs/booking-expiry.ts`. Delete "branch off develop" everywhere.

### Phase B - Upload correctness

**B1 - Onboarding photo upload: stop losing successful uploads**
`PhotoUpload.tsx#addFiles`. Commit successful uploads before surfacing an
error; surface the server's real message instead of "try again"; delete
the stale comment at lines 60-66; fix drag-and-drop silently doing
nothing on the disabled slot.
*Why first in this phase:* it is a live dead end on onboarding - a
merchant can reach a state where the screen shows zero photos while the
server rejects new ones as `too_many_photos`.
*Smoke:* on merchant onboarding, upload three photos, then a fourth;
confirm a clear message and that the first three are still shown.

**B2 - Storage: add delete, stop leaking bytes** **`MIGRATION`**
Add `deleteObject(key)` to `StorageAdapter` + the local adapter. Wire it
into `deleteDocument` and into `uploadDocument`'s single-slot replace
branch. Move the `MAX_VEHICLE_PHOTOS` check **before** `putObject` so a
rejected upload does not leak a file. Extend `runAccountDeletionSweep` to
remove a deleted user's compliance documents and their bytes.
*Smoke:* delete a photo, confirm the file is gone from `/srv/cral-storage`.

### Phase C - Cloudinary

**C1 - Adapter and column, shipped dark** **`MIGRATION`** **`ENV`**
Add `documents.storage_provider` (`local` | `cloudinary`, default
`local`). Add `CloudinaryStorageAdapter` behind `STORAGE_ADAPTER=cloudinary`.
Keep `local` the default and pinned for the test run - **the suite must
never upload to Cloudinary.** Two delivery classes: compliance documents
private/authenticated with short-TTL signed URLs; `vehicle_photo` public.
Deploying this changes no behaviour, because the env still says `local`.
*Smoke:* nothing visible; confirm `/readyz` and that uploads still work.

**C2 - Backfill and flip** **`ENV`**
`npm run storage:migrate -w apps/api` - idempotent, resumable; walks
`documents` where `storage_provider = 'local'`, uploads each to the right
delivery class, rewrites `storage_key`, flips the provider. Run it on the
box, verify, then set `STORAGE_ADAPTER=cloudinary` and restart.
*Smoke:* open a compliance document as a merchant (must be authenticated,
never a public URL) and a car photo on the public catalog.

**C3 - Serve car photos from Cloudinary directly**
Catalog returns Cloudinary URLs with named transformations (auto
WebP/AVIF, responsive widths) instead of proxying bytes through the API.
Compliance documents stay behind the authenticated route - unchanged.
*Smoke:* browse page on cral.co.ke; confirm images load from Cloudinary
and no compliance document is publicly reachable.

### Phase D - Payment simulator

**D1 - Simulated payment adapter**
The gap: `ConsolePaymentAdapter` acks the initiate leg but nothing fires
the callback, so a simulated payment sits `pending` forever. Add an
adapter that enqueues a BullMQ job to invoke `handleCallback` with a
Co-op-shaped payload echoing our `messageReference`, plus dev-only
scenario control (success, cancel, insufficient funds, timeout,
**duplicate callback**, late callback). `NODE_ENV !== "production"` guard.
*Smoke:* on staging, drive a booking to paid via the simulator.

**D2 - Co-op sandbox run** *(config + verification, may not need a PR)*
Point the adapter at `openapi-sandbox.co-opbank.co.ke` (already the
default base URL) to test D2's wire format against something real and
observe what a real callback carries in its headers.

### Phase E - Money model

**E1 - Single-source `COMMISSION_RATE`**
Presently hand-copied into `apps/customer/src/pages/ListYourCar.tsx` and
`apps/merchant/src/components/onboarding/RateField.tsx`. A money path with
three sources. Pure refactor, no behaviour change.
*Smoke:* the earnings calculator and the merchant rate field still agree.

**E2 - Delivery / collection fees** **`MIGRATION`** **`DECISION` (D4)**
Nothing exists today - no `delivery_fee`, no `handover_location` anywhere
in `apps/api/src`. The design offers four handover options at different
prices that change both the renter's total and the merchant's net, so
this belongs in `computeBookingPricing`, never in a client.
*Blocked on:* D4 - platform-set prices or merchant-set.

### Phase F - Collection

**F1 - Guard the pay endpoint**
`POST /bookings/:id/pay` has no status guard - it will currently prompt
for a `requested` or `declined` booking. Payment happens only after the
owner accepts.
*Smoke:* attempt to pay a `requested` booking; expect a clean refusal.

**F2 - Deposit handling** **`DECISION` (D1)**
Implement whichever custody option D1 lands on. `amountFor` already
branches on `"deposit" | "full"`, so both can be trialled behind the
simulator before committing.

### Phase G - Disbursement

**G1 - Admin payouts API, contract first** **`MIGRATION`**
Freeze `openapi/admin-payouts.yaml` **before** writing the service - the
step that was skipped last time. Then `modules/admin-payouts/`, folding in
the groundwork already in the working tree (`payout_held` migration,
`merchantsWithPayableBookings`, `markPayoutRunPaid`, exported
`destinationFor`). `cutPayoutRun` stays the single decider.
*Smoke:* cut a run on staging; confirm totals match `/merchant/payouts`.

**G2 - Admin payouts screens**
`Payouts.tsx` + `PayoutRunDetail.tsx`; flip the `SideNav` item to `built`.
Launch on **manual `mark-paid` with a written runbook**, not Daraja B2C.
*Smoke:* mark a run paid in the console; confirm the merchant sees the
payout notification.

### Phase H - Disputes and refunds

**H1 - Admin refund path**
Extract `cancelBooking`'s late-fee arithmetic into something both the
merchant route and an admin route call. Do not fork that math - a second
copy is the `cutPayoutRun` mistake.

**H2 - Dispute resolution**
Only as far as real money allows. A resolve button that cannot move money
fabricates a capability.

### Phase I - Go live

**I1 - Callback authentication** **`DECISION` (D3)** **`ENV`**
Implement whatever Co-op provides. If they provide nothing, do **not**
trust the callback as the source of truth: treat it as a hint and confirm
every payment with a server-to-server status query before marking a
booking paid.
**Ask Co-op today** - this has an external clock measured in weeks, and it
is the only item here that cannot be unblocked from this side.

**I2 - Production hardening before real money**
`admin.cral.co.ke` is reachable from anywhere (its vhost has a commented
allow/deny block ready). `ufw` is inactive. The pasted root password needs
rotating and `cral` should be key-only. `www.cral.co.ke` still points at
the old host. None of this blocks building; all of it blocks real funds.

**I3 - Prove it**
Run `customer-portal.md` §6 end to end on staging with real money:
renter signs up, uploads ID and licence, Ops accepts, browses, requests a
car, merchant sees the request, accepts, renter pays by M-Pesa, handover
blocked until documents are accepted, hire completes, admin sees the
booking, payout run includes it.

---

## Part 5 - Order at a glance

| # | PR | Flags | Blocked by |
|---|---|---|---|
| P0 | Pre-flight: push work, backups, docs | - | - |
| A1 | Handover: no return code | - | - |
| A2 | Vehicles: edit after creation | - | - |
| A3 | Dashboard links; close hide-deposit | - | - |
| A4 | Docs truth pass | - | - |
| B1 | Photo upload: stop losing uploads | - | - |
| B2 | Storage: delete + stop leaks | MIGRATION | - |
| C1 | Cloudinary adapter, shipped dark | MIGRATION, ENV | B2 |
| C2 | Backfill and flip | ENV | C1 |
| C3 | Serve car photos from Cloudinary | - | C2 |
| D1 | Payment simulator | - | - |
| D2 | Co-op sandbox run | ENV | D1 |
| E1 | Single-source COMMISSION_RATE | - | - |
| E2 | Delivery fees | MIGRATION | **D4** |
| F1 | Guard the pay endpoint | - | D1 |
| F2 | Deposit handling | - | **D1 decision** |
| G1 | Admin payouts API | MIGRATION | A1 |
| G2 | Admin payouts screens | - | G1 |
| H1 | Admin refund path | - | F2 |
| H2 | Dispute resolution | - | H1 |
| I1 | Callback auth | ENV | **D3 (Co-op)** |
| I2 | Production hardening | - | - |
| I3 | End-to-end proof | - | everything |

Phases A, B, D and E have **no external dependency** - they can start
immediately and account for nine of the PRs. C runs in parallel with D/E
if wanted; they touch different code. Only E2, F2 and I1 wait on answers.

## Part 6 - Out of scope

Admin Dashboard, Invoicing, four of the five placeholder Settings tabs,
the staff notification bell, impersonation, the profile-change review UI,
Parts/Services, build-time prerendering, the People/roles tab. All stay
honestly labelled "not built" rather than half-built.
