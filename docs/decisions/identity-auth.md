# Identity and auth (public side: merchants and renters)

Read before touching sign-up, sign-in, 2FA, phone verification, sessions
or account status. The Ops console's separate identity is in
`admin-ops.md`. Contract: `openapi/identity.yaml` (rewritten to match the
decisions below, so it is the source of truth again).

## Sign-up and sign-in

- **Sign-up is email + password only** (owner's call, 2026-08-26). Full
  name and phone are collected later, the phone at payout setup where the
  reason is self-evident. An SMS round-trip in front of someone who hasn't
  seen the product is a hard gate, and SMS costs money per send, so you'd
  pay for tyre-kickers. A deliberate deviation from spec §4 ("phone is the
  identity"). Both contacts are still required before an account can
  transact; `GET /auth/registration-state` reports what's outstanding and
  drives the "finish setting up" banner. `users.phone` and
  `users.full_name` are nullable. A duplicate sign-up names the clashing
  field.
- **Sign-in is email + password (or Google) only.** No passwordless SMS
  tab: a phone may not be on file at all.
- **Forgot password always emails a link.** `POST /auth/password/forgot`
  (`channel_hint` is the constant `"email"`); `/auth/password/reset{,/check}`
  take a `token` and nothing else. `/reset-password` only works from the
  link's `?token=`. A renter's link opens on the customer site, a
  merchant's on the merchant portal.
- One-time codes are entered as one box per digit, in all three portals.

## What SMS is for

SMS costs money per send, SIM-swap is a real attack in Kenya, and a texted
code is a poor primary credential. So SMS is **never** used for password
reset, passwordless login or sign-up. It is used for:

1. the opt-in sign-in second factor (below);
2. one-time proof of the payout phone at onboarding (below);
3. notifications, per the merchant's channel preferences
   (`merchant-portal.md`);
4. Ops 2FA and Ops bulk SMS (`admin-ops.md`).

Everything else goes by email.

## SMS second factor

- **It's a switch**: Settings -> Security -> "SMS code at sign-in"
  (`pages/settings/SecurityTab.tsx`). On calls `POST /auth/2fa/enable`,
  which points the factor at the already-verified `users.phone` and
  returns `{ enabled: true }`. Off (`DELETE /auth/2fa`) needs the
  **password only** (a texted code is still honoured if supplied).
- **There are no recovery codes** (owner's call, 2026-09-04). The sign-in
  fallback is an emailed code -
  `POST /auth/2fa/challenge/resend { challenge_id, channel: sms|email }` -
  then support. The `recovery_codes` table stays, unused.
- **A 2FA-pending login carries no tokens.** `POST /auth/login` returns
  `{ next: "2fa", challenge_id, masked_destination, expires_in }` and
  nothing else; the session is created by `POST /auth/2fa/challenge`.
  Don't "fix" this by issuing a short-lived token at the password step.
  `SignIn.tsx` handles the branch with `completeTwoFactorChallenge`.
- **`two_factor_phone` is separate from `users.phone`.** The latter is the
  payout number; changing payout details must not silently move the
  second factor. `enroll2fa` + `verify2fa` (pick a different handset) stay
  in the API for that future need; the UI doesn't use them.
- This deviates from the frozen contract's original TOTP design: the phone
  is already on file and an authenticator app is a bigger ask of this
  audience.
- `verifyLoginOtp` and the merchant auth `PhoneInput` are referenced by
  nothing. Don't delete them as dead code; they're kept for a future
  account-settings need. `toE164` is used by `VehicleDetail.tsx`.

## Payout phone verification

The payout phone must pass an SMS ownership check before onboarding can be
submitted. `POST /auth/phone/verification/{start,confirm}` (authenticated,
`otp_codes` purpose `phone_verify`); `assertCompleteForSubmission` gates
on `users.phone_verified`; `GET /merchant/onboarding` and
`GET /auth/registration-state` report it. `setUserPhone` normalises to
E.164, clears `phone_verified` whenever the number changes, and maps the
unique-violation to `409 phone_taken`. Spec §10's KES 1 name lookup is a
separate, unbuilt check. A renter can correct an unverified phone.

## Sessions

- "Where you are signed in" shows the current device plus a count of the
  others; `POST /auth/sessions/revoke-all` ("sign out everywhere else")
  ends all but the caller's, audit-logged. `Session` carries `user_agent`.
- A revoked session stops working immediately (see `conventions.md`,
  Reliability).
- **`sessions.kind`** is `user` or `assist` (PR AG3). An assist session is
  a sales agent filling in onboarding for the owner: `assisted_by` names
  the agent, it lives 1 hour, has no refresh token, and its token carries
  `asb`. `authenticate()` reads `kind` from the row and holds an assist to
  the onboarding allowlist in `lib/assist.ts` (`403 assist_scope`
  elsewhere). An `asb` claim on a user session is refused. Revoke-all and
  `POST /merchant/onboarding/assist/end` end it. See `admin-ops.md`.

## Account status and closing an account

`users.status` is `active / suspended / pending_deletion / deleted`.

- **Close account is self-service.** `POST /auth/account/deletion` ->
  `pending_deletion`, purge scheduled 30 days out (`erasure_*` columns),
  every other session revoked, so the account looks deleted everywhere
  but the owner can still sign in to cancel (`DELETE` = "Keep my
  account"). Idempotent. `GET /merchant/profile` carries `account_status`
  + `deletion_scheduled_at`; the shell shows a red banner while pending.
- `runAccountDeletionSweep` (in the daily sweep): past 30 days it scrubs
  the user row's PII, sets `deleted`, revokes sessions and drops
  credentials. It **keeps** `merchants`, `vehicles`, `bookings`,
  `payout_runs` and `audit_log`, so a hirer still sees where they booked.
- `login` rejects `suspended` (403 `account_suspended`) and treats
  `deleted` as invalid credentials; `pending_deletion` can sign in.
  `refreshToken` rejects `suspended` and `deleted` and revokes the
  session, so a suspension ends a live session within one refresh cycle.
  **Nothing in the product sets `suspended` yet**; account suspension is
  its own unbuilt slice.

## Endpoint list

`GET /auth/2fa`, `POST /auth/2fa/enable`, `POST /auth/2fa/enroll`, `POST /auth/2fa/verify`, `POST /auth/2fa/challenge`, `POST /auth/2fa/challenge/send`, `POST /auth/2fa/challenge/resend`, `DELETE /auth/2fa` (`disable2fa`). `TwoFactorState` has no `recovery_codes_remaining`.
