# Admin — Merchants + vehicle review (Phase 3, slice 1)

> Revised after a second pass over the full console bundle, the brand
> tokens and the merchant portal's own conventions. The findings that
> changed the shape of this plan are in **Review findings** below.

## Progress

- **PR 1 · Admin foundation — DONE, verified.** Contract
  `openapi/admin-identity.yaml`; migration
  `20260907090000_create_admin_identity` (`admin_users` /
  `admin_sessions` / `admin_login_challenges`); `lib/jwt.ts`
  `signAdminAccessToken` / `verifyAdminAccessToken` (`aud: "ops"`, own
  `JWT_ADMIN_SECRET`); `middleware/require-admin.ts`;
  `modules/admin-auth/` (login → SMS 2FA → refresh → me → logout →
  own-audit); `scripts/create-admin.ts` + `npm run admin:create`; the
  `apps/admin` shell (masthead, role-gated `SideNav`, `ProfileMenu`,
  `ErrorBoundary`, self-hosted fonts, `SignIn` with the 2FA step,
  placeholder pages). Typecheck + lint clean; migration applied;
  `apps/api` suite green (17 files, 181 tests) with 13 new admin-auth
  tests; `admin:create` smoke-tested. CLAUDE.md updated.
  - **Local-DB note:** `cral_dev` was last migrated on
    `feature/portal-round-5-ratings`, so it carries a
    `20260906090000_create_ratings` record with no file on `develop`.
    `migrate.latest()` refuses (and hangs, because `migrate.ts` skips
    `db.destroy()` on the error path). Worked around by temporarily
    dropping the ratings migration file into the tree from that branch;
    removed after. A clean fix is a `develop` DB reset, or merging
    ratings.
- **PR 2 · Vehicle review — DONE, verified.** Contract
  `openapi/admin-vehicles.yaml`; migration
  `20260907100000_admin_vehicle_review` (`documents` review trail,
  `vehicles.review_assignee`, `platform_settings` + seed);
  `lib/platform-settings.ts`, `lib/vehicle-checks.ts`,
  `lib/dates.ts#nairobiDayStartUtc`; `modules/admin-vehicles/`
  (queue / case / assign / document decision / listing decision /
  document bytes); `apps/admin` screens
  `pages/vehicles/{Queue,Case}.tsx`, `components/console/status.ts`,
  `QueueSideCards`, `SideNav` footer wiring, `vehicles-api.ts`.
  `npm run seed:review-fleet`. Typecheck + lint clean; migration applied;
  `apps/api` suite green (18 files, 185 tests) with a leaner
  `admin-vehicles` suite (4 flows); browser-smoked end to end
  (sign-in → queue → case → assign → doc accept → request-changes modal),
  no console errors. CLAUDE.md updated.
- **PR 3 · Merchants lens — DONE, verified.** Contract
  `openapi/admin-merchants.yaml`; `modules/admin-merchants/` (list +
  file, keyset-cursor on `(waiting, id)`, whole-set counts);
  `lib/merchant-display.ts` (shared name/initials);
  `apps/admin` screens `pages/{Merchants,MerchantFile}.tsx`,
  `lib/merchants-api.ts`, plus the cross-links (queue row → merchant
  file, case "Open file" button, fleet rows → vehicle case). Typecheck +
  lint clean; `apps/api` suite green (19 files, 189 tests) with 4 new
  admin-merchants tests; browser-smoked (sign-in → merchants list → file
  → fleet row → case → "Open file" back), no console errors. CLAUDE.md
  updated.

**All three PRs of this slice are done.** Next Phase-3 work (own
sequencing): merchant-account approval, staff notification feed,
Settings, impersonation, audit reader, team management — see
`docs/plans/admin-phase-3.md`.

## What this covers

The first real admin surface: the **vehicle-review queue**, the
**per-vehicle case screen** with its decisions, and the **Merchants**
lens over that queue. Plus the foundation none of it works without —
admin auth, the ops-audience token, RBAC, and the `apps/admin` shell.

