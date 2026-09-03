# Merchant Portal — Dashboard

## Context

`/` currently `Navigate`s to `/vehicles` (`apps/merchant/src/App.tsx:41`).
There is no dashboard, and `SideNav` has no Dashboard entry — its own
comment still says the screen "hasn't been asked for yet". With Vehicles,
Bookings, Payouts, Notifications and Settings all built, the dashboard is
the last merchant screen in the design and the only one that has to
**agree with all five**.

Design authority is `Cruz Merchant Dashboard.dc.html`, embedded
gzip+base64 in `~/Downloads/Cruz Ride Auto - Merchant App.html` (manifest
uuid `0379208c-a47f-43f7-ae56-d4c11302afec`). Extract it, don't eyeball a
screenshot:

```bash
node -e "const fs=require('fs'),z=require('zlib');const s=fs.readFileSync(process.argv[1],'utf8');const m=JSON.parse(s.match(/<script type=\"__bundler\/manifest\">([\s\S]*?)<\/script>/)[1]);const e=m['0379208c-a47f-43f7-ae56-d4c11302afec'];fs.writeFileSync('dashboard.dc.html',e.compressed?z.gunzipSync(Buffer.from(e.data,'base64')):Buffer.from(e.data,'base64'))" "$HOME/Downloads/Cruz Ride Auto - Merchant App.html"
```

Branch off `develop`.

---

## What the design actually contains

Nine blocks, in DOM order:

| # | Block | Design content |
|---|---|---|
| 1 | Nav **MERCHANT STATUS** card | green-bordered card under the nav: "Company documents accepted", checked-on date, "each vehicle now only needs its own three documents" |
| 2 | Greeting | `Karibu, Mwangi` (Archivo, `wdth 106`) + a **computed sentence**: "Saturday 15 August 2026. Two vehicles are on hire today and your next payout lands on Monday." + `Your vehicles` / `Add a vehicle` buttons |
| 3 | Action banner | red `#FDE7EA` strip: "2 vehicles need something from you" + the reviewer notes, `Open vehicle` |
| 4 | Four stat tiles | `PAID OUT THIS MONTH` · `ON HIRE NOW` · `BOOKINGS THIS WEEK` · `AWAITING PAYOUT`, each with a delta + note |
| 5 | **What you kept** | 6-bar column chart, `LAST 6 MONTHS · NET OF COMMISSION`, current month in `#0F23A8`, the rest `#C3CBF5` |
| 6 | **Bookings this week** | 3 rows: plate chip → vehicle, row → booking, status pill, `you keep / of gross` |
| 7 | **Your fleet** | 4 rows: plate, title, `✓ VERIFIED` badge, three doc bands, status pill, daily rate, `See all 7 vehicles` |
| 8 | **Next payout** | destination line, projected lines per booking, commission row, `You keep`, and the 24h-clearing footnote |
| 9 | Expiring card + **Recent activity** | amber-topped `EXPIRES IN 19 DAYS` insurance card; 5-item timeline with coloured dots |

Plus a toast (already have `components/portal/Toast.tsx`) and three
canvas-only props — `chartMonths` (3/6), `density`, `hideAmounts`.

---

## What already exists — audit before estimating

Verified against the services, not assumed.

| Block | Backing that exists today |
|---|---|
| 4 · `PAID OUT THIS MONTH`, `AWAITING PAYOUT` | `buildSummary` in `modules/payouts/service.ts:320` already computes `paid_this_month`, `next_payout` (runs **plus** uncut payable bookings), `clearing`, and `next_run_date` |
| 4 · `ON HIRE NOW` | `listBookings` `counts.on_hire`; `buildSummary` also derives `onHireCount` |
| 5 · chart | **`GET /merchant/payouts/statements`** (`service.ts:597`) already returns the last **six** Nairobi months with net totals — exactly the series the chart wants |
| 7 · fleet rows | `listVehicles` returns `counts` + serialized summaries with their documents; `DOC_STATE`, `DOC_ORDER`, `STATUS` all live in `components/portal/status.ts` |
| 8 · next payout | `buildSummary` gives the aggregate; `payableBookings` (`service.ts:181`) is the per-booking source the projected lines need |
| 9 · expiring | `vehicles.insurance_expiry` is real and `runExpiryNotificationSweep` (`modules/notifications/service.ts:305`) already scans it |
| 9 · activity | `GET /merchant/notifications` — a real feed with `kind`, body and timestamp |
| shell | `AppLayout` already fetches vehicles, bookings and the unread count; `ToastProvider`, `AppHeader`, `SideNav`, `P` styles all exist |

