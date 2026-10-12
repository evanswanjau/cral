# Co-op Bank integration: STK, Transaction Status, Pesalink, Send to M-Pesa

Status: PR A merged (#56, 2026-10-12); PR B in review.

## Why this exists

Co-op's Melvin Mburu (2026-10-02, thread "CRUZ RIDE AUTO LIMITED") said the
B2B IPN onboarding form we filled "does not align with your integration
needs". The integration is the public developer portal
(developer.co-opbank.co.ke): **STK Service, Transaction Status API and
Pesalink**, each needing a signed onboarding form ("Coop Connect Reviewed
Onboarding.pdf", section 3 = integration requirements) and the "Revised
Co-op Connect Merchant Agreement".

Owner's calls (2026-10-11):
- Build STK live test, Transaction Status and Pesalink.
- **Also Send to M-Pesa** - Pesalink only reaches bank accounts; M-Pesa
  merchants (the default payout method) and renter refunds need it. Ask
  Melvin to add it to the form.
- **Payouts: Finance approves in Ops.** A scheduled job cuts runs; an
  `admin_finance` user reviews and presses Pay. No fully automatic money.
- **Remove the B2B IPN endpoint** shipped 2026-09-29.

## What the portal actually says

The store API is public: `GET https://developer.co-opbank.co.ke/api/am/store/v1/apis`
lists 12 APIs and `.../apis/{id}/swagger` returns each OpenAPI doc
without login. Every call shares one envelope: our `MessageReference`
(<=27 chars, echoed back), `MessageCode`/`MessageDescription`, and an
async result POSTed to a `CallBackUrl` we pass per request (the `103`
response in each spec is that callback's shape).

| API | Path (sandbox host `openapi-sandbox.co-opbank.co.ke`) | Notes |
|---|---|---|
| SafaricomSTKPush 1.0.0 | `/stkpush/safaricom/1.0.0` | Matches `coopbank-adapter.ts` field for field. |
| TransactionStatus 2.0.0 | `/Enquiry/TransactionStatus/2.0.0` | Body is only `MessageReference`. Response carries `Source` + `Destinations[]` legs with `TransactionID`/`ResponseCode`; `MessageCode` `0` = full success, `1` = partial. |
| PesaLinkSendToAccount 1.0.0 | `/FundsTransfer/External/A2A/PesaLink/1.0.0` | `Source` = our Co-op account; `Destinations[]` = `AccountNumber` (<=14) + `BankCode` + `Amount`. |
| SendToM-Pesa 1.0.0 | `/FundsTransfer/External/A2M/Mpesa/1.0.0` | Same shape, destination is `MobileNumber` (<=13). |

**Amounts on the funds-transfer APIs are integers** (`"Amount": 777`), so
whole shillings. STK's `TransactionAmount` is a string of <=7 digits, also
whole shillings. Our money is integer cents everywhere; conversion happens
only at the adapter boundary.

## Findings from probing the sandbox (2026-10-11)

- The consumer key/secret in `.env` still work - but **the token URL moved**:
  `/token` now 302s to `/carbon/admin/login.jsp`; `/oauth2/token` returns a
  token. `COOPBANK_TOKEN_URL`'s default and `.env.example` are wrong.
- **Every API call 302s to `/carbon/admin/login.jsp`** - with a valid
  token, with no token, and on a path that doesn't exist. The gateway is
  not routing API traffic at all. This is on Co-op's side; nothing can be
  live-tested until they fix it.

## Phases (one PR each)

### PR A - Clean up (small)
- Remove the IPN: route, `coopbank-ipn.ts`, its test, the contract entry,
  the `bankAccountEvent` id prefix, `.env.example` keys, the CLAUDE.md
  note. New migration drops `bank_account_events` (the table stays in
  history; we don't edit a shipped migration). Remove
  `COOPBANK_IPN_*` from both servers' `.env`.
- Fix the token URL default to `/oauth2/token`.

### PR B - Transaction Status
- `PaymentAdapter.queryStatus(messageReference)` on the Co-op adapter.
- Use it to settle STK requests whose callback never arrived: a sweep
  (BullMQ repeatable, every few minutes) picks `payment_requests` still
  `pending` after N minutes and asks Co-op. Settlement goes through the
  existing `applySettlement` - one copy of the rules.
- The same call becomes the fallback for disbursements in PR C.
- Risk: the v2 response is shaped for funds transfers. What it returns
  for an STK reference is not documented; parse defensively and treat
  anything unrecognised as "still pending", never as success.

### PR C - Disbursement rail (Pesalink + Send to M-Pesa)
- New `DisbursementAdapter` (`sendToBank`, `sendToMpesa`, `parseCallback`,
  `queryStatus`), Co-op + console implementations, `DISBURSEMENT_ADAPTER`.
- New `disbursements` table (`dsb_` prefix): what was sent, to whom,
  amount (cents, plus the whole-shilling figure actually sent), our
  `MessageReference`, status `pending/success/failed`, provider
  `TransactionID`. Row written **before** the call, same rule as
  `payment_requests`.
- Callback endpoint `POST /payments/coopbank/ft-callback`, idempotent.
- Refunds: `lib/refunds.ts#executeRefund` sends via Send to M-Pesa
  instead of the current 501.
- Bank codes: merchants pick from a fixed `BANKS` list; add a
  `BANKS -> BankCode` map. Needs Co-op's Pesalink bank-code list.

### PR D - Payout runs + Ops Finance
- Scheduled job cuts runs per merchant schedule (M-Pesa weekly on Monday
  or monthly on the 1st; bank monthly on the 1st) via the existing
  `cutPayoutRun` - still the single place that decides what a run holds.
- Ops screen for `admin_finance`: runs awaiting approval, Pay (creates
  the disbursement, `Idempotency-Key` required, audit-logged), failed
  runs to retry. `scheduled -> processing -> paid | failed` finally
  becomes reachable. Contract `openapi/admin-payouts.yaml`.
- Screen built from the admin canvas's Finance/Payouts file, pulled per
  CLAUDE.md - not from memory.

## Blockers and open questions

1. **Co-op sandbox gateway is down** (every call 302s). Report to
   Melvin / openbankingcustomersupport.
2. **Onboarding form**: list STK, Transaction Status, Pesalink **and
   Send to M-Pesa** in section 3; proprietors sign; send back with the
   merchant agreement.
3. **CRAL's Co-op account number** (14 digits) - the `Source` of every
   disbursement.
4. **Pesalink bank codes** - Co-op's list, to map our `BANKS`.
5. **Whole shillings**: a payout net of commission can carry cents. Send
   the floor and carry the cents into the next run, or round commission
   so nets are always whole? Needs a call before PR C.
6. **Callback authentication** is still undocumented for every Co-op
   callback. Ask whether they sign requests or publish source IPs.