Design authority: `Cruz Admin Vehicles.dc.html` (four screens: queue,
case, merchant list, merchant file), `Cruz Admin Nav.dc.html`,
`Cruz Admin Profile Menu.dc.html`. Token authority:
`packages/ui/src/tokens.ts` / the brand PDF. Convention authority: the
merchant portal.

Extraction — the manifest shape differs from the merchant bundle (uuid →
filename lives in `__bundler/ext_resources`, entries are
`{mime,compressed,data}` base64):

```bash
node -e '
const fs=require("fs"),z=require("zlib"),p=require("path");
const s=fs.readFileSync(process.argv[1],"utf8");
const man=JSON.parse(s.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]);
const ext=JSON.parse(s.match(/<script type="__bundler\/ext_resources">([\s\S]*?)<\/script>/)[1]);
const name={}; for(const r of ext) if(r.id.endsWith(".dc.html")) name[r.uuid]=decodeURIComponent(r.id.replace(/^\.\//,""));
for(const [u,e] of Object.entries(man)){ if(!name[u]) continue;
  let b=Buffer.from(e.data,"base64"); if(e.compressed) b=z.gunzipSync(b);
  fs.writeFileSync(p.join(process.argv[2],name[u]),
    b.toString("utf8").replace(/<(script|style)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g,"")); }
' "$HOME/Downloads/Cruz Ride Auto - Admin Console.html" ./out
```

Branch off `develop`.

---

## Review findings — what the second pass changed

### 1. The brand doc says the ops console is dark. The canvas draws it light.

`packages/ui/src/tokens.ts` carries a dedicated ops palette with an
explicit rationale:

```
/** The admin (ops) console is dark by default — "compliance works long shifts". */
ops: { base:"#0B0F1A", panel:"#131A28", raised:"#1D2637",
       border:"#2A3346", muted:"#8C97A8", text:"#F2F5F9",
       primaryOnOps:"#2C46D8" }
```

**All twelve console screens are light** — `#FAFBFC` page, white cards,
`#1A1F2B` text, the merchant portal's exact surface. Not one ops-dark hex
appears anywhere in the bundle, and `color.ops` is **unused by any code in
the repo**.

This is precisely the class of mismatch CLAUDE.md warns about, so it is
not mine to settle silently. **Recommendation: ship light, and annotate
`tokens.ts`.** Reasons: CLAUDE.md's own split gives the canvas authority
over screens and the PDF authority over tokens, and a page background is
a screen decision; the canvas is internally consistent across twelve
screens and two of them (Payments, Invoices) render documents that want a
light ground; and a dark rebuild would be a from-scratch redraw of every
screen, not a palette swap. **If you want the dark ops surface, say so
now** — it changes every screen and belongs before a line is written, not
after.

### 2. The required-document set is a *setting*, not a constant

`Cruz Admin Settings.dc.html` → Review rules has a documents matrix:

| key | label | required |
|---|---|---|
| `logbook` | Logbook | **locked on** |
| `insurance` | Insurance certificate | **locked on** |
| `id` | Owner ID | toggleable |
| `dl` | Driving licence | toggleable — *"only for vehicles offered with a driver"* |
| `kra` | KRA PIN certificate | toggleable |
| `tracker` | Tracker certificate | toggleable — *"required over KES 8,000 a day"* |

Two of those carry **conditional** rules, and `chauffeured` and
`daily_rate_amount` both already exist on `vehicles`. My first draft
treated the doc set as a hardcoded three. That would make the Settings
screen unbuildable later without a rewrite of the review service.

**Resolution: a `platform_settings` table with seeded defaults and a typed
reader, built in this slice with no UI and no endpoints.** The review
service asks it what a given vehicle requires. Settings → Review rules
later becomes a UI over rows that already exist. Same is true of the two
below.

### 3. The two-day promise and the automatic checks are settings too

`reviewDays: 2` — *"Decision on a new vehicle. Merchants see this as a
promise the moment they submit."* The queue's 48h SLA colouring, the
overdue banner and the "past the two-day promise" copy all derive from
it. Not a constant.

