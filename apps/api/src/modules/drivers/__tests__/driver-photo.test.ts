import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createVerifiedTestUser, testFile, testJpeg, testPdf } from "../../../test/helpers.js";

/**
 * The driver's one photo (DR2, docs/plans/drivers-that-work.md): set by
 * the merchant, images only and checked on the bytes, audited, shown to
 * Ops on the case and served publicly only while the driver is public.
 */

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function merchantWithDriver() {
  const user = await createVerifiedTestUser();
  userIds.push(user.userId);
  const n = ulid().slice(-8);
  const res = await request(app)
    .post("/merchant/drivers")
    .set(auth(user.accessToken))
    .send({
      full_name: "Peter Kamau",
      phone: "0712345678",
      national_id: `PID${n}`,
      kra_pin: `A${n}Z`,
      licence_number: `PDL${n}`,
      licence_expiry: "2031-06-30",
      county: "Nairobi",
      daily_rate: "3000",
    });
  expect(res.status).toBe(201);
  return { token: user.accessToken, driverId: res.body.id as string };
}

const putPhoto = (token: string, driverId: string, body: Buffer, contentType: string, filename = "face.jpg") =>
  request(app).post(`/merchant/drivers/${driverId}/photo`).set(auth(token)).attach("file", body, { filename, contentType });

/** Make the driver public: live, on an approved merchant. */
async function goPublic(driverId: string) {
  const driver = await db("drivers").where({ id: driverId }).first("merchant_id");
  await db("merchants").where({ id: driver.merchant_id }).update({ approved_at: new Date() });
  await db("drivers").where({ id: driverId }).update({ status: "live" });
}

const text = (res: request.Response) => Buffer.from(res.body as Buffer).toString("utf8");

