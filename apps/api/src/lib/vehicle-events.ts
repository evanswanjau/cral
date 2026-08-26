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

export async function nextListingRef(trx: Knex.Transaction | Knex): Promise<string> {
  const result = await trx.raw<{ rows: { n: string }[] }>("select nextval('vehicle_listing_ref_seq') as n");
  return `CRAL-V-${result.rows[0]!.n}`;
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