The four automatic checks are individually toggleable (`plate`, `name`,
`dup`, `expiry`) — the same four the case screen renders. So
`showAutoChecks` is not merely a canvas preview knob; each check has a
real on/off. Same `platform_settings` home.

One caveat: **"Logbook name match" cannot be automatic.** It compares the
name *read off the logbook scan* against the account, and there is no OCR
in this product — the design's own doc modal shows a fabricated "Reader
confidence: HIGH". Build the other three for real (plate regex,
duplicate-plate via the existing normalised unique lookup, insurance
expiry via `assertNotPast`); render the name line as **context, not a
verdict** — the account name and the merchant's own declared name, side by
side, for the human to compare. Do not ship a green tick nothing computed.
Same rule as the fabricated `id_verified` badge.

### 4. Five of the six document lines already exist — split across two scopes

| Design line | Backend today |
|---|---|
| `logbook` | `documents.kind = 'logbook'`, per vehicle |
| `insurance` | `comprehensive_insurance`, per vehicle |
| `tracker` | `tracker_certificate`, per vehicle |
| `id` | `national_id` — **account-level** |
| `kra` | `kra_pin` — **account-level** |
| `dl` | **does not exist anywhere** |

Better than my first draft's "review three, ignore the rest": the case
screen shows **one checklist of every line that applies to this vehicle**,
because that is what *"Every line must be accepted before the listing can
go live"* means. The three vehicle docs are per-case; the two account docs
are the merchant's, so **accepting `national_id` once marks it accepted
across every case for that merchant** — which is both correct and the seed
of account approval later.

`dl` is **deferred**: the merchant portal never collects a driving licence,
so there is nothing to review. Adding it means merchant-side collection
first, gated on `chauffeured`. Its `platform_settings` row ships defaulted
**off** so the toggle exists the day the upload does.

### 5. Admin notifications are a separate staff feed — defer the bell

The masthead bell points at a staff stream (`New vehicle submitted`,
`SLA breach`, `Dispute filed`, `Invoice overdue`, `Payout run failed`),
categorised Vehicles / Disputes / Invoicing / Payouts. That is a second
notification system, unrelated to the merchant-facing `notifications`
table. Only two of its entries are generatable in this slice.

**Defer it.** The bell renders without a badge and is inert, flagged —
better than a fake count. Its two real generators (submission, SLA breach)
land with the staff feed in its own slice.

### 6. Audit log and Team are Settings tabs, not nav items

`Cruz Admin Settings.dc.html` tabs: `Review rules · Money · Communication
· Invoicing · Team · Audit log`. So the Phase-3 audit reader and admin
team management are **tabs inside Settings**, not the standalone nav
entries my Phase-3 doc assumed. Corrected there too.

Roles map cleanly to `identity.yaml` §8 — Owner → `admin_super`,
Finance → `admin_finance`, Reviewer → `admin_reviewer`, Support →
`admin_support`. Only the labels differ; use the design's labels in the UI
and the spec's slugs in the data.

### 7. `packages/ui` is unused — follow the merchant precedent, don't force it

`packages/ui` exports tokens, `StatusBadge`, `PlatedReference`, `Button`
and `StateScreens`, and **`apps/merchant` imports none of them.** It
inlines the canvas's own values into `components/portal/styles.ts`, with a
header comment saying they are literal reads "cross-checked against
`packages/ui/src/tokens.ts`". That is why the merchant screens match.

Do the same for admin: `apps/admin/src/components/console/styles.ts` and
`status.ts`, literal canvas values, cross-checked against tokens. Do not
spend this slice retrofitting `packages/ui` adoption — that is its own
piece of work and doing it here would put a refactor on the critical path
of a new portal.

Two concrete cross-check results, both **canvas wins, matching how the
merchant portal already resolved them**: radii are the canvas's
`--r-sm:4px --r:8px --r-lg:12px` (tokens says 6/10/14), and body ink is
`#1A1F2B` (the neutral ramp has `#0B0F1A`/`#333B4A`). The five status
tints are **identical** in both — no conflict there.