describe("driver photo", () => {
  it("sets a photo, audits it, and serves it back to the merchant", async () => {
    const { token, driverId } = await merchantWithDriver();
    const before = await request(app).get(`/merchant/drivers/${driverId}`).set(auth(token));
    expect(before.body.photo_id).toBeNull();

    const res = await putPhoto(token, driverId, testJpeg("face one"), "image/jpeg");
    expect(res.status).toBe(200);
    expect(res.body.photo_id).toMatch(/^fil_/);
    // A picture, not a check: status and documents are untouched.
    expect(res.body.status).toBe("draft");
    expect(res.body.doc_count).toBe(0);

    const audit = await db("audit_log").where({ entity_id: driverId, action: "driver.photo_set" }).first();
    expect(audit).toBeTruthy();

    const bytes = await request(app).get(`/merchant/drivers/${driverId}/photo`).set(auth(token)).buffer(true);
    expect(bytes.status).toBe(200);
    expect(bytes.headers["content-type"]).toBe("image/jpeg");
    expect(bytes.headers["x-content-type-options"]).toBe("nosniff");
    expect(text(bytes)).toContain("face one");
  });

  it("refuses a PDF, a non-image, a file that isn't what it claims, and no file", async () => {
    const { token, driverId } = await merchantWithDriver();

    const pdf = await putPhoto(token, driverId, testPdf("not a face"), "application/pdf", "face.pdf");
    expect(pdf.status).toBe(415);
    expect(pdf.body.error.code).toBe("unsupported_file_type");

    const html = await putPhoto(token, driverId, Buffer.from("<html>hi</html>"), "text/html", "face.html");
    expect(html.status).toBe(415);

    const fake = await putPhoto(token, driverId, Buffer.from("plain text"), "image/png", "face.png");
    expect(fake.status).toBe(422);
    expect(fake.body.error.code).toBe("file_content_mismatch");

    const none = await request(app).post(`/merchant/drivers/${driverId}/photo`).set(auth(token));
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("file_required");

    const after = await db("drivers").where({ id: driverId }).first("photo_id");
    expect(after.photo_id).toBeNull();
  });

  it("keeps another merchant away from the photo", async () => {
    const a = await merchantWithDriver();
    const b = await merchantWithDriver();
    expect((await putPhoto(a.token, a.driverId, testJpeg(), "image/jpeg")).status).toBe(200);
    expect((await request(app).get(`/merchant/drivers/${a.driverId}/photo`).set(auth(b.token))).status).toBe(404);
    expect((await putPhoto(b.token, a.driverId, testJpeg(), "image/jpeg")).status).toBe(404);
  });

  it("gives a public driver a photo_url that serves the current photo only", async () => {
    const { token, driverId } = await merchantWithDriver();
    await putPhoto(token, driverId, testFile("image/png", "png face"), "image/png", "face.png");
    const first = await db("drivers").where({ id: driverId }).first("photo_id");

    // Not public yet: the photo isn't either.
    expect((await request(app).get(`/catalog/drivers/${driverId}/photo/${first.photo_id}`)).status).toBe(404);

    await goPublic(driverId);
    const profile = await request(app).get(`/catalog/drivers/${driverId}`);
    expect(profile.status).toBe(200);
    expect(profile.body.photo_url).toBe(`/catalog/drivers/${driverId}/photo/${first.photo_id}`);

    const img = await request(app).get(profile.body.photo_url).buffer(true);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    expect(text(img)).toContain("png face");

    // Replacing the photo retires the old URL.
    const replaced = await putPhoto(token, driverId, testJpeg("new face"), "image/jpeg");
    expect(replaced.body.photo_id).not.toBe(first.photo_id);
    expect((await request(app).get(profile.body.photo_url)).status).toBe(404);
    const fresh = await request(app).get(`/catalog/drivers/${driverId}`);
    expect(fresh.body.photo_url).toBe(`/catalog/drivers/${driverId}/photo/${replaced.body.photo_id}`);

    // Removed: the site falls back to the first letter.
    const removed = await request(app).delete(`/merchant/drivers/${driverId}/photo`).set(auth(token));
    expect(removed.status).toBe(200);
    expect(removed.body.photo_id).toBeNull();
    expect((await request(app).get(`/catalog/drivers/${driverId}`)).body.photo_url).toBeNull();
    expect(await db("audit_log").where({ entity_id: driverId, action: "driver.photo_removed" }).first()).toBeTruthy();

    // A paused driver's photo is not public.
    await putPhoto(token, driverId, testJpeg(), "image/jpeg");
    const current = await db("drivers").where({ id: driverId }).first("photo_id");
    await db("drivers").where({ id: driverId }).update({ status: "paused" });
    expect((await request(app).get(`/catalog/drivers/${driverId}/photo/${current.photo_id}`)).status).toBe(404);
  });

  it("shows Ops the photo on the case, apart from the documents", async () => {
    const { token, driverId } = await merchantWithDriver();
    const admin = await createTestAdmin("admin_super");
    adminIds.push(admin.adminId);
    // Ops has no case for a draft; this one has been sent for review.
    await db("drivers").where({ id: driverId }).update({ status: "pending", submitted_at: new Date() });

    const none = await request(app).get(`/admin/drivers/${driverId}`).set(auth(admin.token));
    expect(none.status).toBe(200);
    expect(none.body.photo_id).toBeNull();
    expect((await request(app).get(`/admin/drivers/${driverId}/photo`).set(auth(admin.token))).status).toBe(404);

    await putPhoto(token, driverId, testJpeg("ops face"), "image/jpeg");
    const kase = await request(app).get(`/admin/drivers/${driverId}`).set(auth(admin.token));
    expect(kase.body.photo_id).toMatch(/^fil_/);
    expect(kase.body.documents.map((d: { kind: string }) => d.kind)).toEqual(["driving_licence", "national_id", "kra_pin"]);

    const img = await request(app).get(`/admin/drivers/${driverId}/photo`).set(auth(admin.token)).buffer(true);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(text(img)).toContain("ops face");
  });
});
