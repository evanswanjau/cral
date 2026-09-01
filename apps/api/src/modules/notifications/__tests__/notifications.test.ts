import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomInt } from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { generateId } from "../../../lib/ids.js";
import { getOrCreateMerchant } from "../../merchant/service.js";
import { notify, categoryBypassesQuietHours, categoryLocksSms } from "../../../lib/notifications.js";
import {
  quietHoursDelayMs,
  deliverNotification,
  enqueueNotificationDelivery,
} from "../../../jobs/notification-delivery.js";
import { purgeExpiredNotifications, runExpiryNotificationSweep } from "../service.js";
import { smsAdapter, emailAdapter } from "../../../lib/adapters.js";
import { nextListingRef } from "../../../lib/vehicle-events.js";

const app = createApp();
const createdUserIds: string[] = [];
const createdMerchantIds: string[] = [];

afterAll(async () => {
  if (createdMerchantIds.length > 0) {
    await db("notifications").whereIn("merchant_id", createdMerchantIds).delete();
    await db("notification_preferences").whereIn("merchant_id", createdMerchantIds).delete();
    await db("vehicles").whereIn("merchant_id", createdMerchantIds).delete();
  }
  if (createdUserIds.length > 0) {
    await db("merchants").whereIn("user_id", createdUserIds).delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  const merchant = await getOrCreateMerchant(user.userId);
  createdMerchantIds.push(merchant.id);
  return { ...user, merchantId: merchant.id };
}

let seq = 0;
async function seed(
  merchantId: string,
  category: Parameters<typeof notify>[1]["category"],
  overrides: Partial<Parameters<typeof notify>[1]> & { readAt?: Date } = {},
) {
  seq += 1;
  const id = await db.transaction((trx) =>
    notify(trx, {
      merchantId,
      category,
      title: overrides.title ?? `Test ${category} ${seq}`,
      body: overrides.body ?? "Body text.",
      ref: overrides.ref ?? null,
      subjectType: overrides.subjectType ?? null,
      subjectId: overrides.subjectId ?? null,
      occurredAt: overrides.occurredAt ?? new Date(Date.now() - seq * 1000),
    }),
  );
  if (overrides.readAt) await db("notifications").where({ id }).update({ read_at: overrides.readAt });
  return id;
}

describe("merchant notifications — feed", () => {
  it("lists only the caller's own notifications, newest first, cursor-paged", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    for (let i = 0; i < 3; i += 1) await seed(mine.merchantId, "booking");
    await seed(theirs.merchantId, "booking");

    const first = await request(app)
      .get("/merchant/notifications?limit=2")
      .set(auth(mine.accessToken));
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.has_more).toBe(true);
    expect(first.body.counts.all).toBe(3);

    const second = await request(app)
      .get(`/merchant/notifications?limit=2&cursor=${encodeURIComponent(first.body.next_cursor)}`)
      .set(auth(mine.accessToken));
    expect(second.body.data).toHaveLength(1);
    // No overlap between pages.
    const ids = new Set([...first.body.data, ...second.body.data].map((n: { id: string }) => n.id));
    expect(ids.size).toBe(3);
  });

  it("counts and filters agree", async () => {
    const m = await newMerchant();
    await seed(m.merchantId, "booking"); // hire
    await seed(m.merchantId, "payout"); // money
    await seed(m.merchantId, "payout"); // money
    await seed(m.merchantId, "review", { readAt: new Date() }); // doc, read

    const all = await request(app).get("/merchant/notifications").set(auth(m.accessToken));
    expect(all.body.counts).toMatchObject({ all: 4, unread: 3, bookings: 1, money: 2, documents: 1, ratings: 0 });

    const money = await request(app).get("/merchant/notifications?filter=money").set(auth(m.accessToken));
    expect(money.body.data).toHaveLength(2);
    expect(money.body.data.every((n: { kind: string }) => n.kind === "money")).toBe(true);

    const unread = await request(app).get("/merchant/notifications?filter=unread").set(auth(m.accessToken));
    expect(unread.body.data).toHaveLength(3);
  });

  it("surfaces the newest unread booking request as the urgent banner", async () => {
    const m = await newMerchant();
    await seed(m.merchantId, "payout");
    const urgentId = await seed(m.merchantId, "booking", { occurredAt: new Date() });

    const res = await request(app).get("/merchant/notifications").set(auth(m.accessToken));
    expect(res.body.urgent?.id).toBe(urgentId);
  });

  it("marks one read and marks all read", async () => {
    const m = await newMerchant();
    const a = await seed(m.merchantId, "booking");
    await seed(m.merchantId, "payout");

    const one = await request(app).post(`/merchant/notifications/${a}/read`).set(auth(m.accessToken));
    expect(one.status).toBe(200);
    expect(one.body.unread).toBe(1);

    const all = await request(app).post("/merchant/notifications/read-all").set(auth(m.accessToken));
    expect(all.body.marked).toBe(1);
    expect(all.body.unread).toBe(0);

    const feed = await request(app).get("/merchant/notifications").set(auth(m.accessToken));
    expect(feed.body.unread).toBe(0);
  });

  it("404s a read for a notification on another account", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    const id = await seed(theirs.merchantId, "booking");
    const res = await request(app).post(`/merchant/notifications/${id}/read`).set(auth(mine.accessToken));
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/merchant/notifications")).status).toBe(401);
  });
});