**Genuinely missing:**

- Any dashboard read at all — no `GET /merchant/dashboard`, no
  `openapi/merchant-dashboard.yaml`.
- A **date-windowed booking query**. `listBookings` filters by status
  bucket only; "bookings this week" needs an overlap-with-the-Nairobi-week
  window.
- **Projected payout lines.** `buildSummary` sums `payableBookings` but
  never exposes them individually, so block 8's rows have no source.
- **Soonest-expiring vehicle document.** The sweep finds them but nothing
  reads one back.
- Account-level document/approval state shaped for block 1.
- `Dashboard` in `SideNav`; `/` still redirects away.

---

## Decisions needed — these are why this is a plan, not a PR

### 1. One aggregate endpoint, or compose client-side?

Composing from the existing list endpoints looks free, but it is wrong:
those lists are **cursor-paginated**, so anything derived from `data`
(hire days, projected payout lines, the fleet's outstanding-document
count) would silently describe only the first page. `counts` is
whole-set, `data` is not.

**Recommendation: one `GET /merchant/dashboard`**, new contract file
`openapi/merchant-dashboard.yaml`, new `modules/dashboard/` (service +
routes) that *calls into the existing services* rather than re-querying.
Two hard rules:

- **It must not fork the payout maths.** Read `buildSummary` /
  `payableBookings` by exporting them, never by copying — a second copy
  of the payout rules is how the tile disagrees with `/payouts`, and
  `cutPayoutRun` being the single decider is a recorded decision.
- **It returns numbers and typed fields, never prose.** The greeting
  sentence, "13 hire days", "EXPIRES IN 19 DAYS" and the money strings
  are composed client-side — display formatting is a client concern
  (spec §2).

### 2. The computed greeting sentence

"Two vehicles are on hire today and your next payout lands on Monday" is
three facts stitched together, and each clause can be absent (nothing on
hire, nothing to pay out, day one with no vehicles).

**Recommendation:** build it client-side from
`{ on_hire_count, next_payout: { date, amount } }` with an explicit
clause-per-fact function and a real zero state ("Nothing on hire today.")
— not a template with holes in it.

### 3. The 3/6-month chart toggle, `density`, `hideAmounts`

All three are canvas *props* — knobs for previewing the design, not
product features. `hideAmounts` in particular is a privacy feature that
would need to persist somewhere.

**Recommendation: omit all three.** Ship the 6-month chart at
`Comfortable` padding. Same footing as the omitted WhatsApp toggle: don't
render a control that isn't backed.

### 4. The chart's empty and thin states

`listStatements` counts **cut runs only**. A merchant with no completed
payouts gets an empty chart; one with two months gets two bars scaled
against each other, which reads as a trend that isn't there. The design
has no state for either.

**Recommendation:** below three months of data, replace the chart with a
copy block ("Your first payouts will chart here") rather than drawing
misleading bars. Do **not** pad the series with synthetic zero months.

### 5. Block 1 — MERCHANT STATUS card

The design asserts "Company documents accepted … checked 12 Aug 2026".
That is `merchants.approved_at`, **which nothing sets** — there is no
admin portal. This is the same trap as the Settings `✓ VERIFIED` chip and
the fabricated `id_verified` badge.

**Recommendation:** render the *real* state — approved → the green card
verbatim; not yet → the neutral "documents in review" variant with no
tick and no date. Never a decorative green.

### 6. Block 8 — projected payout lines

The rows are per-booking projections of a run that hasn't been cut. The
design's third row (`Next run`, greyed) is a booking still on hire, i.e.
*clearing*, not payable.

**Recommendation:** expose payable and clearing bookings as two labelled
groups off the dashboard read, both derived from the existing helpers.
Keep the commission row as the **difference of the snapshot amounts**,
never `gross × COMMISSION_RATE` — the "line amounts are snapshots"
decision applies here too.

