import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("merchant onboarding — GET/PATCH", () => {
  it("returns a fresh empty draft for a merchant with no row yet", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      step: 1,
      screen: "fleet",
      owner_type: "individual",
      submitted: false,
      vehicles: [],
    });
    expect(res.body.last_activity_at).toBeTruthy();
  });

  it("PATCH persists fields and bumps last_activity_at", async () => {
    const { accessToken } = await newMerchant();
    const before = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    const beforeActivity = before.body.last_activity_at;

    await new Promise((r) => setTimeout(r, 10));

    const patchRes = await request(app)
      .patch("/merchant/onboarding")
      .set(auth(accessToken))
      .send({ first_name: "Amani", surname: "Otieno", county: "Nairobi", step: 2 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.first_name).toBe("Amani");
    expect(patchRes.body.surname).toBe("Otieno");
    expect(patchRes.body.step).toBe(2);
    expect(new Date(patchRes.body.last_activity_at).getTime()).toBeGreaterThan(
      new Date(beforeActivity).getTime(),
    );
  });

  it("remembers the furthest step reached, and never walks it backwards", async () => {
    const { accessToken } = await newMerchant();

    await request(app)
      .patch("/merchant/onboarding")
      .set(auth(accessToken))
      .send({ step: 4, max_step: 4 });

    // Navigating back to an earlier step must not make step 4 unreachable —
    // max_step is monotonic, so the stepper's visited tabs survive a reload.
    const back = await request(app)
      .patch("/merchant/onboarding")
      .set(auth(accessToken))
      .send({ step: 2, max_step: 2 });

    expect(back.status).toBe(200);
    expect(back.body.step).toBe(2);
    expect(back.body.max_step).toBe(4);
  });

  it("accepting terms is reflected in terms_accepted", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app)
      .patch("/merchant/onboarding")
      .set(auth(accessToken))
      .send({ terms_accepted: true });
    expect(res.status).toBe(200);
    expect(res.body.terms_accepted).toBe(true);
  });
});