describe("merchant notifications — preferences", () => {
  it("round-trips the matrix and quiet hours", async () => {
    const m = await newMerchant();

    const before = await request(app).get("/merchant/notification-preferences").set(auth(m.accessToken));
    expect(before.status).toBe(200);
    expect(before.body.categories).toHaveLength(6);
    // `return` defaults to both off.
    const ret = before.body.categories.find((c: { category: string }) => c.category === "return");
    expect(ret).toMatchObject({ sms: false, email: false });

    const put = await request(app)
      .put("/merchant/notification-preferences")
      .set(auth(m.accessToken))
      .send({
        categories: before.body.categories.map((c: { category: string }) => ({
          category: c.category,
          sms: c.category === "return" ? true : c.category === "payout" || c.category === "review",
          email: true,
        })),
        quiet_hours: { enabled: true, from: "21:30", until: "07:00" },
      });
    expect(put.status).toBe(200);
    expect(put.body.quiet_hours).toMatchObject({ enabled: true, from: "21:30", until: "07:00" });
    expect(put.body.categories.find((c: { category: string }) => c.category === "return")).toMatchObject({
      sms: true,
      email: true,
    });

    const after = await request(app).get("/merchant/notification-preferences").set(auth(m.accessToken));
    expect(after.body.categories.find((c: { category: string }) => c.category === "return").sms).toBe(true);
    expect(after.body.quiet_hours.from).toBe("21:30");
  });

  it("rejects clearing a locked SMS channel", async () => {
    const m = await newMerchant();
    const res = await request(app)
      .put("/merchant/notification-preferences")
      .set(auth(m.accessToken))
      .send({
        categories: [{ category: "payout", sms: false, email: true }],
        quiet_hours: { enabled: false, from: null, until: null },
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("channel_locked");
  });
});

describe("merchant notifications — quiet hours", () => {
  it("delays a held alert inside the window and not outside it", () => {
    // Window 22:00–06:30 Nairobi. 02:00 Nairobi is 23:00 UTC the day before.
    const inside = new Date("2026-09-01T23:00:00.000Z");
    const outside = new Date("2026-09-01T09:00:00.000Z"); // 12:00 Nairobi
    const quiet = { enabled: true, from: "22:00", until: "06:30" };

    expect(quietHoursDelayMs(quiet, inside)).toBeGreaterThan(0);
    expect(quietHoursDelayMs(quiet, outside)).toBe(0);
    expect(quietHoursDelayMs({ ...quiet, enabled: false }, inside)).toBe(0);
  });

  it("payout and review bypass quiet hours; booking does not", () => {
    expect(categoryBypassesQuietHours("payout")).toBe(true);
    expect(categoryBypassesQuietHours("review")).toBe(true);
    expect(categoryBypassesQuietHours("booking")).toBe(false);
    expect(categoryLocksSms("payout")).toBe(true);
    expect(categoryLocksSms("booking")).toBe(false);
  });

  it("enqueue holds a booking alert but lets a payout through immediately", async () => {
    const m = await newMerchant();
    await db("merchants")
      .where({ id: m.merchantId })
      .update({ quiet_hours_enabled: true, quiet_from: "00:00", quiet_until: "23:59" });

    const bookingId = await seed(m.merchantId, "booking");
    const payoutId = await seed(m.merchantId, "payout");

    const addBulk = vi
      .spyOn(
        // @ts-expect-error — reaching into the queue singleton for the test
        (await import("../../../jobs/notification-delivery.js")).notificationDeliveryQueue,
        "addBulk",
      )
      .mockResolvedValue([] as never);

    await enqueueNotificationDelivery(m.merchantId, [bookingId, payoutId]);

    const jobs = addBulk.mock.calls[0]?.[0] as Array<{ data: { notificationId: string }; opts: { delay?: number } }>;
    const bookingJob = jobs.find((j) => j.data.notificationId === bookingId);
    const payoutJob = jobs.find((j) => j.data.notificationId === payoutId);
    expect(bookingJob?.opts.delay).toBeGreaterThan(0);
    expect(payoutJob?.opts.delay ?? 0).toBe(0);

    addBulk.mockRestore();
  });
});

describe("merchant notifications — delivery", () => {
  it("skips SMS when the phone is unverified, sends it once verified", async () => {
    const m = await newMerchant();
    // `expiry` defaults to sms:true, email:true and is not quiet-hours locked.
    const id = await seed(m.merchantId, "expiry");

    const smsSpy = vi.spyOn(smsAdapter, "send").mockResolvedValue({ providerId: "x" });
    const emailSpy = vi.spyOn(emailAdapter, "send").mockResolvedValue({ providerId: "y" });

    // No phone on file at all.
    await deliverNotification({ notificationId: id });
    expect(smsSpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledTimes(1);

    // Phone present but unverified.
    await db("users")
      .where({ id: m.userId })
      .update({ phone: `+2547${randomInt(10_000_000, 99_999_999)}`, phone_verified: false });
    await deliverNotification({ notificationId: id });
    expect(smsSpy).not.toHaveBeenCalled();

    // Verified — now it texts.
    await db("users").where({ id: m.userId }).update({ phone_verified: true });
    await deliverNotification({ notificationId: id });
    expect(smsSpy).toHaveBeenCalledTimes(1);

    smsSpy.mockRestore();
    emailSpy.mockRestore();
  });
});

describe("merchant notifications — retention & generators", () => {
  it("purges only notifications older than 90 days", async () => {
    const m = await newMerchant();
    const fresh = await seed(m.merchantId, "booking", { occurredAt: new Date(Date.now() - 10 * 86_400_000) });
    const old = await seed(m.merchantId, "booking", { occurredAt: new Date(Date.now() - 100 * 86_400_000) });

    const deleted = await purgeExpiredNotifications();
    expect(deleted).toBeGreaterThanOrEqual(1);

    expect(await db("notifications").where({ id: fresh }).first()).toBeTruthy();
    expect(await db("notifications").where({ id: old }).first()).toBeFalsy();
  });

  it("writes an insurance-expiry notification once per vehicle, not on every sweep", async () => {
    const m = await newMerchant();
    const in10Days = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const [vehicle] = await db("vehicles")
      .insert({
        id: generateId("vehicle"),
        merchant_id: m.merchantId,
        type: "sedan",
        make: "Toyota",
        model: "Vitz",
        year: "2018",
        registration: `KDN ${randomInt(100, 999)}${String.fromCharCode(65 + randomInt(0, 25))}`,
        transmission: "Automatic",
        fuel: "Petrol",
        county: "Nairobi",
        pickup_address: "Nairobi",
        daily_rate_amount: 350000,
        status: "live",
        insurance_expiry: in10Days,
        listing_ref: await nextListingRef(db),
      })
      .returning("*");

    const first = await runExpiryNotificationSweep();
    expect(first).toBeGreaterThanOrEqual(1);
    const rows = await db("notifications").where({ merchant_id: m.merchantId, category: "expiry", subject_id: vehicle.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("doc");

    // A second sweep the same cycle must not add a duplicate.
    await runExpiryNotificationSweep();
    const after = await db("notifications").where({ merchant_id: m.merchantId, category: "expiry", subject_id: vehicle.id });
    expect(after).toHaveLength(1);
  });
});

describe("merchant notifications — transactional guarantee", () => {
  it("writes the row in the same transaction as its cause — a rollback takes it with it", async () => {
    const m = await newMerchant();

    await expect(
      db.transaction(async (trx) => {
        await notify(trx, { merchantId: m.merchantId, category: "booking", title: "doomed", body: "x" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rows = await db("notifications").where({ merchant_id: m.merchantId, title: "doomed" });
    expect(rows).toHaveLength(0);
  });
});