### 8. Fonts — copy the merchant's self-hosted setup, not the design's CDN link

Every console file carries a `fonts.googleapis.com` `<link>`. The merchant
portal deliberately does not (a CDN 503 during testing silently fell back
to a system sans and caused a rebuild). Copy `apps/merchant/src/fonts.css`
and its `@fontsource` dependencies across verbatim, including the
**wdth+wght variable Archivo cut** — the console leans on
`font-variation-settings:'wdth' 106/108` throughout and a wght-only build
renders it silently too narrow.

---

## What the design contains

### Queue (`isList`)
Masthead (4px `#0F23A8` strip, `ADMIN CONSOLE` pill, one 14° skewed
`22×6 #D81E32` rule, clock, bell, profile menu). Left nav 232px sticky +
**YOUR QUEUE** card (assigned to you, count past the promise) + **DECIDED
TODAY** card (approved / changes / rejected). Main: title, "Only mine"
toggle, "Review next", an overdue banner, filter chips (`Needs review /
With you / Changes sent / Approved / Rejected / All` with counts), then
`PLATE · VEHICLE·MERCHANT · STATE · DOCS · WAITING · REVIEWER`. The
merchant name in a row links to the merchant file. Oldest first.

### Case (`isDetail`)
Header: plate chip, status pill, age pill (`OVERDUE · 3d 4h WAITING` /
`… DUE TODAY` / `… IN TIME`), title, subline, listing ref, submitted-at.
Actions: **Approve & publish** (locked until every applicable line is
accepted), **Request changes**, **Reject**, **Assign to me**.
Left: **Documents** (Open scan / Accept / Reject per line, rejected rows
go pink), **Automatic checks**, **Photos**, **Declared details**.
Right: **The merchant** card (Account: Verified / Documents pending,
since, live count, past rejections, amber history strip) + "Open file",
**Case activity** timeline, **What the listing will say**.
Modals: approve (bullets + optional note + "sends an SMS"),
changes/reject (canned reason radios + a "what the merchant reads"
textarea + tint hint), doc viewer. Bottom toast.

### Merchants list + file (`isMerchants`, `isMerchant`)
List: `MERCHANT (avatar, name, VERIFIED / NEW MERCHANT badge, towns) ·
CONTACT · JOINED · FLEET · LIVE · WITH US (n waiting)`, most-waiting
first. File: header + badge + **Message merchant** + **Review <next
plate>**, four stat tiles, an amber note (either the not-verified line or
the rejection history), then **Their fleet**.

**The design states it outright:** *"Approving a vehicle does not verify
the business — those are two separate decisions."* Merchant-account
approval has no screen in this bundle and is **not** in this slice.
`merchants.approved_at` still moves only via `npm run approve:merchant`;
the `VERIFIED` badge reads it, read-only.

---

## Backend reconciliation

| Design | Backend today | Resolution |
|---|---|---|
| 5 review states `new / inreview / sent / live / rejected` | `vehicles.status` 7-state | Map `pending→new`, `review→inreview`, `action→sent`, `live`, `rejected`. `draft`/`paused` never enter the queue. No schema change. |
| Accept/Reject per doc line | `effectiveDocState` has the states but **nothing sets a reviewed one** — every doc reads "PENDING REVIEW" forever | New `documents.review_state` (`pending`/`accepted`/`rejected`) + `review_note`, `reviewed_by`, `reviewed_at`. `effectiveDocState` honours it; the merchant portal's existing `accepted`/`rejected` bands light up for real. |
| Configurable doc set, SLA, checks | hardcoded / absent | `platform_settings` (§2, §3). Seeded, typed reader, no UI this slice. |
| "Assign to me" / "assigned to you" | nothing | Nullable `vehicles.review_assignee` → `admin_users.id`. |
| "Decided today" | nothing | Count over `audit_log` (`vehicle.approved`/`.changes_requested`/`.rejected`, `actor_id = me`, Nairobi day). No new table. |
| Canned reason templates | n/a | Client-side constant, like the merchant portal's copy maps. The server stores only the free text sent. |
| "Paid verification badge is a separate step" | `verification_badge` axis exists | Out of scope — merchant-chosen, not an admin action. |

