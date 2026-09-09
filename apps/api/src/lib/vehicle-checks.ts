import type { Knex } from "knex";
import type { VehicleRow } from "../modules/merchant/db-types.js";
import type { AutoCheckId } from "./platform-settings.js";

/**
 * Kept in step with `modules/vehicles/service.ts#EXPIRING_WITHIN_DAYS` (not
 * imported, to keep this lib free of that module's heavy import graph).
 * Both are "30 days out is 'expiring'"; if one moves, move both.
 */
const EXPIRING_WITHIN_DAYS = 30;

/**
 * The automatic checks the case screen renders. Every one is advisory —
 * "they guide the eye, they do not decide" — so a check has three
 * outcomes: `pass`, `look` (worth a human's eye), `fail` (almost
 * certainly wrong). None of them block a decision.
 *
 * "Logbook name match" is NOT here. It compares the name *read off the
 * scan* against the account, and this product has no OCR — the case
 * screen shows the account name as plain context for the reviewer to
 * compare, never a computed verdict. Faking a green tick nobody computed
 * is the same failure as the hardcoded `id_verified` badge.
 */
export type CheckOutcome = "pass" | "look" | "fail";

export interface CheckResult {
  id: AutoCheckId;
  outcome: CheckOutcome;
  label: string;
  detail: string;
}

const PLATE_RE = /^K[A-Z]{2}[0-9]{3}[A-Z]$/; // KDL442N — the modern Kenyan series

function normalisePlate(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function plateFormat(vehicle: VehicleRow): CheckResult {
  const norm = normalisePlate(vehicle.registration);
  return PLATE_RE.test(norm)
    ? { id: "plate_format", outcome: "pass", label: "Registration format", detail: `${vehicle.registration} is a valid Kenyan series.` }
    : {
        id: "plate_format",
        outcome: "look",
        label: "Registration format",
        detail: `${vehicle.registration} isn't the usual KXX 000X shape — confirm against the logbook.`,
      };
}

async function duplicatePlate(trx: Knex, vehicle: VehicleRow): Promise<CheckResult> {
  // A global functional unique index means two live rows can't share a
  // plate, but this still catches a draft/withdrawn row under a *different*
  // merchant that a reviewer should know about.
  const norm = normalisePlate(vehicle.registration);
  const other = await trx<VehicleRow>("vehicles")
    .whereRaw("upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g')) = ?", [norm])
    .andWhereNot({ id: vehicle.id })
    .first();
  if (!other) {
    return {
      id: "duplicate_plate",
      outcome: "pass",
      label: "Duplicate registration",
      detail: "No other listing carries this plate.",
    };
  }
  const sameMerchant = other.merchant_id === vehicle.merchant_id;
  return {
    id: "duplicate_plate",
    outcome: sameMerchant ? "look" : "fail",
    label: "Duplicate registration",
    detail: sameMerchant
      ? "Another listing on this merchant's account uses this plate."
      : "This registration is already listed under a different merchant account.",
  };
}

function insuranceExpiry(vehicle: VehicleRow): CheckResult {
  const raw = vehicle.insurance_expiry;
  if (!raw) {
    return {
      id: "insurance_expiry",
      outcome: "look",
      label: "Insurance expiry",
      detail: "No expiry date on file for the insurance certificate.",
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const date = raw.slice(0, 10);
  if (date < today) {
    return { id: "insurance_expiry", outcome: "fail", label: "Insurance expiry", detail: `Cover expired on ${date}.` };
  }
  const daysLeft = (new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft <= EXPIRING_WITHIN_DAYS) {
    return { id: "insurance_expiry", outcome: "look", label: "Insurance expiry", detail: `Cover lapses on ${date} — within ${EXPIRING_WITHIN_DAYS} days.` };
  }
  return { id: "insurance_expiry", outcome: "pass", label: "Insurance expiry", detail: `Comprehensive cover valid to ${date}.` };
}

/** Runs the enabled checks for one vehicle. `trx` is any Knex handle. */
export async function runVehicleChecks(
  trx: Knex,
  vehicle: VehicleRow,
  enabled: AutoCheckId[],
): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  if (enabled.includes("plate_format")) out.push(plateFormat(vehicle));
  if (enabled.includes("duplicate_plate")) out.push(await duplicatePlate(trx, vehicle));
  if (enabled.includes("insurance_expiry")) out.push(insuranceExpiry(vehicle));
  return out;
}
