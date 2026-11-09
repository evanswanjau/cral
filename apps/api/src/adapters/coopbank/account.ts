import { ulid } from "ulid";
import { COOP_PATHS, coopPost, coopUserId, requireCoopEnv, type CoopResponse } from "./client.js";

/**
 * Read-only enquiries on CRAL's own Co-op account, plus Pesalink's
 * name lookup on someone else's. Requests are Co-op's own Postman
 * collection's ("CRUZ RIDE AUTO LIMITED", received 2026-11-04); it carries
 * no responses, so these return Co-op's answer as-is rather than a parsed
 * shape nobody has seen yet. The public 1.0 swagger's statement answer is
 * `{ AccountNumber, AccountName, Transactions[] }`, each transaction with
 * `TransactionDate`, `Narration`, `CreditAmount`, `DebitAmount`,
 * `RunningClearedBalance` and so on - the v2 shape is expected to match.
 *
 * Nothing here moves money. Each call gets a fresh `MessageReference`
 * (a ULID, 26 chars - under Co-op's 27).
 */

function sourceAccount(account?: string): string {
  return account ?? requireCoopEnv("COOPBANK_SOURCE_ACCOUNT");
}

/** `POST /Enquiry/AccountBalance_v2/2.0.0/` - defaults to `COOPBANK_SOURCE_ACCOUNT`. */
export async function accountBalance(account?: string): Promise<CoopResponse> {
  return coopPost(COOP_PATHS.accountBalance, {
    MessageReference: ulid(),
    UserId: coopUserId(),
    AccountNumber: sourceAccount(account),
  });
}

/** `POST /Enquiry/MiniStatement/Account_v2/2.0.0/` - the latest few transactions. */
export async function miniStatement(account?: string): Promise<CoopResponse> {
  return coopPost(COOP_PATHS.miniStatement, {
    MessageReference: ulid(),
    UserId: coopUserId(),
    AccountNumber: sourceAccount(account),
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `POST /Enquiry/AccountFullStatementPaginated/1.0.0/` - every transaction
 * between two dates (`YYYY-MM-DD`, inclusive, as Co-op's bank day reads
 * them - the collection asks for one day as `StartDate` = `EndDate`).
 */
export async function fullStatement(startDate: string, endDate: string, account?: string): Promise<CoopResponse> {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new Error(`Statement dates must be YYYY-MM-DD, got ${startDate} / ${endDate}`);
  }
  return coopPost(COOP_PATHS.fullStatement, {
    MessageReference: ulid(),
    UserId: coopUserId(),
    ISO2CountryCode: "KE",
    AccountNumber: sourceAccount(account),
    StartDate: startDate,
    EndDate: endDate,
  });
}

/**
 * `POST /Enquiry/Validation/IPSL/1.0.0/` - asks Pesalink whether an
 * account exists at a bank before money is sent to it.
 * `RecipientBankIdentifier` is the bank's code zero-padded to four digits
 * (the collection sends `"0011"` for Co-op, whose Pesalink `BankCode` is
 * `"11"`), so it takes the same codes as `lib/bank-codes.ts`.
 */
export async function validatePesalinkAccount(accountNumber: string, bankCode: string): Promise<CoopResponse> {
  if (!/^\d{1,4}$/.test(bankCode)) throw new Error(`Bank code must be 1-4 digits, got ${bankCode}`);
  return coopPost(COOP_PATHS.pesalinkValidation, {
    MessageReference: ulid(),
    UserId: coopUserId(),
    AccountNumber: accountNumber,
    RecipientBankIdentifier: bankCode.padStart(4, "0"),
  });
}
