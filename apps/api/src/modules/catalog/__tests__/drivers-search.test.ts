import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestDriver, createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * `GET /catalog/drivers` as the `/drivers` search (DR1,
 * docs/plans/drivers-that-work.md): county, rate, a window that leaves out
 * a driver already booked (the same overlap `POST /bookings` refuses),
 * price sort on the chosen rate, cursor paging and a total count.
 *
 * Every driver here lives in a county made up for this run, so other
 * tests' drivers never land in these lists.
 */

const app = createApp();
const userIds: string[] = [];
const COUNTY = `Testcounty ${ulid().slice(-6)}`;

afterAll(async () => {
  if (userIds.length) {
    await db("bookings").whereIn("hirer_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

async function merchant(): Promise<string> {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Grace",
    surname: "Wanjiru",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
  });
  return merchantId;
}

const DAY = 24 * 60 * 60 * 1000;
const NAIROBI = 3 * 60 * 60 * 1000;
function at(dayOffset: number, hour: number): string {
  const day = new Date(Date.now() + NAIROBI + dayOffset * DAY).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`) - NAIROBI).toISOString();
}

async function book(driverId: string, merchantId: string, pickupAt: string, dropoffAt: string, status: string) {
  const hirer = await createVerifiedTestUser();
  userIds.push(hirer.userId);
  await db("bookings").insert({
    id: generateId("booking"),
    ref: `CB-T${ulid().slice(-9)}`,
    hirer_id: hirer.userId,
    merchant_id: merchantId,
    driver_id: driverId,
    driver_rate_unit: "day",
    driver_rate_quantity: 1,
    hire_car_details: "Test car",
    pickup_at: pickupAt,
    dropoff_at: dropoffAt,
    pickup_location: "Kilimani",
    dropoff_location: "Kilimani",
    gross_amount: 300_000,
    gross_currency: "KES",
    commission_amount: 30_000,
    commission_currency: "KES",
    merchant_net_amount: 270_000,
    merchant_net_currency: "KES",
    deposit_amount: 0,
    deposit_currency: "KES",
    payout_method: "mpesa",
    payout_detail: "0722000000",
    payout_account_name: "Grace Wanjiru",
    status,
  });
}

const list = (q: Record<string, string>) =>
  request(app).get(`/catalog/drivers?${new URLSearchParams({ county: COUNTY, limit: "100", ...q }).toString()}`);
const ids = (body: { data: Array<{ id: string }> }) => body.data.map((d) => d.id);

describe("searching drivers", () => {
  it("filters by county (any case), rate and a free window, and counts the matches", async () => {
    const merchantId = await merchant();
    const free = await createTestDriver(merchantId, { county: COUNTY, daily_rate_amount: 300_000 });
    const hourly = await createTestDriver(merchantId, {
      county: COUNTY,
      daily_rate_amount: null,
      daily_rate_currency: null,
      hourly_rate_amount: 50_000,
      hourly_rate_currency: "KES",
    });
    const busy = await createTestDriver(merchantId, { county: COUNTY });
    const pendingOnly = await createTestDriver(merchantId, { county: COUNTY });
    await book(busy, merchantId, at(5, 9), at(6, 17), "confirmed");
    await book(pendingOnly, merchantId, at(5, 9), at(6, 17), "requested");

    const all = await list({ county: COUNTY.toUpperCase() });
    expect(all.status).toBe(200);
    expect(new Set(ids(all.body))).toEqual(new Set([free, hourly, busy, pendingOnly]));
    expect(all.body.total_count).toBe(4);

    const daily = await list({ unit: "day" });
    expect(ids(daily.body)).not.toContain(hourly);
    expect(daily.body.total_count).toBe(3);

    // Overlaps the confirmed booking: the busy driver drops out; a pending
    // request holds no dates, the same as at request time.
    const window = await list({ pickup_at: at(6, 9), dropoff_at: at(7, 17) });
    expect(ids(window.body)).not.toContain(busy);
    expect(ids(window.body)).toContain(pendingOnly);
    expect(window.body.total_count).toBe(3);

    // Touching end to start is not an overlap (the request's `<` / `>`).
    const after = await list({ pickup_at: at(6, 17), dropoff_at: at(6, 20) });
    expect(ids(after.body)).toContain(busy);
  });

  it("sorts by the chosen rate and pages by cursor without skipping or repeating", async () => {
    const merchantId = await merchant();
    const county = `${COUNTY} sort`;
    const rates = [400_000, 100_000, 300_000, 100_000, 200_000];
    const made = [];
    for (const r of rates) made.push(await createTestDriver(merchantId, { county, daily_rate_amount: r }));

    const seen: string[] = [];
    const amounts: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const q: Record<string, string> = { county, unit: "day", sort: "price_asc", limit: "2" };
      if (cursor) q.cursor = cursor;
      const res = await request(app).get(`/catalog/drivers?${new URLSearchParams(q).toString()}`);
      expect(res.status).toBe(200);
      expect(res.body.total_count).toBe(5);
      seen.push(...ids(res.body));
      amounts.push(...res.body.data.map((d: { rates: { day: { amount: number } } }) => d.rates.day.amount));
      cursor = res.body.next_cursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(new Set(seen)).toEqual(new Set(made));
    expect(seen).toHaveLength(5);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));

    const desc = await request(app).get(
      `/catalog/drivers?${new URLSearchParams({ county, unit: "day", sort: "price_desc" }).toString()}`,
    );
    expect(desc.body.data[0].rates.day.amount).toBe(400_000);
  });

  it("refuses a half window, a backwards window and a price sort with no rate", async () => {
    expect((await list({ pickup_at: at(3, 9) })).status).toBe(422);
    expect((await list({ pickup_at: at(3, 17), dropoff_at: at(3, 9) })).status).toBe(422);
    const noUnit = await list({ sort: "price_asc" });
    expect(noUnit.status).toBe(422);
    expect(noUnit.body.error.field).toBe("unit");
  });

  it("lists the counties that have a live driver", async () => {
    const merchantId = await merchant();
    const county = `${COUNTY} counties`;
    await createTestDriver(merchantId, { county });
    await createTestDriver(merchantId, { county: county.toLowerCase() });
    await createTestDriver(merchantId, { county: `${county} paused`, status: "paused" });
    const res = await request(app).get("/catalog/drivers/counties");
    expect(res.status).toBe(200);
    const rows = res.body.counties.filter((c: { county: string }) => c.county.toLowerCase().startsWith(county.toLowerCase()));
    expect(rows).toEqual([{ county: expect.any(String), count: 2 }]);
  });
});
