# Merchant Portal — Settings

## Context

Settings is the last screen in the merchant design that hasn't been built.
Two slices of it already exist as **unlisted routes**, built when the
feature that needed them landed:

- `/settings/security` — 2FA enrol/disable only (2026-08-31)
- `/settings/notifications` — the Alerts matrix + quiet hours (2026-09-02)

The design authority is `Cruz Merchant Settings.dc.html` (embedded
gzip+base64 in `~/Downloads/Cruz Ride Auto - Merchant App.html`; extract
it, don't eyeball the screenshots). It is a **single tabbed page** — five
tabs (`Business · Payouts · Alerts · People · Security`) with a shared
sticky "Unsaved changes on this page" save bar, an `ACCOUNT` side card
carrying a `✓ VERIFIED` chip and "merchant since <date>", and a
"Back to dashboard" button.

`Alerts` is done (shipped as **Notifications**, per the 2026-09-02
naming call). This plan covers the other four plus the shell.

Branch off `develop`.

---

## What already exists — audit before estimating

Considerably more than CLAUDE.md implies. Verified against the migrations
and routers, not assumed.

**API endpoints already live:**

| Need | Endpoint | Status |
|---|---|---|
| Change password (authenticated) | `POST /auth/password/change` | exists |
| List sessions (knows the current one) | `GET /auth/sessions` | exists |
| Revoke one session | `DELETE /auth/sessions/:id` | exists |
| 2FA state / enrol / verify / disable | `GET\|POST\|DELETE /auth/2fa*` | exists + UI |
| Phone verification | `POST /auth/phone/verification/{start,confirm}` | exists + UI |
| Monthly statement | `GET /merchant/payouts/statement?month=` | exists (**CSV**) |

**Columns already on `merchants`** (from the original
`20260825182818_create_merchants` migration):
`owner_type`, `company_name`, `company_cert_no`, `company_kra`,
`company_email`, `company_address`, `first_name`, `middle_name`,
`surname`, `national_id`, `kra_pin`, `payout_same`, `payout_method`
(`"mpesa" | "bank"`), `payout_detail`, **`bank_name`, `bank_branch`,
`bank_account_name`, `bank_account_number`**.

**`sessions` already carries** `device_id`, `device_label`, `ip`,
`user_agent`, `last_seen_at`, `revoked_at`, `revoked_reason` — enough to
render the design's "Samsung A34 · Nairobi / CHROME MOBILE · ACTIVE NOW"
rows without a schema change.

> **CLAUDE.md correction needed.** The payouts section claims "no bank
> fields exist anywhere in the schema (`payout_method` is `mpesa`
> throughout)". That is wrong — the four bank columns have been there
> since day one and `payout_method` already accepts `"bank"`. Fix that
> line as part of this work; it materially understates how close the
> Payouts tab is.

**Genuinely missing:**

- `merchants.trading_name`
- Any merchant profile write endpoint — there is only
  `PATCH /merchant/onboarding`; no `/merchant/profile`
- Document kinds for `certificate_of_incorporation` and `cr12`
  (`DocumentKind` is `national_id | kra_pin | logbook |
  comprehensive_insurance | tracker_certificate | vehicle_photo |
  handover_photo`)
- Long-booking payout rhythm (weekly/monthly instalments) — no column,
  and nothing in bookings or payouts implements instalments at all
- **Everything** behind the People tab: no team table, no invites, no
  per-merchant membership, no role authorization. `users.roles` is a
  `text[]` defaulting to `{customer}` and is only ever
  `merchant`/`customer`/`admin`
- "Sign out everywhere" (revoke-all-but-current)
- Close account
- `merchants.county` — **deliberately dropped** by
  `20260831090200_vehicle_county`

---

## Conflicts between the design and recorded decisions — need a call

These are the reason this is a plan and not a PR. Each one is the design
asking for something a prior decision took away, or something nothing
real can back yet.

### 1. County on the business (design: Business tab has a County select)

`merchants.county` was dropped on 2026-08-31 — "the location a hirer
cares about is the vehicle's, not the merchant's home county". The design
predates that.

**Recommendation: omit.** Keep the decision; vehicles carry county. Don't
re-add a column the codebase deliberately removed and nothing reads.

### 2. Business type (design: Limited company / Sole proprietor / Partnership)

`owner_type` is a two-value axis (`individual | company`) and it *gates
onboarding requirements* — company merchants must supply
`company_email` + `company_address` at submission.

**Recommendation: don't add a third field.** Relabel the existing axis
("Sole proprietor" → `individual`, "Limited company" → `company`) and
drop Partnership, or add `business_structure` as a display-only nullable
string that never gates anything. The first is simpler and keeps one
source of truth for the gate.

### 3. Bank payout destination

Now clearly buildable — the columns exist. But: **there is no payment
rail at all**, and Daraja B2C pays M-Pesa, not banks. Collecting bank
details would mean a merchant can select a destination that nothing can
ever disburse to, which is worse than the current honest read-only card.

**Recommendation: make the M-Pesa side writable, leave bank selectable
but gated behind a clear "bank payouts aren't live yet" state** — or keep
the whole card read-only until a rail exists. Your call; I'd take the
second, on the same reasoning that dropped the WhatsApp toggle.

### 4. Statements: PDF vs CSV

The design's Statements card says `NET OF COMMISSION · PDF` with a
monthly amount and a Download button. You decided 2026-09-01 that the
**receipt is a PDF and the statement is CSV**.

**Recommendation: keep CSV**, relabel the card, and reuse
`GET /merchant/payouts/statement`. It does need a new read to populate
the monthly amounts — today nothing returns "net paid per month".

### 5. Long-booking payout rhythm

Nothing implements instalment payouts. Storing the preference would be a
toggle that changes nothing.

**Recommendation: omit**, or store-and-flag it the way unreachable payout
statuses were. Do not render it as if it works.

### 6. People / roles — the big one

This isn't a settings screen, it's a multi-user authorization feature:
invite by email/SMS → accept → membership scoped to one merchant → three
roles with real permission differences ("Only the owner can change payout
details", yard staff restricted to assigned vehicles) → every existing
endpoint re-checked against the caller's role.

**Recommendation: cut it from this build entirely** and give it its own
phase. Shipping the roster read-only would be fabricating trust exactly
the way the hardcoded `id_verified` badge did.

### 7. Close account

Needs a product definition before code: what happens to live listings,
in-flight bookings, an uncut payout, and the seven-year retention the
design's own copy promises.

**Recommendation: not self-service.** A "contact support to close" path,
or defer.

### 8. WhatsApp toggle (Business tab, "WhatsApp is the same number")

**Recommendation: omit**, consistent with the 2026-09-02 decision to drop
the WhatsApp column from the Alerts matrix.

### 9. Settings shell architecture

The design is one tabbed page. Today there are two unlisted routes and
no Settings entry in `SideNav`.

**Recommendation: build the tabbed shell at `/settings`**, fold the two
existing screens in as the `Notifications` and `Security` tabs, keep
`/settings/security` and `/settings/notifications` working as redirects
to `/settings?tab=…`, and add Settings to `SideNav` (no badge).

---

## Proposed scope

Assuming the recommendations above, in dependency order.

### Phase A — the shell + Security (smallest, highest confidence)

Everything here is backed by endpoints that already exist.

1. `apps/merchant/src/pages/Settings.tsx` — tabbed shell, `?tab=` in the
   URL, the `ACCOUNT` side card, the sticky unsaved-changes save bar as a
   shared component (`components/portal/SaveBar.tsx`), "Back to
   dashboard".
2. Fold `SecuritySettings.tsx` in as the Security tab and add the two
   pieces it's missing: **Password** row → `POST /auth/password/change`,
   and **Where you are signed in** → `GET /auth/sessions` +
   `DELETE /auth/sessions/:id`.
3. Fold `NotificationSettings.tsx` in as the Notifications tab
   (rename its heading; the matrix itself is unchanged).
4. New: `POST /auth/sessions/revoke-all` (all but the caller's current
   `sid`) for "Sign out everywhere". Extend `openapi/identity.yaml`.
5. `SideNav` gets Settings; `App.tsx` gets `/settings` + redirects.
6. Close-account card renders per the design but its button opens a
   support/WhatsApp path, not a delete.

### Phase B — Business tab

7. Contract: new `openapi/merchant-settings.yaml` (or extend
   `merchant-onboarding.yaml` — prefer a new file, this is a different
   audience and lifecycle) with
   `GET|PATCH /merchant/profile`.
8. Migration: `merchants.trading_name` (nullable). No county. No
   business_structure unless you overrule #2.
9. Service: `getProfile` / `patchProfile` in
   `modules/merchant/service.ts`, writing an `audit_log` row in the same
   transaction. **Changing the phone must route through the existing
   `setUserPhone`** so E.164 normalisation and the `phone_verified`
   reset both still happen — spec §10's verification gate depends on it,
   and a naive update here would silently unverify or bypass it.
10. Business documents card: decide #4 on document kinds first. If yes,
    add `certificate_of_incorporation` + `cr12` to `DocumentKind`, and
    give CR12 the expiry treatment (the design shows
    "Older than 12 months → Renew"), reusing
    `lib/dates.ts#assertNotPast`.

### Phase C — Payouts tab

11. `GET /merchant/payout-settings` + `PUT` for method/M-Pesa/bank,
    honouring decision #3.
12. Statements card needs "net paid per month" — extend the payouts
    summary or add `GET /merchant/payouts/statements` returning the last
    N months with totals. Reuse the existing CSV download.
13. Fees-and-deposits card is static copy — but it must not restate the
    commission rate as a figure (contract note in
    `merchant-payouts.yaml`), and it must not show the hirer's deposit as
    the merchant's money (2026-08-31 decision).

### Deferred to their own builds

- **People / roles / invites** (decision #6)
- **Long-booking instalments** (decision #5)
- **Self-service account closure** (decision #7)

---

## Design facts to read literally

Extract the file and take values from it. The shell:

- Tab pill: `height:38px; padding:0 15px; border-radius:999px;
  font:600 13px/1 'Instrument Sans'`; active `bg #0B0F1A / fg #FFFFFF /
  border #0B0F1A`, idle `bg #FFFFFF / fg #333B4A / border #CDD2DA`.
  Tab strip has `padding-bottom:14px; margin-bottom:18px;
  border-bottom:1px solid #E4E7EC`.
- Save bar: `position:sticky; bottom:0; background:#FFFFFF;
  border-top:1px solid #E4E7EC;
  box-shadow:0 -6px 24px -12px rgba(11,15,26,.28); padding:12px
  clamp(16px,3vw,32px); z-index:50`. Dot `#C77400`, label
  "Unsaved changes on this page" in `#8A5200`. Discard = outline button,
  Save = `#0F23A8` → hover `#0B1B85`, both `height:40px`.
- Two-column body: `flex:1.6 / min-width:320px` main,
  `flex:1 / min-width:280px` side, `gap:16px`, both `flex-wrap:wrap`.
- Card chrome, head, and sub are the same values already in
  `P.ntMatrix` / `P.ntCardHead` / `P.ntCardTitle` / `P.ntCardSub` —
  **reuse them**, and rename the `nt*` keys to a neutral `set*` prefix
  when they turn out to be shared (Notifications was just the first tab
  built).
- Close-account card is the one red-topped card: `border:1px solid
  #F7BDC5` with a `height:5px; background:#D81E32` bar. That bar is
  **not** skewed — don't add the 14° rule here; the masthead already
  spends it.
- `ACCOUNT` side card: `✓ VERIFIED` chip `bg #DDF3E9 / border #A8DEC7 /
  color #076945`. Only render it when the merchant is genuinely
  approved — `merchants.approved_at`, which nothing sets yet (no admin
  portal). **Show a real state, not a decorative tick.**

---

## Verification

1. `npm run migrate -w apps/api`, then `migrate:rollback` and re-apply.
2. `npm run test -w apps/api` — new `__tests__/settings.test.ts`:
   profile round-trips and is merchant-scoped; a phone change goes
   through `setUserPhone` (normalised to E.164, `phone_verified`
   cleared); a duplicate phone still returns `phone_taken` (409);
   `revoke-all` kills every session **except** the caller's and returns a
   count; password change revokes other sessions; audit rows land in the
   same transaction as each change.
3. `npm run typecheck` and `npm run lint` at the root — **both must exit
   0.** As of `3be7cd9` lint is clean, so any new error is yours.
4. Browser on **port 5174** (`.env` pins
   `CORS_ORIGINS=http://localhost:5174`, so anything else fails as an
   opaque "Failed to fetch"): every tab, the save bar appearing only when
   dirty, discard actually reverting, a session revoke removing its row,
   and the old `/settings/security` URL redirecting.
5. Confirm type against the design with `getComputedStyle`, not a
   screenshot.

---

## Docs

- Append a "Settings" entry to CLAUDE.md's **Recorded product decisions**
  covering whichever of the nine calls above you make.
- **Fix the incorrect bank-fields claim** in the payouts section.
- If People is deferred, say so explicitly in the same place the
  WhatsApp and `tips` omissions are recorded — a missing tab that the
  design shows needs a reason on file.
