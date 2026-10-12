/**
 * Pesalink `BankCode` for each bank a merchant can pick
 * (`apps/merchant/src/lib/kenya.ts#BANKS` - keep the names in step).
 *
 * These are the Central Bank of Kenya's two-digit institution codes,
 * which is what Co-op's Pesalink example uses (`"BankCode": "11"` is
 * Co-op itself). **Unconfirmed until Co-op sends their own Pesalink list**
 * (Linear COD-93): a bank missing here, or one Co-op numbers differently,
 * makes the payout fail loudly with `bank_code_unknown` rather than go to
 * the wrong bank.
 *
 * Co-operative Bank is deliberately absent: a Co-op account is paid by
 * internal transfer, not Pesalink.
 */
const BANK_CODES: Record<string, string> = {
  "ABC Bank": "35",
  "Absa Bank Kenya": "03",
  "Access Bank Kenya": "26",
  "Bank of Africa Kenya": "19",
  "Bank of Baroda": "06",
  "Bank of India": "05",
  "Citibank Kenya": "16",
  "Consolidated Bank of Kenya": "23",
  "Credit Bank": "25",
  "Diamond Trust Bank (DTB)": "63",
  "DIB Bank Kenya": "75",
  "Ecobank Kenya": "43",
  "Equity Bank Kenya": "68",
  "Family Bank": "70",
  "Guaranty Trust Bank (GTBank)": "53",
  "Guardian Bank": "55",
  "Gulf African Bank": "72",
  "Habib Bank AG Zurich": "17",
  "HF Group (Housing Finance)": "61",
  "I&M Bank": "57",
  "KCB Bank Kenya": "01",
  "Kingdom Bank": "51",
  "Mayfair CIB Bank": "65",
  "Middle East Bank Kenya": "18",
  "M Oriental Bank": "14",
  "National Bank of Kenya": "12",
  "NCBA Bank Kenya": "07",
  "Paramount Bank": "50",
  "Premier Bank Kenya": "74",
  "Prime Bank": "10",
  "SBM Bank Kenya": "60",
  "Sidian Bank": "66",
  "Stanbic Bank Kenya": "31",
  "Standard Chartered Bank Kenya": "02",
  "UBA Kenya Bank": "76",
  "Victoria Commercial Bank": "54",
};

export const COOP_BANK_NAME = "Co-operative Bank of Kenya";

/** Null when the bank isn't one we can route by Pesalink. */
export function pesalinkBankCode(bankName: string): string | null {
  return BANK_CODES[bankName.trim()] ?? null;
}
