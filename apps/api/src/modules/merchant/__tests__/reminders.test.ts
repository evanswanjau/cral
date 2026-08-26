import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { computeDueTiers, findDueTierForMerchant, getOrCreateMerchant } from "../service.js";
import type { MerchantRow } from "../db-types.js";

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

describe("computeDueTiers — pure", () => {
  it("returns nothing before 24h", () => {
    expect(computeDueTiers(hoursAgo(1), new Date())).toEqual([]);
  });

  it("returns 24h once past a day, largest-first ordering preserved for multiple", () => {
    expect(computeDueTiers(hoursAgo(25), new Date())).toEqual(["24h"]);
    expect(computeDueTiers(hoursAgo(24 * 4), new Date())).toEqual(["3d", "24h"]);
    expect(computeDueTiers(hoursAgo(24 * 31), new Date())).toEqual(["30d", "3d", "24h"]);
  });
});

async function newMerchantWithActivity(lastActivityAt: Date): Promise<MerchantRow> {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  const merchant = await getOrCreateMerchant(user.userId);
  const [updated] = await db<MerchantRow>("merchants")
    .where({ id: merchant.id })
    .update({ last_activity_at: lastActivityAt })
    .returning("*");
  if (!updated) throw new Error("Failed to backdate merchant activity");
  return updated;
}

describe("findDueTierForMerchant — eligibility against the reminder log", () => {
  it("picks 24h for a merchant stalled just over a day with no prior reminder", async () => {
    const merchant = await newMerchantWithActivity(hoursAgo(25));
    const tier = await findDueTierForMerchant(merchant, new Date());
    expect(tier).toBe("24h");
  });

  it("returns null once the only due tier already has a fresh reminder logged", async () => {
    const merchant = await newMerchantWithActivity(hoursAgo(25));
    await db("merchant_onboarding_reminders").insert({
      id: generateId("merchantOnboardingReminder"),
      merchant_id: merchant.id,
      tier: "24h",
      sent_at: new Date(),
    });
    const tier = await findDueTierForMerchant(merchant, new Date());
    expect(tier).toBeNull();
  });

  it("activity reset makes a stale reminder row irrelevant — still eligible for a fresh 24h", async () => {
    // Reminder was sent before the merchant's most recent activity bump —
    // a stale row from a previous stall period, not a real duplicate guard.
    const merchant = await newMerchantWithActivity(hoursAgo(25));
    await db("merchant_onboarding_reminders").insert({
      id: generateId("merchantOnboardingReminder"),
      merchant_id: merchant.id,
      tier: "24h",
      sent_at: hoursAgo(48), // predates last_activity_at
    });
    const tier = await findDueTierForMerchant(merchant, new Date());
    expect(tier).toBe("24h");
  });

  it("picks the largest due tier not yet satisfied, skipping ones already sent", async () => {
    const merchant = await newMerchantWithActivity(hoursAgo(24 * 4)); // 4 days — 24h and 3d both due
    await db("merchant_onboarding_reminders").insert({
      id: generateId("merchantOnboardingReminder"),
      merchant_id: merchant.id,
      tier: "3d",
      sent_at: new Date(),
    });
    const tier = await findDueTierForMerchant(merchant, new Date());
    expect(tier).toBe("24h");
  });
});
