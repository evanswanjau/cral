import { isPhone } from "./identifier.js";

/** "g•••@riverside.co.ke" / "+254•••••8903" — spec §6's masked_identifier shape. */
export function maskIdentifier(identifier: string): string {
  if (isPhone(identifier)) {
    return `${identifier.slice(0, 4)}${"•".repeat(Math.max(identifier.length - 8, 3))}${identifier.slice(-4)}`;
  }
  const [local, domain] = identifier.split("@");
  if (!domain || !local) return identifier;
  return `${local[0]}${"•".repeat(3)}@${domain}`;
}