describe("merchant onboarding — vehicle CRUD", () => {
  it("adds, edits, and removes a vehicle", async () => {
    const { accessToken } = await newMerchant();

    const createRes = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(auth(accessToken))
      .send({
        type: "Car",
        make: "Toyota",
        model: "Axio",
        year: "2019",
        registration: "KDL 442N",
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "Westlands, Nairobi",
        daily_rate: "4500",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toMatch(/^veh_/);
    expect(createRes.body.daily_rate).toBe("4500");
    const vehicleId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/merchant/onboarding/vehicles/${vehicleId}`)
      .set(auth(accessToken))
      .send({ colour: "Pearl white" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.colour).toBe("Pearl white");

    const getRes = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(getRes.body.vehicles).toHaveLength(1);

    const deleteRes = await request(app)
      .delete(`/merchant/onboarding/vehicles/${vehicleId}`)
      .set(auth(accessToken));
    expect(deleteRes.status).toBe(204);

    const getAfter = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(getAfter.body.vehicles).toHaveLength(0);
  });

  it("round-trips insurance_expiry as the exact calendar date, with no timezone shift", async () => {
    const { accessToken } = await newMerchant();
    const createRes = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(auth(accessToken))
      .send({
        type: "Car",
        make: "Toyota",
        model: "Axio",
        year: "2019",
        registration: "KDL 900X",
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "Westlands, Nairobi",
        daily_rate: "4500",
        insurance_expiry: "2027-03-16",
      });
    expect(createRes.status).toBe(201);

    // A bare calendar date must come back byte-identical. node-pg's default
    // DATE parser builds a JS Date at *local* midnight, which in Nairobi
    // (UTC+3) serialised 2027-03-16 as "2027-03-15T21:00:00.000Z" — a day
    // earlier, and a full ISO datetime that renders blank in an
    // <input type="date">. See the DATE type parser in db/knexfile.ts.
    expect(createRes.body.insurance_expiry).toBe("2027-03-16");

    const getRes = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(getRes.body.vehicles[0].insurance_expiry).toBe("2027-03-16");
  });

  it("404s editing a vehicle that belongs to someone else", async () => {
    const owner = await newMerchant();
    const stranger = await newMerchant();

    const createRes = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(auth(owner.accessToken))
      .send({
        type: "Car",
        make: "Toyota",
        model: "Vitz",
        year: "2018",
        registration: "KDA 100A",
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "CBD, Nairobi",
        daily_rate: "3000",
      });

    const res = await request(app)
      .patch(`/merchant/onboarding/vehicles/${createRes.body.id}`)
      .set(auth(stranger.accessToken))
      .send({ colour: "Red" });
    expect(res.status).toBe(404);
  });
});

describe("merchant onboarding — document upload", () => {
  it("uploads an owner document and writes it to local storage", async () => {
    const { accessToken } = await newMerchant();

    const res = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "national_id")
      .attach("file", Buffer.from("fake id scan"), {
        filename: "id.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body.document_id).toMatch(/^doc_/);

    const getRes = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(getRes.body.owner_docs.national_id).toMatchObject({
      status: "attached",
      document_id: res.body.document_id,
    });

    const row = await db("documents").where({ id: res.body.document_id }).first();
    const root = process.env.STORAGE_LOCAL_DIR ?? "./.local-storage";
    expect(existsSync(resolve(root, row.storage_key))).toBe(true);
  });

  it("serves an uploaded document's bytes back to its owner, and 404s for anyone else", async () => {
    const owner = await newMerchant();
    const stranger = await newMerchant();
    const bytes = Buffer.from("the actual file contents");

    const upload = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(owner.accessToken))
      .field("kind", "national_id")
      .attach("file", bytes, { filename: "id.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(201);

    // This read path is what lets a photo still render after a reload —
    // object URLs die with the page, so the bytes must come back.
    const download = await request(app)
      .get(`/merchant/onboarding/documents/${upload.body.document_id}`)
      .set(auth(owner.accessToken));
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("image/jpeg");
    // Per-user content behind a bearer token must never reach a shared cache.
    expect(download.headers["cache-control"]).toContain("private");
    expect(Buffer.from(download.body).equals(bytes)).toBe(true);

    const asStranger = await request(app)
      .get(`/merchant/onboarding/documents/${upload.body.document_id}`)
      .set(auth(stranger.accessToken));
    expect(asStranger.status).toBe(404);
  });

  it("rejects a vehicle-scoped kind without vehicle_id", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "logbook")
      .attach("file", Buffer.from("fake logbook"), { filename: "logbook.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(422);
  });

  it("uploads a vehicle photo and caps it at 3 per vehicle", async () => {
    const { accessToken } = await newMerchant();
    const vehicleRes = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(auth(accessToken))
      .send({
        type: "Car",
        make: "Toyota",
        model: "Axio",
        year: "2019",
        registration: "KDL 442P",
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "Westlands, Nairobi",
        daily_rate: "4500",
      });
    const vehicleId = vehicleRes.body.id;

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/merchant/onboarding/documents")
        .set(auth(accessToken))
        .field("kind", "vehicle_photo")
        .field("vehicle_id", vehicleId)
        .attach("file", Buffer.from(`photo-${i}`), { filename: `photo-${i}.jpg`, contentType: "image/jpeg" });
      expect(res.status).toBe(201);
    }

    const getRes = await request(app).get("/merchant/onboarding").set(auth(accessToken));
    expect(getRes.body.vehicles[0].photos).toHaveLength(3);

    const fourth = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "vehicle_photo")
      .field("vehicle_id", vehicleId)
      .attach("file", Buffer.from("photo-4"), { filename: "photo-4.jpg", contentType: "image/jpeg" });
    expect(fourth.status).toBe(422);
  });

  it("replaces a single-slot document on re-upload", async () => {
    const { accessToken } = await newMerchant();
    const first = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "kra_pin")
      .attach("file", Buffer.from("v1"), { filename: "v1.pdf", contentType: "application/pdf" });

    const second = await request(app)
      .post("/merchant/onboarding/documents")
      .set(auth(accessToken))
      .field("kind", "kra_pin")
      .attach("file", Buffer.from("v2"), { filename: "v2.pdf", contentType: "application/pdf" });

    expect(second.status).toBe(201);
    const stillThere = await db("documents").where({ id: first.body.document_id }).first();
    expect(stillThere).toBeUndefined();
  });
});

describe("merchant onboarding — submit", () => {
  it("422s when incomplete and 200s once every requirement is satisfied", async () => {
    const { accessToken } = await newMerchant();

    const incomplete = await request(app).post("/merchant/onboarding/submit").set(auth(accessToken));
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error.code).toBe("incomplete_onboarding");

    await request(app)
      .patch("/merchant/onboarding")
      .set(auth(accessToken))
      .send({
        first_name: "Amani",
        surname: "Otieno",
        national_id: "12345678",
        kra_pin: "A012345678Z",
        county: "Nairobi",
        payout_same: true,
        phone: "+254712345678",
        terms_accepted: true,
      });

    const vehicleRes = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(auth(accessToken))
      .send({
        type: "Car",
        make: "Toyota",
        model: "Axio",
        year: "2019",
        registration: "KDL 442N",
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "Westlands, Nairobi",
        daily_rate: "4500",
      });
    const vehicleId = vehicleRes.body.id;

    for (const kind of ["national_id", "kra_pin"]) {
      await request(app)
        .post("/merchant/onboarding/documents")
        .set(auth(accessToken))
        .field("kind", kind)
        .attach("file", Buffer.from("doc"), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    }
    for (const kind of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
      await request(app)
        .post("/merchant/onboarding/documents")
        .set(auth(accessToken))
        .field("kind", kind)
        .field("vehicle_id", vehicleId)
        .attach("file", Buffer.from("doc"), { filename: `${kind}.pdf`, contentType: "application/pdf" });
    }

    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await request(app)
      .patch(`/merchant/onboarding/vehicles/${vehicleId}`)
      .set(auth(accessToken))
      .send({ insurance_expiry: futureDate });

    const submitRes = await request(app).post("/merchant/onboarding/submit").set(auth(accessToken));
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.submitted).toBe(true);

    const auditRow = await db("audit_log")
      .where({ action: "merchant.onboarding.submitted" })
      .orderBy("created_at", "desc")
      .first();
    expect(auditRow).toBeTruthy();
  });
});
