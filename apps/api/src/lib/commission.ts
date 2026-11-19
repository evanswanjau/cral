import { COMMISSION_RATE } from "@cral/types";
import { db } from "../db/client.js";

/**
 * CRAL's rate per vertical (owner decision 2026-11-19): garage and parts
 * each have their own admin-only `platform_settings` value
 * (`commission.garage`, `commission.parts`), falling back to the hire rate.
 * The rate is NEVER returned to a merchant - callers send shilling
 * amounts only (CLAUDE.md global rule).
 */
export type Vertical = "garage" | "parts";

export async function commissionRateFor(vertical: Vertical): Promise<number> {
  const row = await db<{ key: string; value: unknown }>("platform_settings").where({ key: `commission.${vertical}` }).first();
  const v = typeof row?.value === "string" ? Number(row.value) : row?.value;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1 ? v : COMMISSION_RATE;
}

/** What the merchant keeps from a gross amount in cents. */
export function takeHome(grossCents: number, rate: number): number {
  return grossCents > 0 ? grossCents - Math.round(grossCents * rate) : 0;
}
