const E164_RE = /^\+[1-9][0-9]{6,14}$/;

export function isPhone(identifier: string): boolean {
  return E164_RE.test(identifier);
}

/**
 * Normalises a Kenyan mobile number to E.164 (spec §2). Deliberately
 * forgiving about how it was typed — spaces, dashes and brackets are
 * stripped, and every common shorthand for the same number is accepted:
 *
 *   +254712345678 · 254712345678 · 0712345678 · 712345678
 *
 * The last form (no leading 0, no country code) is what people naturally
 * type into a field that already shows a "+254" prefix, so it must work
 * without being told it's a "wrong Kenyan number". Safaricom/Airtel
 * mobile prefixes are 7x and 1x. Anything that doesn't reduce to a
 * 9-digit subscriber number starting 7 or 1 returns null.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  let subscriber: string | null = null;
  if (/^254[17]\d{8}$/.test(digits)) subscriber = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) subscriber = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) subscriber = digits;

  return subscriber ? `+254${subscriber}` : null;
}