---

## Auth — the foundation

`identity.yaml` §8 is frozen: `aud: "ops"`, separate cookie domain,
**mandatory 2FA every login**, 10-min access token, 8h absolute cap,
20-min idle → re-2fa only. This slice builds only login → 2fa → me →
refresh → logout, plus RBAC. `impersonate`, team and the audit reader come
later.

### Decisions that gate the contract — recommendations as defaults

1. **Separate `admin_users` + `admin_sessions`.** §8's separate cookie
   domain, mandatory 2FA, 8h cap and distinct role enum all point away
   from reusing `users`; a compromise of the public auth path then cannot
   touch Ops, and `authenticate()` never branches on audience.
   `users.roles` stays the flat merchant/customer `text[]`.
2. **2FA over SMS** via the existing TextSMS adapter — consistent with the
   2026-08-24 decision. `otp_codes`, new purpose `admin_login`. TOTP is
   the alternative; §8 only says "6-digit code".
3. **First admin via `npm run admin:create`**, same footing as
   `approve:merchant`.
4. **Console ships light** (finding §1) — the one that changes the most if
   you disagree.

---

## Approach — three PRs, contract-first

Each is independently shippable and independently verifiable. The order is
chosen so the riskiest, least-visible work is proved first and the two
feature PRs stack cleanly on it.

### PR 1 · Admin foundation *(build this first)*

Auth, RBAC and the shell. No review features.

- `openapi/admin-identity.yaml` — reconcile §8 into a standalone contract.
  **Freeze before writing the service.**
- Migration: `admin_users` (`adm_` ULID, email, password_hash, phone,
  role, `assigned_queues text[]`, status, timestamps), `admin_sessions`
  (mirrors `sessions` + `user_agent` + absolute-cap column); `otp_codes`
  purpose `admin_login`.
- `modules/admin-auth/` — `login` → `{challenge_token, next:"2fa"}` (no
  tokens before 2fa, same shape as the merchant branch), `2fa` → ops
  `TokenPair`, `refresh` (idle + absolute rules), `me` (`AdminMe`),
  `logout` (immediate revoke + audit).
- `lib/jwt.ts` — `verifyAdminToken` pinning `audience:"ops"` +
  `algorithms:["HS256"]`; production boot check on `JWT_ADMIN_SECRET`.
- `middleware/require-admin.ts` — ops token **plus a live
  `admin_sessions` row** (the session-not-just-signature rule from the
  reliability PR) plus role/queue. `authenticate()` untouched.
- Rate-limit `login` and `2fa` per IP and per account (`trust proxy` is
  already set).
- `scripts/create-admin.ts` + `npm run admin:create`.
- `apps/admin`: `lib/api.ts` with ops refresh, `AppLayout` (masthead, nav,
  YOUR QUEUE / DECIDED TODAY cards), `ProfileMenu` (name, role, initials,
  email, session line, two-step logout confirm), `ErrorBoundary` and
  `usePageTitle` ported from merchant, `fonts.css` + `@fontsource` copied,
  `SignIn` + `TwoFactor`, role-gated routing off `me`.
- **Deliverable you can check:** create an admin, sign in with a real
  texted code, land on an empty console frame with working nav; a merchant
  token gets 401 on `/admin/*` and an ops token gets 401 on `/merchant/*`.
- **No canvas file exists for the login screens** — built in the console's
  own visual language and flagged.

### PR 2 · Vehicle review

The queue, the case screen, and the decisions. The core value.

- `openapi/admin-vehicles.yaml`, frozen first: `GET /admin/vehicles`
  (cursor-paged, `?state=&assignee=`), `GET /admin/vehicles/{id}`,
  `POST /admin/vehicles/{id}/documents/{kind}/{accept,reject}`,
  `POST /admin/vehicles/{id}/{approve,request-changes,reject}`
  (`Idempotency-Key`; `requireAdmin()` mounted **before**
  `requireIdempotencyKey()`, matching the merchant mounts),
  `POST /admin/vehicles/{id}/assign`.
