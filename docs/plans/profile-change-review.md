# Profile change review - admin side

## What shipped now (merchant portal)

Once `merchants.onboarding_submitted` is true, the Settings -> Business /
"My profile" fields are read-only. A merchant edits them by pressing
**Request a change**, which captures a `profile_change_requests` row:

| column | notes |
|---|---|
| `id` | `pcr_` ULID |
| `merchant_id` | FK -> merchants, cascade |
| `requested_by` | FK -> users, cascade |
| `status` | `pending` / `approved` / `rejected`; partial unique index keeps one `pending` per merchant |
| `changes` | jsonb `{ field: newValue }` - only fields that differ from what's on file |
| `reviewer_id`, `reviewer_note`, `decided_at` | filled on decision |

Endpoints (`openapi/merchant-settings.yaml`):

- `PATCH /merchant/profile` - 409 `profile_locked` once submitted.
- `POST /merchant/profile/change-request` - create/replace the pending row.
- `GET /merchant/profile/change-request` - the pending row or null.
- `DELETE /merchant/profile/change-request` - withdraw.
- `GET /merchant/profile` also carries `profile_locked` + `pending_change`.

Decisions run through `reviewProfileChange(requestId, decision,
reviewerId, note)` in `modules/merchant/service.ts`:

- **approve** - apply `changes` to `merchants` in one transaction (phone
  goes through `setUserPhone`), set `merchants.approved_at = null` so the
  account goes back to review, mark the row `approved`, audit
  `merchant.profile_change_approved`.
- **reject** - mark `rejected` with the note, audit
  `merchant.profile_change_rejected`. Nothing on `merchants` moves.

Until the admin portal exists this is reachable only via
`npm run review:profile-change -w apps/api -- <id> approve|reject [note]`
(lists pending requests with no args). Same footing as
`approve:merchant`.

## What the admin portal adds (its own phase)

1. **List / detail**
   - `GET /admin/profile-change-requests?status=pending&cursor=` -
     cursor-paged (spec §2), newest first, joined to a merchant summary
     (name, `approved_at`, listing count).
   - `GET /admin/profile-change-requests/{id}` - the row plus a
     before/after view: current merchant value vs requested value per
     field, and links to the account documents the field is checked
     against (national ID, KRA PIN certificate, CR12).

2. **Decide**
   - `POST /admin/profile-change-requests/{id}/approve` and `.../reject`
     (body `{ note }`), each `Idempotency-Key`-guarded (spec §2 - a
     double-click must not double-apply), calling the existing
     `reviewProfileChange`. Admin identity comes from the admin session,
     not a string.
   - Approving must also **re-open the vehicle review queue** if the
     changed field is one a listing shows (owner/company name): today
     approve only nulls `merchants.approved_at`; the admin flow should
     additionally flip affected `live` vehicles back to `review` with a
     system event, so a name that no longer matches a logbook can't stay
     public. Needs a `vehicles` helper + an `appendVehicleEvent` call.

3. **Notifications**
   - On decision, `notify(trx, {...})` a `doc`-kind notification to the
     merchant ("Your profile change was approved / needs another look")
     inside the same transaction, delivery enqueued after commit - the
     same shape as `submitVehicle`'s review-queue notice. The merchant
     portal already renders `doc` notifications.

4. **Audit / retention**
   - The `merchant.profile_change_{requested,approved,rejected,withdrawn}`
     audit actions are already written. The admin console's own
     action log reads them; no new table.

5. **Edge cases to handle in the admin flow**
   - A merchant withdrawing while an admin has the detail open -> the
     approve/reject call 404s `no_pending_change`; show "withdrawn by the
     merchant".
   - `owner_type` in `changes` (individual <-> company): approving this
     needs the company/personal document set re-checked, so treat it as
     always requiring a fresh document review, not just a field swap.
   - Phone changes clear `phone_verified` on apply (via `setUserPhone`) -
     the merchant then re-verifies from the profile tab as normal.
