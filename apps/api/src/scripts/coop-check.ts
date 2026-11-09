import "../lib/load-env.js";
import { accountBalance, fullStatement, miniStatement, validatePesalinkAccount } from "../adapters/coopbank/account.js";
import { getCoopAccessToken, type CoopResponse } from "../adapters/coopbank/client.js";
import { queryStkStatus, queryTransactionStatus } from "../adapters/coopbank/transaction-status.js";

/**
 * `npm run coop:check -w apps/api -- <command>` - calls one Co-op Connect
 * API with the credentials in `.env` and prints what came back, to prove
 * the gateway routes each one before the product leans on it. Read-only:
 * nothing here sends money or prompts a phone.
 *
 *   token                         get an access token
 *   balance                       COOPBANK_SOURCE_ACCOUNT's balance
 *   mini                          its mini statement
 *   statement <from> <to>         its full statement, dates YYYY-MM-DD
 *   validate <account> <bank>     Pesalink name lookup, e.g. 01148531510800 11
 *   stk-status <reference>        an STK push's result
 *   status <reference>            a funds transfer's result
 */
const USAGE = `Usage: npm run coop:check -w apps/api -- token | balance | mini | statement <from> <to> | validate <account> <bank-code> | stk-status <ref> | status <ref>`;

async function run(command: string | undefined, args: string[]): Promise<CoopResponse | string> {
  switch (command) {
    case "token":
      await getCoopAccessToken();
      return "Token issued.";
    case "balance":
      return accountBalance();
    case "mini":
      return miniStatement();
    case "statement":
      if (args.length < 2) break;
      return fullStatement(args[0]!, args[1]!);
    case "validate":
      if (args.length < 2) break;
      return validatePesalinkAccount(args[0]!, args[1]!);
    case "stk-status":
      if (!args[0]) break;
      return queryStkStatus(args[0]);
    case "status":
      if (!args[0]) break;
      return queryTransactionStatus(args[0]);
  }
  console.error(USAGE);
  process.exit(1);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const result = await run(command, args);
  // eslint-disable-next-line no-console
  console.log(typeof result === "string" ? result : `HTTP ${result.status}\n${JSON.stringify(result.body, null, 2)}`);
}

main().catch((error: unknown) => {
  console.error("CO-OP CALL FAILED -", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
