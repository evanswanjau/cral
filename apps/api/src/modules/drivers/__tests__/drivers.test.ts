import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createVerifiedTestUser, testPdf } from "../../../test/helpers.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) await db("users").whereIn("id", createdUserIds).delete();
  await db.destroy();
});

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(-10);

function driverBody(overrides: Record<string, unknown> = {}) {
  const n = uniq();
  return {
    full_name: "Peter Kamau",
    phone: "0712345678",
    national_id: `ID${n}`,
    kra_pin: `A${n}Z`,
    licence_number: `DL${n}`,
    licence_expiry: "2031-06-30",
    county: "Nairobi",
    daily_rate: "3000",
    ...overrides,
  };
}

async function uploadAll(token: string, driverId: string, kinds = ["driving_licence", "national_id", "kra_pin"]) {
  for (const kind of kinds) {
    const res = await request(app)
      .post(`/merchant/drivers/${driverId}/documents`)
      .set(auth(token))
      .field(kind === "driving_licence" ? { kind, expires_at: "2031-06-30" } : { kind })
      .attach("file", testPdf(`fake ${kind}`), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    expect(res.status).toBe(200);
  }
}

describe("merchant drivers", () => {
  it("creates a draft driver with normalised phone and rates in cents", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app).post("/merchant/drivers").set(auth(accessToken)).send(driverBody({ hourly_rate: "500" }));
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^drv_/);
    expect(res.body.status).toBe("draft");
    expect(res.body.phone).toBe("+254712345678");
    expect(res.body.rates).toEqual({
      day: { amount: 300000, currency: "KES" },
      hour: { amount: 50000, currency: "KES" },
      trip: null,
    });
    expect(res.body.doc_count).toBe(0);

    const list = await request(app).get("/merchant/drivers").set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.counts).toEqual({ all: 1, needs_action: 0, live: 0 });
  });

  it("lets a merchant have many drivers, but a driver belongs to one merchant only", async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const first = driverBody();
    expect((await request(app).post("/merchant/drivers").set(auth(a.accessToken)).send(first)).status).toBe(201);
    expect((await request(app).post("/merchant/drivers").set(auth(a.accessToken)).send(driverBody())).status).toBe(201);

    // Same ID, formatted differently, under another merchant.
    const clash = await request(app)
      .post("/merchant/drivers")
      .set(auth(b.accessToken))
      .send(driverBody({ national_id: ` ${first.national_id.toLowerCase()} ` }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("driver_taken");

    const licenceClash = await request(app)
      .post("/merchant/drivers")
      .set(auth(b.accessToken))
      .send(driverBody({ licence_number: first.licence_number }));
    expect(licenceClash.status).toBe(409);
    expect(licenceClash.body.error.field).toBe("licence_number");
  });

  it("refuses a past licence expiry and a bad phone", async () => {
    const { accessToken } = await newMerchant();
    const past = await request(app).post("/merchant/drivers").set(auth(accessToken)).send(driverBody({ licence_expiry: "2020-01-01" }));
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe("expiry_in_past");
    const phone = await request(app).post("/merchant/drivers").set(auth(accessToken)).send(driverBody({ phone: "12" }));
    expect(phone.status).toBe(422);
    expect(phone.body.error.code).toBe("invalid_phone");
  });

  it("needs all three documents and a rate before it can be submitted", async () => {
    const { accessToken } = await newMerchant();
    const created = await request(app)
      .post("/merchant/drivers")
      .set(auth(accessToken))
      .send(driverBody({ daily_rate: "" }));
    const id = created.body.id as string;

    const noRate = await request(app).post(`/merchant/drivers/${id}/submit`).set(auth(accessToken));
    expect(noRate.status).toBe(422);
    expect(noRate.body.error.code).toBe("driver_rate_required");

    await request(app).patch(`/merchant/drivers/${id}`).set(auth(accessToken)).send({ trip_rate: "8000" });
    const noDocs = await request(app).post(`/merchant/drivers/${id}/submit`).set(auth(accessToken));
    expect(noDocs.status).toBe(422);
    expect(noDocs.body.error.code).toBe("documents_incomplete");

    await uploadAll(accessToken, id);
    const ok = await request(app).post(`/merchant/drivers/${id}/submit`).set(auth(accessToken));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("pending");
    expect(ok.body.doc_count).toBe(3);

    // Identity is locked once a reviewer has it; rates are not.
    const locked = await request(app).patch(`/merchant/drivers/${id}`).set(auth(accessToken)).send({ full_name: "Someone Else" });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("driver_locked");
    const rate = await request(app).patch(`/merchant/drivers/${id}`).set(auth(accessToken)).send({ daily_rate: "3500" });
    expect(rate.status).toBe(200);
    expect(rate.body.rates.day).toEqual({ amount: 350000, currency: "KES" });

    const notif = await db("notifications").where({ subject_type: "driver", subject_id: id }).first();
    expect(notif?.category).toBe("review");
  });

  it("uses the account's own ID and KRA PIN for the account holder", async () => {
    const { accessToken } = await newMerchant();
    const created = await request(app)
      .post("/merchant/drivers")
      .set(auth(accessToken))
      .send(driverBody({ is_account_holder: true }));
    const id = created.body.id as string;

    const refused = await request(app)
      .post(`/merchant/drivers/${id}/documents`)
      .set(auth(accessToken))
      .field({ kind: "national_id" })
      .attach("file", testPdf("id"), { filename: "id.pdf", contentType: "application/pdf" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("account_document");

    for (const kind of ["national_id", "kra_pin"]) {
      await request(app)
        .post("/merchant/onboarding/documents")
        .set(auth(accessToken))
        .field("kind", kind)
        .attach("file", testPdf(kind), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    }
    await uploadAll(accessToken, id, ["driving_licence"]);
    const driver = await request(app).get(`/merchant/drivers/${id}`).set(auth(accessToken));
    expect(driver.body.documents.national_id.from_account).toBe(true);
    expect(driver.body.doc_count).toBe(3);

    // The account's own documents are untouched by the driver's rows.
    const onboarding = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(onboarding.body.owner_docs.national_id).not.toBeNull();

    const twice = await request(app)
      .post("/merchant/drivers")
      .set(auth(accessToken))
      .send(driverBody({ is_account_holder: true }));
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("account_holder_exists");
  });

  it("keeps another merchant's driver out of reach", async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const created = await request(app).post("/merchant/drivers").set(auth(a.accessToken)).send(driverBody());
    const res = await request(app).get(`/merchant/drivers/${created.body.id}`).set(auth(b.accessToken));
    expect(res.status).toBe(404);
  });

  it("deletes a driver with no bookings", async () => {
    const { accessToken } = await newMerchant();
    const created = await request(app).post("/merchant/drivers").set(auth(accessToken)).send(driverBody());
    const del = await request(app).delete(`/merchant/drivers/${created.body.id}`).set(auth(accessToken));
    expect(del.status).toBe(204);
    expect(await db("drivers").where({ id: created.body.id }).first()).toBeUndefined();
  });

  it("reports drivers_only on onboarding", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app).patch("/merchant/onboarding").set(auth(accessToken)).send({ drivers_only: true });
    expect(res.status).toBe(200);
    expect(res.body.drivers_only).toBe(true);
  });
});
