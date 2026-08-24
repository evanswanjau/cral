import { createHash } from "node:crypto";

/**
 * Checks a password against the Have I Been Pwned breach corpus using the
 * k-anonymity range API (spec §6's password policy: "checked against a
 * breached-password list"). Only the first 5 hex chars of the SHA-1 hash
 * ever leave this process — the full password/hash never does.
 *
 * Fails open: if the lookup can't complete (network down, HIBP down), we
 * don't block a real registration/reset on a third party being unreachable.
 * This is a deliberate availability-over-strictness tradeoff, not an
 * oversight.
 */
export async function isPasswordBreached(plain: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(plain).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;

    const body = await res.text();
    return body.split("\r\n").some((line) => line.startsWith(suffix));
  } catch {
    return false;
  }
}