### 7. Block 3 — the action banner's copy

The design names both vehicles and their reviewer notes inline. Reviewer
notes are per-vehicle and can be long.

**Recommendation:** show the count plus at most two plates with truncated
notes, `Open vehicle` deep-linking to the single vehicle when there is
one and to `/vehicles?filter=needs_action` when there are several. Drive
it off `listVehicles`'s whole-set `counts.needs_action`, not the page.

### 8. Block 9 — Recent activity source

**Recommendation: reuse the notifications feed** (`limit=5`), mapping
`NOTIFICATION_KIND` → dot colour. Do not build a second activity stream
off `audit_log`: audit rows are an append-only compliance record, not
merchant-facing copy, and a second source would drift from the feed the
merchant can actually open.

### 9. Navigation

**Recommendation:** add `Dashboard` to `SideNav` as the first item (no
badge), point `/` at `<Dashboard />` instead of the `/vehicles` redirect,
and fix `SideNav`'s stale comment.

---

## Proposed scope

### Phase A — the read (backend)

1. `openapi/merchant-dashboard.yaml` — freeze `GET /merchant/dashboard`
   before writing the service.
2. Export `buildSummary` and `payableBookings` from
   `modules/payouts/service.ts`; export the clearing query too, or lift
   the three into one exported `payoutPosition(merchantId)` so both
   callers share it. No duplicated payout rules.
3. `modules/bookings/service.ts` — add a Nairobi-week overlap read
   (`pickup_at <= weekEnd AND dropoff_at >= weekStart`), returning hire
   days per booking. Nairobi boundaries via the existing day helpers;
   stored values stay UTC.
4. `modules/vehicles/service.ts` — a `soonestExpiringDocument(merchantId)`
   read over `vehicles.insurance_expiry`, sharing the sweep's threshold so
   the card and the expiry notification can't disagree about "expiring".
5. `modules/dashboard/{routes,service,schemas}.ts` — one authenticated
   `GET /merchant/dashboard` composing: merchant status, stat tiles,
   `statements` series, week bookings, first N fleet rows + counts,
   payout projection, expiring document, and the five newest
   notifications. Mount in the app router.
