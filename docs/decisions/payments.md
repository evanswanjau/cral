# Payments: money in and money out

Read before touching STK push, callbacks, settlement, refunds, payouts'
disbursement or anything under `adapters/payment` / `adapters/coopbank`.
Contract `openapi/payments.yaml` (written after the code - a recorded
deviation from contract-first). Plans with runbooks:
`docs/plans/payments-daraja.md`, `docs/plans/coopbank-integration.md`
(Linear "CRAL - Co-op Bank integration", COD-89..93; COD-93 holds the
owner/Co-op blockers).

## Rails

- **Money in** is an M-Pesa STK push. Three adapters, picked by
  `PAYMENT_ADAPTER`: `daraja` (Safaricom, live on the dev/demo
  environment), `coopbank` (Co-op Connect, the go-live plan) and
  `console` (local/tests). Co-op is **not** replaced by Daraja; both stay.
- **Money out** (merchant payouts, renter refunds) goes through Co-op
  Connect via `lib/disbursements.ts` (`DISBURSEMENT_ADAPTER`).
- Daraja B2C (payouts/refunds over Daraja) is not built; "B2C Hakikisha"
  is for spec §10's payout name check, later.

## Money in

- **The wire format is the adapter's; the settle rules are the
  service's.** `PaymentAdapter` has `parseCallback` and `correlatesOn`;
  `modules/payments/service.ts#applySettlement` is the single copy of the
  rules, shared by every rail's callback and the status sweep. A copy per
  provider is how two rails drift apart.
- **Correlation differs per rail.** Co-op echoes a `MessageReference` we
  choose. Daraja has no echo field (`AccountReference` is 12 chars and
  never returned), so its `CheckoutRequestID` from the ack is the only
  link: `correlatesOn: "provider"`.
- **The `payment_requests` row is written before the prompt goes out.**
  Push-then-insert left a charged renter with no row when the insert
  failed. If the push throws, the orphan `pending` row is marked `failed`,
  which doesn't block a retry.
- **A success only settles if the amount matches.** A callback is weakly
  authenticated at best; a mismatch is recorded `failed` with a
  `payment.amount_mismatch` audit row.
- **Callbacks are HTTP Basic.** Daraja: credentials embedded in the URL
  sent with each STK push (`DARAJA_CALLBACK_USER`/`_PASSWORD`); the API
  refuses to boot in production without them. Co-op:
  `COOPBANK_CALLBACK_USER`/`_PASSWORD` (503 in production until set).
- **Garage orders pay through the same path** (Phase 4 GS3,
  `garage.md`): `startStkPush` writes the row before the push for a
  booking or an order, and `applySettlement` hands an order's settled row
  to `modules/garage/order-settlement.ts`. Money that can't be applied
  there (a quote paid twice, an order already cancelled) is refunded, never
  kept.
- **There is no "mark paid" endpoint.** The dev settler was removed once
  the real flow worked end to end. If a sandbox callback misbehaves, fix
  the callback path; don't bring a settler back.
- **Lost Co-op callbacks are recovered by Transaction Status**
  (`modules/payments/status-sweep.ts`, BullMQ every 5 min): `coopbank`
  rows still `pending` 2 min to 24 h after creation are asked about and
  fed through `applySettlement` (actor `coopbank-status-query`).
  `interpretStkStatus` settles success only on HTTP 200 + `MessageCode
  "0"` + a receipt, failure only when a leg's `ResponseCode` says so;
  404/207/unknown stay pending.

## Daraja specifics

- Sandbox app products: "Lipa Na M-Pesa Sandbox" (STK, built), "M-Pesa
  Sandbox" (B2C, not built).
- Sandbox has no shortcode or passkey of your own: everyone uses `174379`
  + the portal's passkey. Your own arrive at go-live with
  `DARAJA_BASE_URL=https://api.safaricom.co.ke`.
- The callback URL travels with each push, so nothing is registered with
  Safaricom. Local dev needs a tunnel (its URL rotates); the dev API's
  `DARAJA_CALLBACK_URL` points at itself.

## Co-op Connect specifics