- Migrations: `documents.review_state` + `review_note` + `reviewed_by` +
  `reviewed_at`; `vehicles.review_assignee`; `platform_settings` + seed.
- `modules/admin-vehicles/` — reads call the existing vehicles service;
  writes go through one `decideVehicleListing(trx, …)` that moves
  `vehicles.status`, writes `reviewer_note`/`_meta`, writes `audit_log`
  (`actor_type:"admin"`) **in the same transaction**, and
  `notify(trx, …)` the merchant — delivery enqueued **after commit**, the
  `submitVehicle` shape. One decider, no second copy of the rules.
- This becomes the **real generator** for the document-accepted/rejected
  and listing-approved/rejected notifications the merchant portal already
  renders and nothing currently produces.
- `lib/vehicle-checks.ts` — plate regex, duplicate registration, insurance
  expiry. Pure, unit-tested, advisory. Name-match renders as context, not
  a verdict (finding §3).
- `effectiveDocState` honours `review_state`; re-verify the merchant
  Vehicles + Dashboard screens still read correctly.
- `pages/vehicles/Queue.tsx` + `Case.tsx`, the four modals, the toast, the
  overdue banner, "Only mine", "Review next", prev/next case.
- **Deliverable:** submit a vehicle in the merchant app → it appears in
  the queue → accept its lines → Approve & publish → the merchant sees it
  live, with accepted doc bands and a notification.

### PR 3 · Merchants lens

Small once PR 2 exists — the same data, regrouped.

- `GET /admin/merchants` (cursor-paged: contact, joined, fleet, live,
  waiting, `approved_at` → badge, towns from vehicle counties) and
  `GET /admin/merchants/{id}` (stats, history note, their fleet).
  **Counts must be whole-set, not page-bound** — the same trap the
  merchant dashboard hit.
- `pages/Merchants.tsx` + `MerchantFile.tsx`.
- "Message merchant" renders **disabled with a reason** (needs
  Communications), not a fake send.

### Deferred, and said out loud
Merchant-account approval · the staff notification bell · Settings
(including the UI over `platform_settings`) · `impersonate` · audit reader
· team management · the `dl` document · every other nav entry (Analytics,
Bookings, Disputes, Finance, Communications) as a stub.

---

## Design facts to read literally

- Page `#FAFBFC`, `min-width:360px`, ink `#1A1F2B`. Masthead: 4px
  `#0F23A8` strip; white bar `border-bottom:1px #E4E7EC`,
  `padding:13px clamp(16px,3vw,32px)`; inner `max-width:1420px`.
  `ADMIN CONSOLE` pill `#F1F3F6`, `font:500 11px 'IBM Plex Mono'`,
  `letter-spacing:.09em`; then the single skewed rule
  `22×6 #D81E32; transform:skewX(-14deg)` — **once per surface.**
- Body `padding:clamp(18px,3vw,28px) clamp(16px,3vw,32px) clamp(40px,6vw,64px)`,
  inner `max-width:1420px`, `flex; gap:clamp(18px,2.6vw,30px);
  align-items:flex-start; flex-wrap:wrap`. Nav `flex:0 0 232px;
  position:sticky; top:20px`. Main `flex:1; min-width:300px`.
  (Merchant is 1320/214 — the console is wider.)
- Radii `--r-sm:4px --r:8px --r-lg:12px`.
- YOUR QUEUE card `#F1F3F6`, `var(--r-lg)`, `padding:14px`, its own skewed
  `18×5 #D81E32` rule beside a mono kicker, count `font:700 26px/1 Archivo;
  'wdth' 108; tabular-nums`. **That is a second skewed rule in view beside
  the masthead's** — the same documented exception the merchant Vehicles
  reviewer-note card and the Dashboard expiring card already take. Keep it
  and note it.
