import type { Knex } from "knex";
import { generateId } from "./ids.js";
import type { EventTone, VehicleEventRow } from "../modules/merchant/db-types.js";

/**
 * Shared by both the onboarding flow (`modules/merchant/service.ts`, which
 * creates and submits vehicles as part of the wizard) and the post-
 * onboarding vehicles module (`modules/vehicles/service.ts`) — a listing
 * ref and a review-history event mean the same thing regardless of which
 * flow produced them, so both write through here rather than each keeping
 * its own copy.
 */

/**
 * A human-readable listing reference: `H` + `YYMMDD` + a 3-digit sequence
 * that restarts each Nairobi calendar day (owner's call, 2026-08-31), e.g.
 * `H260831001` for the first vehicle listed on 2026-08-31. Backed by
 * `listing_ref_daily_counters` — one row per day, bumped atomically here
 * so concurrent inserts can't collide. Runs inside the caller's
 * transaction, so a rolled-back vehicle insert rolls the counter back too.
 */
export async function nextListingRef(trx: Knex.Transaction | Knex): Promise<string> {
  const result = await trx.raw<{ rows: { day: string; n: number }[] }>(
    `INSERT INTO listing_ref_daily_counters (day, n, created_at, updated_at)
     VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1, now(), now())
     ON CONFLICT (day)
     DO UPDATE SET n = listing_ref_daily_counters.n + 1, updated_at = now()
     RETURNING to_char(day, 'YYMMDD') AS day, n`,
  );
  const { day, n } = result.rows[0]!;
  return `H${day}${String(n).padStart(3, "0")}`;
}

export async function appendVehicleEvent(
  trx: Knex.Transaction | Knex,
  input: {
    vehicleId: string;
    merchantId: string;
    kind: string;
    tone: EventTone;
    label: string;
    body?: string | null;
    actorType: "merchant" | "reviewer" | "system";
    actorName?: string | null;
  },
): Promise<void> {
  await trx<VehicleEventRow>("vehicle_events").insert({
    id: generateId("vehicleEvent"),
    vehicle_id: input.vehicleId,
    merchant_id: input.merchantId,
    kind: input.kind,
    tone: input.tone,
    label: input.label,
    body: input.body ?? null,
    actor_type: input.actorType,
    actor_name: input.actorName ?? null,
  });
}
