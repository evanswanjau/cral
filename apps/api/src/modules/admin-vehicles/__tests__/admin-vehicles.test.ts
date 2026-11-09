import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createVerifiedTestUser, testJpeg, testPdf } from "../../../test/helpers.js";

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    const merchantIds = (await db("merchants").whereIn("user_id", userIds).select("id")).map((m) => m.id);
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

/**
 * A registration is globally unique across every merchant, so a fixed test
 * plate collides with other suites' fixed plates in the parallel run.
 * `K` + 2 letters + 3 digits + 1 letter — matches lib/vehicle-checks.ts's
 * PLATE_RE so the plate-format check passes.
 */
function randomPlate(): string {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const D = () => String.fromCharCode(48 + Math.floor(Math.random() * 10));
  return `K${L()}${L()} ${D()}${D()}${D()}${L()}`;
}

async function newMerchant() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}
async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

const BASE_VEHICLE = {
  type: "sedan" as const,
  make: "Toyota",
  model: "Axio",
  year: "2019",
  transmission: "Automatic" as const,
  fuel: "Petrol" as const,
  county: "Nairobi",
  pickup_address: "Westlands, Nairobi",
  daily_rate: "4500",
};

/** Creates a merchant, a fully-documented vehicle (incl. the account docs), and submits it. */
async function submittedVehicle(): Promise<{ token: string; vehicleId: string; merchantId: string }> {
  const { accessToken, userId } = await newMerchant();

  for (const kind of ["national_id", "kra_pin"]) {
    await request(app)
      .post("/merchant/onboarding/documents")
      .set(bearer(accessToken))
      .field("kind", kind)
      .attach("file", testPdf(kind), { filename: `${kind}.pdf`, contentType: "application/pdf" });
  }

  const created = await request(app)
    .post("/merchant/vehicles")
    .set(bearer(accessToken))
    .send({ ...BASE_VEHICLE, registration: randomPlate() });
  expect(created.status).toBe(201);
  const vehicleId = created.body.id as string;

  for (const kind of ["logbook", "comprehensive_insurance", "tracker_certificate"]) {
    await request(app)
      .post(`/merchant/vehicles/${vehicleId}/documents`)
      .set(bearer(accessToken))
      .field(kind === "comprehensive_insurance" ? { kind, expires_at: "2030-01-01" } : { kind })
      .attach("file", testPdf(kind), { filename: `${kind}.pdf`, contentType: "application/pdf" });
  }
  for (let i = 0; i < 3; i++) {
    await request(app)
      .post("/merchant/onboarding/documents")
      .set(bearer(accessToken))
      .field("kind", "vehicle_photo")
      .field("vehicle_id", vehicleId)
      .attach("file", testJpeg(`p${i}`), { filename: `p${i}.jpg`, contentType: "image/jpeg" });
  }

  const submitted = await request(app).post(`/merchant/vehicles/${vehicleId}/submit`).set(bearer(accessToken));
  expect(submitted.status).toBe(200);
  const merchant = await db("merchants").where({ user_id: userId }).first();
  return { token: accessToken, vehicleId, merchantId: merchant.id as string };
}

/** Runs the merchant-approval gate: pass every checklist item (which accepts the business docs), approve. */
async function approveMerchant(adminToken: string, merchantId: string) {
  const file = await request(app).get(`/admin/merchants/${merchantId}`).set(bearer(adminToken));
  for (const it of file.body.checklist.items as Array<{ id: string }>) {
    await request(app)
      .post(`/admin/merchants/${merchantId}/checklist`)
      .set(bearer(adminToken))
      .send({ item_id: it.id, result: "pass" });
  }
  const res = await request(app)
    .post(`/admin/merchants/${merchantId}/approve`)
    .set(bearer(adminToken))
    .set(idem());
  expect(res.status).toBe(200);
  expect(res.body.approved).toBe(true);
}