- Status map `S`: `new` `#C77400`/`#FFF3DB`/`#F5D9A3`/`#8A5200`;
  `inreview` `#0B7BC1`/`#E1F1FA`/`#A9D6EE`/`#075D93`; `sent` `#838C9B`/
  `#F1F3F6`/`#E4E7EC`/`#5A6373`; `live` `#0B8A5B`/`#DDF3E9`/`#A8DEC7`/
  `#076945`; `rejected` `#D81E32`/`#FDE7EA`/`#F7BDC5`/`#A50E22`. These are
  `tokens.ts`'s five status tints exactly — reuse the merchant `status.ts`
  values, do not re-derive.
- Doc dots `DS`: pending `#C77400`, ok `#0B8A5B`, rejected `#D81E32`,
  missing `#E4E7EC`.
- SLA age: `>48h` red `#FDE7EA`/`#A50E22` "OVERDUE · Nd Nh WAITING";
  `>30h` amber `#FFF3DB`/`#8A5200` "… DUE TODAY"; else grey `#F1F3F6`/
  `#5A6373` "… IN TIME". **48 and 30 derive from `reviewDays`** — 30h is
  "due today" against a 2-day promise, so compute both, don't hardcode.
- Plate chip `padding:6px 12px; border:1.5px solid #0B0F1A;
  border-radius:var(--r-sm); font:600 17px 'IBM Plex Mono';
  letter-spacing:.05em; tabular-nums` (case header; `13px` in rows).
- Headings Archivo `'wdth' 106`; stat values `'wdth' 108`.
- Timeline `grid-template-columns:14px minmax(0,1fr); gap:12px`, 9px dot,
  `#E4E7EC` connector, timestamp mono 11px `#838C9B`. `TONE` dots: grey
  `#E4E7EC`, blue `#0B7BC1`, green `#0B8A5B`, amber `#C77400`, red
  `#D81E32`.
- Modal CTAs: reject `#D81E32`, approve `#0B8A5B`, changes/doc `#0F23A8`.
  Reason hint tint: reject `#FDE7EA`, changes `#FFF3DB`.
- Motion `120ms cubic-bezier(.2,.8,.25,1)` — matches `tokens.motion`.

---

## Verification

1. `npm run test -w apps/api` — new suites per PR, and the existing
   vehicles / notifications / dashboard suites still green (PR 2 changes
   `effectiveDocState` and adds a real notification generator).
2. `npm run typecheck` + `npm run lint` at the root — both exit 0.
3. Browser on **port 5175**. `.env` `CORS_ORIGINS` must include
   `http://localhost:5175` or every call fails as an opaque "Failed to
   fetch" — the merchant app hit exactly this on 5174.
4. Cross-audience: a merchant token gets 401 on `/admin/*`, an ops token
   gets 401 on `/merchant/*`, both in the standard error envelope.
5. End to end across both portals: merchant submits → admin queue shows
   "Needs review" → accept the lines → Approve & publish → merchant sees
   `live`, accepted doc bands, and a notification. Request changes on
   another → merchant sees `action` and the reviewer note **verbatim**.
6. Archivo `wdth` axis live via `getComputedStyle`, not a screenshot;
   Chrome window non-minimized or `innerWidth` reads 0.

---

## Docs

- CLAUDE.md **Recorded product decisions**: the admin identity store,
  ops-audience/RBAC, the light-vs-dark ops resolution (§1), the
  `platform_settings` seam (§2, §3), the one-checklist doc model with
  account docs carrying across cases (§4), `documents.review_state` ending
  "PENDING REVIEW forever", admin decisions as the real notification
  generator, and every deferral.
- A short **Admin console** section under Design tokens: this bundle's
  extraction recipe, the masthead rule, the second skewed-rule exception,
  port 5175, and that the login screens are not from a canvas file.
- `docs/plans/admin-phase-3.md`: correct the Audit-log and Team slices to
  Settings tabs (finding §6).
- Annotate `packages/ui/src/tokens.ts`'s `ops` palette with whatever §1 is
  resolved to.
