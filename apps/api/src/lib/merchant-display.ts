import type { MerchantRow } from "../modules/merchant/db-types.js";

/**
 * The name to show for a merchant on an admin surface: the company name
 * for a company, otherwise the person's name. Shared by the vehicle-review
 * and merchants-lens modules so a merchant reads the same on both.
 */
export function merchantDisplayName(m: MerchantRow): string {
  if (m.owner_type === "company" && m.company_name) return m.company_name;
  return [m.first_name, m.surname].filter(Boolean).join(" ") || "(no name on file)";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}