/** Answers every item on a vehicle case's checklist - `pass`, except the ids in `flag`. */
async function workVehicleChecklist(adminToken: string, vehicleId: string, flag: string[] = []) {
  const detail = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(adminToken));
  for (const it of detail.body.checklist.items as Array<{ id: string; skipped: boolean }>) {
    if (it.skipped) continue;
    const res = await request(app)
      .post(`/admin/vehicles/${vehicleId}/checklist`)
      .set(bearer(adminToken))
      .send({ item_id: it.id, result: flag.includes(it.id) ? "flag" : "pass" });
    expect(res.status).toBe(200);
  }
  // A document with no checks of its own (the tracker, under the rate line)
  // is decided by hand - until then it counts as an open check.
  for (const d of detail.body.documents as Array<{ kind: string; state: string; checklist: { total: number } }>) {
    if (d.checklist.total > 0 || d.state !== "pending") continue;
    const res = await request(app)
      .post(`/admin/vehicles/${vehicleId}/documents/${d.kind}/decision`)
      .set(bearer(adminToken))
      .set(idem())
      .send({ decision: "accept" });
    expect(res.status).toBe(200);
  }
}

// --- audience + role -------------------------------------------------

describe("the review queue is ops-only", () => {
  it("refuses a merchant token, and an admin outside the vehicles queue", async () => {
    const { accessToken } = await newMerchant();
    expect((await request(app).get("/admin/vehicles").set(bearer(accessToken))).status).toBe(401);

    const finance = await newAdmin("admin_finance", ["payouts"]);
    const denied = await request(app).get("/admin/vehicles").set(bearer(finance.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("insufficient_scope");

    const reviewer = await newAdmin("admin_reviewer", ["vehicles"]);
    const ok = await request(app).get("/admin/vehicles").set(bearer(reviewer.token));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ sla_days: 2 });
    expect(ok.body).toHaveProperty("counts");
  });
});

// --- the whole happy path in one flow ------------------------------

describe("the two gates: approve the merchant, then approve the car", () => {
  it("walks a submission to live through both gates and the checklist", async () => {
    const admin = await newAdmin();
    const { token: merchantToken, vehicleId, merchantId } = await submittedVehicle();

    // Queue: Needs review, 0/3 car docs, unassigned.
    const queued = await request(app).get("/admin/vehicles?bucket=needs_review").set(bearer(admin.token));
    const row = queued.body.data.find((v: { id: string }) => v.id === vehicleId);
    expect(row).toMatchObject({ bucket: "needs_review", docs_accepted: 0, docs_total: 3, assignee_initials: null });

    const assigned = await request(app).post(`/admin/vehicles/${vehicleId}/assign`).set(bearer(admin.token));
    expect(assigned.body).toMatchObject({ status: "review", bucket: "with_you", assigned_to_me: true });

    // The case: three advisory checks, the account docs as read-only context
    // (business not approved), and a checklist.
    const detail = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect((detail.body.checks as Array<{ id: string }>).map((c) => c.id).sort()).toEqual([
      "duplicate_plate",
      "insurance_expiry",
      "plate_format",
    ]);
    expect(detail.body.merchant_approved).toBe(false);
    expect(detail.body.documents.map((d: { kind: string }) => d.kind).sort()).toEqual([
      "comprehensive_insurance",
      "logbook",
      "tracker_certificate",
    ]);
    expect(detail.body.account_documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["kra_pin", "national_id"]);
    expect(detail.body.checklist.items.length).toBeGreaterThan(0);
    expect(detail.body.checklist.complete).toBe(false);
    expect(detail.body.can_decide).toBe(false);
    expect(detail.body.can_approve).toBe(false);

    // Checklist-first: nothing can be decided before every item is answered
    // (the tracker has no checks under the rate line, so it counts as one).
    expect(detail.body.approve_blockers.checklist_outstanding).toBe(detail.body.checklist.total + 1);
    const early = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe("checklist_incomplete");

    // Working the whole checklist accepts the three car docs on its own.
    await workVehicleChecklist(admin.token, vehicleId);
    const worked = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect(worked.body.can_decide).toBe(true);
    expect(worked.body.documents.every((d: { state: string }) => d.state === "ok")).toBe(true);

    // Gate 1 not met -> approve is refused with merchant_not_approved.
    const noMerchant = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(noMerchant.status).toBe(422);
    expect(noMerchant.body.error.code).toBe("merchant_not_approved");

    // Approve the business.
    await approveMerchant(admin.token, merchantId);

    // Now the case shows the account docs as verified-with-the-account.
    const afterMerchant = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect(afterMerchant.body.merchant_approved).toBe(true);
    expect(afterMerchant.body.account_documents.every((d: { verified_with_account: boolean }) => d.verified_with_account)).toBe(true);

    const approved = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("live");

    const merchantView = await request(app).get(`/merchant/vehicles/${vehicleId}`).set(bearer(merchantToken));
    expect(merchantView.body.status).toBe("live");
    expect(merchantView.body.documents.logbook.review_state).toBe("ok");

    const feed = await request(app).get("/merchant/notifications").set(bearer(merchantToken));
    expect(feed.body.data.some((n: { title: string }) => n.title.includes("is live"))).toBe(true);
  });
});