6. Tests: `modules/dashboard/__tests__/dashboard.test.ts` — merchant
   scoping (another merchant's data never leaks in), the payout figure
   **equalling** `/merchant/payouts`'s `next_payout` tile on the same
   fixture, an empty-account response that renders (no vehicles, no
   bookings, no runs), and the week window excluding a booking that ends
   the day before the Nairobi week starts.

### Phase B — the screen

7. `apps/merchant/src/lib/dashboard-api.ts` + `pages/Dashboard.tsx`,
   built from the extracted design's own inline styles. New keys go under
   a `dash*` prefix in `components/portal/styles.ts`; **reuse**
   `STATUS`, `BOOKING_STATUS`, `DOC_STATE`, `DOC_ORDER`,
   `NOTIFICATION_KIND` from `status.ts` rather than re-deriving the
   palettes the design's own `S`/`BAND` maps duplicate.
8. `SideNav` gains Dashboard (first, no badge) and its comment is
   corrected; `App.tsx` `/` → `<Dashboard />`.
9. Empty/zero states for every block, decided above: no vehicles, no
   bookings this week, nothing payable, no expiring document, fewer than
   three months of payout history.
10. Deep links: plate chip → `/vehicles/:id`, row → `/bookings/:id`,
    fleet row → `/vehicles/:id`, `See all` → `/vehicles`, activity item →
    `/notifications`, `Add a vehicle` → `/vehicles/new`.

### Deferred, and say so

- `hideAmounts` / `density` / 3-month chart (decision #3).
- Any "checked on <date>" approval copy until something sets
  `merchants.approved_at` (decision #5).

---

## Design facts to read literally

- Page `#FAFBFC`, `min-width:360px`. Body inner `max-width:1320px`,
  `gap:clamp(18px,2.6vw,30px)`, `flex-wrap:wrap`. Nav `flex:0 0 214px`,
  `position:sticky; top:20px` — **the existing shell already matches**;
  the dashboard is the `P.main` child.
- Two-column split below the tiles: main `flex:1.55; min-width:320px`,
  side `flex:1; min-width:290px`, `gap:16px`, both `display:grid; gap:16px`.
- Greeting `h1`: `font:600 clamp(25px,3.4vw,32px)/1.1 Archivo;
  font-variation-settings:'wdth' 106; letter-spacing:-.022em; color:#0B0F1A`.
  Stat values and `You keep`: `font:700 24px/1 Archivo; 'wdth' 108;
  font-variant-numeric:tabular-nums`. Card titles: `600 15px/1.2 Archivo`.
  The `wdth` axis needs the variable Archivo cut — already vendored.
- Stat grid: `repeat(auto-fit,minmax(190px,1fr)); gap:12px`. Tile
  `#FFFFFF / 1px #E4E7EC / var(--r-lg) / padding:16px 17px`; kicker
  `500 10px IBM Plex Mono; letter-spacing:.1em; color:#9AA2B0`.
- Chart: track `padding:20px 18px 16px; height:186px;
  gap:clamp(8px,1.6vw,18px)`. Bar height `24 + (net/peak)*92` px, radius
  `var(--r-sm) var(--r-sm) 0 0`. Current month `#0F23A8` / value
  `#0F23A8` / label `#333B4A`; others `#C3CBF5` / `#838C9B` / `#A7AEBB`.
- Plate chip: `padding:5px 10px; border:1.5px solid #0B0F1A;
  border-radius:var(--r-sm); font:600 13px/1.2 IBM Plex Mono;
  letter-spacing:.05em; tabular-nums`. Rows `padding:15px 18px;
  border-bottom:1px solid #F8F9FB`, hover `#FAFBFC`.
- Doc bands: `width:34px; height:4px; border-radius:999px`, colours
  missing `#E4E7EC` / accepted `#0B8A5B` / pending `#0F23A8` / rejected
  `#D81E32` — i.e. `DOC_STATE`, in `DOC_ORDER` (logbook, tracker,
  insurance).
- Next-payout card: commission row `border-top:1px dashed #E4E7EC` with
  the amount `600 #D81E32`; footnote strip `#FAFBFC`, dot `#C77400`, text
  `#8A5200`.
- Expiring card: `border:1px solid #F5D9A3` with a `height:5px;
  background:#C77400` bar — **and its own 14° skewed `18×5` `#D81E32`
  rule** beside the `EXPIRES IN…` kicker. That is a second skewed rule in
  view alongside the masthead's; it is the same documented exception the
  Vehicles reviewer-note card already takes, so keep it and note it. The
  amber top bar itself is **not** skewed.
- Activity timeline: `grid-template-columns:9px minmax(0,1fr); gap:12px`,
  9px dot with a `1px #F1F3F6` connector, item `padding-bottom:15px`,
  timestamp `400 11px IBM Plex Mono; letter-spacing:.03em; #A7AEBB`.

---

## Verification

1. `npm run test -w apps/api` — the new dashboard tests above, and the
   existing payouts suite still green (Phase A moves exports around).
2. `npm run typecheck` and `npm run lint` at the root — **both exit 0**.
   Lint has been clean since `3be7cd9`, so any new error is yours.
3. Browser on **port 5174** (`.env` pins `CORS_ORIGINS=http://localhost:5174`;
   any other port fails as an opaque "Failed to fetch"). Seed with the
   bookings, payouts and notifications dev-seeders, then check the
   dashboard's `AWAITING PAYOUT` tile against `/payouts`' own tile and the
   fleet counts against `/vehicles` — **the numbers must be identical.**
4. Sign in as a brand-new merchant and confirm every block has a real
   zero state and nothing renders `NaN`, `KES 0` where a projection is
   meant, or a green tick.
5. Confirm the Archivo `wdth` axis is live on the greeting with
   `getComputedStyle`, not a screenshot.

---

## Docs

- Add a **Dashboard** entry to CLAUDE.md's *Recorded product decisions*
  covering decisions #1–#9, especially the "no forked payout maths" rule
  and the omissions (#3, #5).
- Note the expiring card's skewed rule in the design-tokens section
  beside the existing Vehicles reviewer-note exception.
- Correct `SideNav`'s comment, which claims Dashboard/Notifications/
  Settings are unbuilt.
