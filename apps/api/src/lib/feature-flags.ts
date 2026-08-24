/**
 * Minimal Phase 0 flag reader: comma-separated flag keys in FEATURE_FLAGS.
 * Enough to launch a payment method or a city without a deploy later
 * (spec §28); swap for a real flag service without changing call sites.
 */
const enabled = new Set(
  (process.env.FEATURE_FLAGS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean),
);

export function isFeatureEnabled(key: string): boolean {
  return enabled.has(key);
}