// --- the two "back to the merchant" outcomes -----------------------

describe("request changes and reject", () => {
  it("request_changes needs a note, sets action, and the merchant reads it verbatim; document reject notifies", async () => {
    const admin = await newAdmin();
    const { token: merchantToken, vehicleId } = await submittedVehicle();

    // Reject one document line -> merchant gets a notification, line goes rejected.
    const docReject = await request(app)
      .post(`/admin/vehicles/${vehicleId}/documents/logbook/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reject", note: "The scan is cut off at the top." });
    expect(docReject.status).toBe(200);
    const logbookLine = docReject.body.documents.find((d: { kind: string }) => d.kind === "logbook");
    expect(logbookLine).toMatchObject({ state: "rejected", review_note: "The scan is cut off at the top." });
    // Its checks are skipped - the merchant has to replace the file first.
    expect(logbookLine.checklist.items.every((i: { skipped: boolean }) => i.skipped)).toBe(true);

    // Still checklist-first for request changes.
    const early = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes", note: "x" });
    expect(early.body.error.code).toBe("checklist_incomplete");

    // Work the rest, flagging insurance cover.
    await workVehicleChecklist(admin.token, vehicleId, ["ins_comp"]);
    const worked = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect(worked.body.can_decide).toBe(true);
    expect(worked.body.can_approve).toBe(false);
    expect(worked.body.approve_blockers.flagged).toBe(1);
    expect(worked.body.checklist.suggested_note.changes).toContain("- ");
    // A flagged document is not accepted.
    expect(worked.body.documents.find((d: { kind: string }) => d.kind === "comprehensive_insurance").state).not.toBe("ok");
    // And a flagged case can't be approved.
    const flaggedApprove = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "approve" });
    expect(flaggedApprove.status).toBe(422);

    // A whole-listing "request changes" needs a note.
    const noNote = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes" });
    expect(noNote.status).toBe(422);
    expect(noNote.body.error.code).toBe("reason_required");

    const note = "Insurance certificate is third-party only. Upload comprehensive cover.";
    const sent = await request(app)
      .post(`/admin/vehicles/${vehicleId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes", note });
    expect(sent.body.status).toBe("action");

    const merchantView = await request(app).get(`/merchant/vehicles/${vehicleId}`).set(bearer(merchantToken));
    expect(merchantView.body.reviewer_note).toBe(note);
    expect(merchantView.body.reviewer_note_resolved).toBe(false);

    const feed = await request(app).get("/merchant/notifications").set(bearer(merchantToken));
    expect(feed.body.data.some((n: { title: string }) => n.title.includes("needs another look"))).toBe(true);
  });
});

// --- checklist drives the document ------------------------------

describe("a document's state follows its checklist", () => {
  it("accepts the logbook once every item passes, reopens it on a flag, and undo restarts the checks", async () => {
    const admin = await newAdmin();
    const { vehicleId } = await submittedVehicle();
    await request(app).post(`/admin/vehicles/${vehicleId}/assign`).set(bearer(admin.token));

    const detail = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    const logbook = detail.body.documents.find((d: { kind: string }) => d.kind === "logbook");
    expect(logbook.state).not.toBe("ok");
    const items = logbook.checklist.items as Array<{ id: string; document: string }>;
    expect(items.length).toBeGreaterThan(1);
    expect(items.every((i) => i.document === "logbook")).toBe(true);

    // A manual accept before the checklist is worked is refused.
    const early = await request(app)
      .post(`/admin/vehicles/${vehicleId}/documents/logbook/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "accept" });
    expect(early.body.error.code).toBe("checklist_incomplete");

    // All but the last item passed: still not accepted (no "must pass" tier).
    for (const it of items.slice(0, -1)) {
      await request(app)
        .post(`/admin/vehicles/${vehicleId}/checklist`)
        .set(bearer(admin.token))
        .send({ item_id: it.id, result: "pass" });
    }
    const partial = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect(partial.body.documents.find((d: { kind: string }) => d.kind === "logbook").state).not.toBe("ok");

    for (const it of items.slice(-1)) {
      await request(app)
        .post(`/admin/vehicles/${vehicleId}/checklist`)
        .set(bearer(admin.token))
        .send({ item_id: it.id, result: "pass" });
    }

    const after = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    const logbookAfter = after.body.documents.find((d: { kind: string }) => d.kind === "logbook");
    expect(logbookAfter.state).toBe("ok");
    expect(logbookAfter.checklist).toMatchObject({ complete: true, outstanding: 0 });
    // The insurance line, whose checks are untouched, is still pending.
    expect(after.body.documents.find((d: { kind: string }) => d.kind === "comprehensive_insurance").state).not.toBe("ok");
    expect(
      (after.body.events as Array<{ label: string }>).some((e) => e.label.includes("checklist complete")),
    ).toBe(true);

    // Flagging an item puts the accepted document back to pending.
    const flagged = await request(app)
      .post(`/admin/vehicles/${vehicleId}/checklist`)
      .set(bearer(admin.token))
      .send({ item_id: items[0]!.id, result: "flag", note: "Page two is missing." });
    expect(flagged.body.documents.find((d: { kind: string }) => d.kind === "logbook").state).toBe("pending");

    // Undo clears every answer under the document.
    const reset = await request(app)
      .post(`/admin/vehicles/${vehicleId}/documents/logbook/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reset" });
    expect(reset.status).toBe(200);
    const resetLine = reset.body.documents.find((d: { kind: string }) => d.kind === "logbook");
    expect(resetLine.state).toBe("pending");
    expect(resetLine.checklist.checked).toBe(0);
  });

  it("treats answers given before a re-upload as stale", async () => {
    const admin = await newAdmin();
    const { vehicleId } = await submittedVehicle();
    await workVehicleChecklist(admin.token, vehicleId);
    // Working an untouched case claimed it - it no longer reads "Needs review".
    const claimed = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect(claimed.body).toMatchObject({ status: "review", bucket: "with_you", assigned_to_me: true });
    // Simulate the merchant replacing the logbook after the checks.
    await db("documents")
      .where({ vehicle_id: vehicleId, kind: "logbook" })
      .update({ created_at: new Date(Date.now() + 60_000), review_state: "pending" });
    const detail = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    const logbook = detail.body.documents.find((d: { kind: string }) => d.kind === "logbook");
    expect(logbook.checklist.checked).toBe(0);
    expect(detail.body.can_decide).toBe(false);
  });
});

// --- idempotency --------------------------------------------------

describe("decision idempotency", () => {
  it("replays a repeated decision instead of applying it twice", async () => {
    const admin = await newAdmin();
    const { vehicleId } = await submittedVehicle();
    const key = { "Idempotency-Key": `dbl-${ulid()}` };
    const body = { action: "reject", note: "Logbook is in a third party's name." };
    await workVehicleChecklist(admin.token, vehicleId, ["lb_owner"]);

    const first = await request(app).post(`/admin/vehicles/${vehicleId}/decision`).set(bearer(admin.token)).set(key).send(body);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("rejected");

    const replay = await request(app).post(`/admin/vehicles/${vehicleId}/decision`).set(bearer(admin.token)).set(key).send(body);
    expect(replay.status).toBe(200);

    // Exactly one "Rejected" event on the timeline, not two.
    const detail = await request(app).get(`/admin/vehicles/${vehicleId}`).set(bearer(admin.token));
    expect((detail.body.events as Array<{ label: string }>).filter((e) => e.label === "Rejected")).toHaveLength(1);

    // And it's out of the open buckets, in Rejected.
    const rejectedBucket = await request(app).get("/admin/vehicles?bucket=rejected").set(bearer(admin.token));
    expect(rejectedBucket.body.data.some((v: { id: string }) => v.id === vehicleId)).toBe(true);
  });
});
