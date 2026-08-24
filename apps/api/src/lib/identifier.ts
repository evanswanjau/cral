const E164_RE = /^\+[1-9][0-9]{6,14}$/;

export function isPhone(identifier: string): boolean {
  return E164_RE.test(identifier);
}

/**
 * Normalises a Kenyan phone number to E.164 (spec §2): accepts 0722…,
 * 254722… or already-normalised +254722… and rejects anything else.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (E164_RE.test(trimmed)) return trimmed;
  if (/^0[17][0-9]{8}$/.test(trimmed)) return `+254${trimmed.slice(1)}`;
  if (/^254[17][0-9]{8}$/.test(trimmed)) return `+${trimmed}`;
  return null;
}
