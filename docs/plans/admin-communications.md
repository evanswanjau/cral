# Admin Communications — Bulk Email/SMS, Templates, Logs

> **BUILT 2026-09-16.** The owner pointed at the side menu directly
> ("there a communications on the side menu that has bulk email, templates
> and logs") after an earlier scoping pass had missed the screen entirely.
> Pulled `Cruz Admin Communications.dc.html` from the design bundle and
> built from the literal source, per CLAUDE.md's "don't eyeball, extract
> the real file" rule.

## What the design contains

One screen, three pill tabs (`Bulk Email/SMS` / `Templates` / `Logs`), and
a nav group ("Communications", from `Cruz Admin Nav.dc.html`'s own `kids`
list) with one child per tab.

- **Bulk Email/SMS** — audience dropdown (All merchants / Verified only /
  Pending review / Companies / Insurance expiring in 30 days / A single
  merchant), each with a live count and an SMS opt-out note; a channel
  toggle (SMS / Email / SMS+Email); subject (email only); a message
  textarea with a character/segment counter; quick-start template chips;
  Send + Schedule buttons; a preview card; an estimated-cost card
  (KES 0.80/SMS segment, email free).
- **Templates** — a table of the platform's own automatic messages
  (read-only) plus manual ones an admin writes, each with a channel,
  trigger badge, last-used date and use count. Clicking a row jumps to
  compose, pre-filled.
- **Logs** — four stat tiles (sent this month, delivery rate, SMS spend,
  opt-outs) plus a table of every send.

## Resolutions — where the build departs from the design's own fixtures

1. **A bulk send does not go through `notify()` / the merchant
   `notifications` table.** That pipeline is per-category, respects each
   merchant's own channel preference and quiet hours, and is modelled
   around real product events (a booking, a payout) — see
   `openapi/merchant-notifications.yaml`. This is a deliberate admin
   broadcast with its own audience and channel controls, so it calls the
   SMS/email adapters directly (`jobs/comms-bulk-send.ts`), the same
   adapters `notification-delivery.ts` uses, independent of a merchant's
   notification preferences. It does honour a new `merchants.sms_opt_out`
   column — nothing sets it yet (no merchant-portal toggle exists), so
   every SMS-eligible merchant is reachable today. Same footing as
   `merchants.approved_at` before account approval existed.
2. **"Automatic" templates are derived, not the design's fabricated
   four-row list.** The design's fixture names four automatic templates
   with fake usage numbers. The build instead lists one row per *real*
   `NotificationCategory` (`lib/notifications.ts`'s `NOTIFICATION_
   CATEGORIES` — booking, payout, review, expiry, return, rating), with
   real usage counts and last-sent dates pulled from the `notifications`
   table. Honest, and it can never drift from what the platform actually
   sends — same reasoning as PR 2's refusal to fabricate a logbook
   name-match check.
3. **Audiences resolve against live data**, not the design's static
   214/96/5/12/34 fixture: `all` (every merchant), `verified` /
   `pending` (`merchants.approved_at` set / null — the same flag the
   `✓ VERIFIED` chip reads everywhere else), `companies`
   (`owner_type = 'company'`), `expiring` (a vehicle's comprehensive-
   insurance document expiring within `EXPIRING_WITHIN_DAYS` — the exact
   window the Dashboard's expiring-document card and the expiry-
   notification sweep already use, so "expiring" can't disagree across
   the app).
4. **One BullMQ job per run, not one per recipient.** `sent_count` /
   `failed_count` are written once, at the end, from a single job — no
   concurrent-increment race to guard against, and a run's recipient list
   (at most a few hundred merchants) comfortably fits one job's working
   set.
5. **`admin_super` only**, same reach as Team — real money spent on SMS,
   every merchant contactable in one send.
6. **"Schedule" is omitted.** The design shows it next to Send with no
   backing scheduler anywhere in this codebase. Faking the button would
   fabricate a capability; it's left out rather than wired to nothing.
7. **No merchant picker for "A single merchant" in the general case.**
   Arriving from a merchant file's "Message merchant" button pre-fills it
   (`?merchant=&name=`); typing an id manually is the fallback otherwise.
   A real picker (search-as-you-type) is a follow-up, not blocking this
   slice.

## Contract, code, tests

- `openapi/admin-communications.yaml` (frozen first).
- Migration `20260916090000_admin_communications.ts` — `comms_templates`,
  `comms_runs`, `merchants.sms_opt_out`.
- `apps/api/src/modules/admin-comms/` (service/routes/schemas/db-types),
  `apps/api/src/jobs/comms-bulk-send.ts`, `lib/dates.ts#nairobiMonthStartUtc`
  (new — "sent this month", same reasoning as `nairobiDayStartUtc`).
- `apps/admin/src/pages/Communications.tsx` + `lib/comms-api.ts`.
  `SideNav` gained collapsible-group support (`Communications` is the
  first one built; `Finance` in the design uses the same shape for later).
- MerchantFile's "Message merchant" button is real now — it was disabled
  with a "Ships with Communications" tooltip since PR 3; it now deep-links
  into compose with that merchant pre-selected.
- Tests: `modules/admin-comms/__tests__/admin-comms.test.ts` — RBAC,
  live audience counts, automatic + manual templates, the `merchant_id_
  required` / `empty_audience` / `Idempotency-Key` guards on send, a run
  showing up in the logs with real stats, and the bulk-send job itself
  (called directly, since workers don't run in the test process) marking
  a run `done` over the console adapter.

## Deferred, said out loud

A real merchant search/picker for "single" sends; a "Money" / "Invoicing"
counterpart to this Settings-tab-shaped screen; scheduled sends; per-
recipient delivery detail (today a run is an aggregate: recipient/sent/
failed counts, not a row per merchant); a merchant-portal toggle that
actually sets `sms_opt_out`.