- **Co-op's own Postman collection is authoritative** (received
  2026-11-04, "CRUZ RIDE AUTO LIMITED"). Every path is in `COOP_PATHS`
  (`adapters/coopbank/client.ts`), spelt as Co-op spells them, trailing
  slashes included: STK `FT/stk/1.0.0` (body `MobileNumber` / number
  `Amount` / `Narration` / `OperatorCode`), STK status
  `Enquiry/STK/1.0.0/`, Transaction Status v3, Pesalink v2, IFT v3, Send to
  M-Pesa v2, plus read-only account APIs (`adapters/coopbank/account.ts`:
  Pesalink validation, balance, mini and full statement, not wired to a
  screen). Enquiries and Pesalink/IFT carry `UserId`
  (`COOPBANK_USER_ID`); STK needs `COOPBANK_OPERATOR_CODE`. The collection
  has no responses, so every reader assumes the public 1.0/2.0 envelope -
  check against the first live answers.
- **Co-op STK stays off until confirmed**: `COOPBANK_STK_PATH_CONFIRMED`
  must be `true` or the adapter refuses (501).
- `npm run coop:check -w apps/api -- <token|balance|mini|statement|validate|stk-status|status>`
  calls one read-only API and prints the answer.
- Public specs (older versions): `GET
  https://developer.co-opbank.co.ke/api/am/store/v1/apis` lists them,
  `.../apis/{id}/swagger` returns each, no login.
- The sandbox token URL is `/oauth2/token` (bare `/token` 302s to the
  gateway login). Co-op's collection uses bare `/token` on production
  (`openapi.co-opbank.co.ke`); `coop:check token` settles it.
- **`POST /payments/coopbank/callback` is the one registered URL** (test
  `dev.api.cral.co.ke`, production `api.cral.co.ke`, IP `46.202.128.68`,
  port 443), always parsed as Co-op's format whatever `PAYMENT_ADAPTER`
  is. The B2B IPN route was the wrong integration and is gone.
- **`adapters/coopbank/client.ts` is the one copy of Co-op's token +
  POST.** `coopPost` returns `{status, body}` for any JSON answer (Co-op's
  statuses carry meaning: 207 partial, 404 unknown reference) and throws
  only when there's no usable answer (a redirect or a non-JSON body). A
  throw means "we don't know", never "the payment failed".

## Money out (disbursements)

- **`lib/disbursements.ts` is the one set of rules** for payouts and
  refunds, like `applySettlement` for money in. `disbursements` table
  (`dsb_`), one row per attempt, written **before** the send.
- Channels: `pesalink` (another bank; `BankCode` from `lib/bank-codes.ts`,
  CBK codes, **unconfirmed** until Co-op's list arrives - an unknown bank
  is 422 `bank_code_unknown`, never a guess), `internal` (a Co-op account,
  IFT) and `mpesa` (Send to M-Pesa).
- **Whole shillings only**: `sent_shillings = floor(cents/100)`, the
  sub-shilling remainder visible on the row, never rounded up.
- A send with no usable answer stays `pending` (money may have moved) for
  the sweep; an outright refusal is `failed`; `processing` waits for the
  callback (same URL as STK, told apart by `Destinations[]`) or
  Transaction Status. `settleDisbursement` is idempotent and moves the
  payout run to `paid`/`failed` (+ merchant notification) or the refund to
  `success`/`failed`.
- A partial unique index allows one live attempt per payout run or
  refund; a `failed` one frees the slot for a retry.
- **`DISBURSEMENT_ADAPTER=console` is refused in production**: the attempt
  fails with "No payout rail is configured", nothing is marked paid, and
  Ops' Pay returns 503 `payout_rail_unconfigured`. `coopbank` needs
  `COOPBANK_SOURCE_ACCOUNT`.
- **Refunds** go out by Send to M-Pesa via `executeRefund`
  (`lib/refunds.ts`). `PaymentAdapter` has no `refund`.

## Code anchors

`CoopBankPaymentAdapter` (`PAYMENT_ADAPTER=coopbank`); Daraja rows correlate on `provider_request_id`. The bare Co-op `/token` redirects to `/carbon/admin/login.jsp`.
