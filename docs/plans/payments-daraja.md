# Payments on Safaricom Daraja

Started 2026-09-22, owner's call: the client demo needs a payment that
works, and the customer-hire flow comes first.

**Co-op Bank is not replaced.** `CoopBankPaymentAdapter` is untouched and
still selectable with `PAYMENT_ADAPTER=coopbank`; go-live is still the
plan for it. Daraja sits beside it as a third registered adapter. The
only thing that changed in the Co-op file is that its callback parsing
moved *into* it as `parseCallback`, out of the shared service - same
logic, same fields, now per-adapter so two rails can coexist.

## Why Daraja for the demo

Co-op's gateway is blocked on three things their portal doesn't answer:
how the callback authenticates itself, whether the STK resource shape is
right (`COOPBANK_STK_PATH_CONFIRMED` still gates it), and whether any
reversal endpoint exists at all. Daraja answers all three itself, is
self-service in sandbox, and carries B2C for merchant payouts on the same
credentials.

## Daraja products to map to the app

| Product | Why |
| --- | --- |
| **Lipa Na M-Pesa Sandbox** | STK push. A renter paying - this slice. |
| **M-Pesa Sandbox** | B2C (merchant payouts), plus Transaction Status and Reversal. Next slice. |
| **B2C Hakikisha Sandbox** | Name lookup on a payout number before sending - spec §10's KES 1 check. Later. |

Nothing else on that list touches car rental.

## What shipped (customer pays)

Backend only - `PaymentCard` in `apps/customer/src/pages/TripDetail.tsx`
was already built and needed no change.

- `adapters/payment/daraja-adapter.ts` - OAuth, STK push, callback
  parsing. Verified against the live sandbox on 2026-09-22: token
  exchange 200, push accepted, `CheckoutRequestID` returned.
- `PaymentAdapter` gained `parseCallback` and `correlatesOn`. Each
  adapter owns its own wire format; the settle rules stay as one copy in
  `service.ts#applySettlement`.
- `openapi/payments.yaml` - the module never had a contract. Written
  after the code, which is a deviation from contract-first and is
  recorded as one in the file itself.

### Three things worth knowing

**The correlator is Daraja's, not ours.** Co-op echoes a
`MessageReference` we choose, so that adapter never depends on a
provider-issued id. Daraja has no echo field - `AccountReference` is 12
chars and is not returned - so `CheckoutRequestID` from the ack is the
only thing tying a callback to a row. `correlatesOn: "provider"` is what
tells `initiatePayment` to re-stamp the row after the push.

**The row is now written before the prompt goes out.** It used to be
push-then-insert, which meant a push that succeeded while the insert
failed left the renter charged with no row at all - nothing could settle
that payment or even show it happened. The cost is an orphan `pending`
row when the push throws, which the catch marks `failed`; a `failed` row
doesn't block a retry.

**A success must be for the right amount.** The callback endpoint is
weakly authenticated at best (open, for Co-op), so `provider_request_id`
alone is a thin claim. `applySettlement` compares the figure the provider
reports against the figure asked for and records a mismatch as `failed`
with a `payment.amount_mismatch` audit row.

## Running it

### Local

`.env` is already set: `PAYMENT_ADAPTER=daraja`, sandbox credentials,
shortcode `174379`, the published sandbox passkey.

Safaricom cannot reach `localhost`, so the callback needs a public HTTPS
tunnel. The ngrok tunnel the Co-op work already used serves both rails -
`DARAJA_CALLBACK_URL` points at `/payments/daraja/callback` on it. **The
tunnel URL rotates every restart**; update `.env` and restart the API
when it does, or the prompt succeeds and the result never lands.

`DARAJA_CALLBACK_USER`/`_PASSWORD` are deliberately unset locally - a
throwaway tunnel isn't worth the ceremony, and the guard skips when
unconfigured.

### Vercel demo

`app-cral.vercel.app` is a static Vite build; it has no backend. It calls
the **Railway** API, so that is where the callback lands - not the VPS.

1. Railway env: the same `DARAJA_*` values, with
   `DARAJA_CALLBACK_URL=https://<railway-host>/payments/daraja/callback`
   and Basic credentials embedded:
   `https://user:pass@<railway-host>/payments/daraja/callback`.
2. `DARAJA_CALLBACK_USER`/`DARAJA_CALLBACK_PASSWORD` set to that pair.
   **The API refuses to boot in production without them** - an open settle
   callback is a "mark my own booking paid" endpoint.
3. Vercel tracks `develop`, so the demo branch is `develop`, not `main`.
4. Confirm Railway has run migrations through `20260911090000`
   (`payment_requests`). It has been found behind before.

### Production / go-live

Not this slice. At go-live `DARAJA_BASE_URL` becomes
`https://api.safaricom.co.ke` and Safaricom issues a real shortcode and
passkey of your own - the sandbox pair is shared by everyone.

## What is deliberately not built

- **B2C / merchant payouts.** `refund()` throws `501` rather than
  resolving, so a refund is never recorded as done when no money moved.
  Needs `InitiatorName` + `SecurityCredential` (the initiator password
  RSA-encrypted with Safaricom's certificate) and its own result/timeout
  callbacks.
- **Payout origination.** Worth flagging beyond the rail: `cutPayoutRun`
  is called from `dev-seed.ts` and `seed-demo.ts` only. There is no
  scheduler and no admin action, so even with B2C working no run would
  ever exist to send. That is the larger half of the payouts slice.
- **Sandbox B2C moves no real money.** STK push in sandbox raises a
  genuine PIN prompt on a real handset, which demos well. B2C returns a
  real Result callback and nothing lands in a wallet - decide how to
  narrate the payout half before the demo.

## Unrelated fix carried along

`admin-comms.test.ts` generated fixture phones as
`ulid().slice(-8).replace(/[^0-9]/g, "1")`. A ULID suffix is Crockford
base32 and mostly letters, so almost every fixture collapsed toward
`+254711111111`; `users.phone` is unique, so the suite failed on a
duplicate key once a few rows were left behind, and which test drew the
collision varied run to run. Now maps each character to a digit instead.
