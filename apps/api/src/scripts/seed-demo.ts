import "../lib/load-env.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { nextListingRef } from "../lib/vehicle-events.js";
import { nextBookingRef } from "../lib/booking-ref.js";
import { getOrCreateMerchant } from "../modules/merchant/service.js";
import { computeBookingPricing } from "../lib/booking-pricing.js";
import { cutPayoutRun, nextMonday } from "../modules/payouts/service.js";
import { notify } from "../lib/notifications.js";
import { writeAuditEntry } from "../lib/audit.js";
import { createStorageAdapter } from "../adapters/storage/index.js";

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/**
 * `npm run seed:demo -w apps/api` — a full, interconnected demo dataset for
 * local dev: admins, merchants (individual + company, various approval
 * states), a real vehicle fleet with real per-model photos, renters with
 * their own documents, bookings across every status, payout runs, ratings,
 * notifications on both sides, admin bulk-communications history, and the
 * audit trail a real review session would have left.
 *
 * Every account uses the `@cral-demo.test` domain and is wiped and
 * recreated on each run (see `wipeDemoData` below) — safe to re-run, and
 * deliberately never mounted behind an HTTP route (this is a standalone
 * script, same footing as the bookings/payouts/notifications dev-seeders
 * it reuses). Refuses to run against production for the same reason those
 * do.
 *
 * Vehicle photos are real, not fabricated: `seed-assets/vehicles/*.jpg`
 * are freely-licensed (CC0/CC BY/CC BY-SA) photos of the actual make and
 * model pulled from Wikimedia Commons — see `_manifest.json` in that
 * folder for the source URL and licence of each. Any visible number plate
 * was blurred before being committed. One photo file is reused across
 * every vehicle of that model (the same way a real listing's own photos
 * would be specific to one car - this is the closest a shared demo fixture
 * gets to that without commissioning real photography).
 */

const DOMAIN = "@cral-demo.test";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "seed-assets", "vehicles");

/**
 * Every seeded account shares this one password, deliberately - the point
 * of this dataset is to actually sign in and browse it in the real
 * customer/merchant/admin apps, not just to look at rows in a DB client.
 * Overridable via env so it's never accidentally the same fixed string in
 * an environment that isn't purely local dev.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "CralDemo2026!";
let cachedPasswordHash: string | null = null;
async function demoPasswordHash(): Promise<string> {
  cachedPasswordHash ??= await hashPassword(DEMO_PASSWORD);
  return cachedPasswordHash;
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY_MS);
}

/** Same phone-shape trick the existing dev-seeders use, unique per call. */
function fakePhone(): string {
  return `+2547${Math.floor(10000000 + Math.random() * 89999999)}`;
}

// ---------------------------------------------------------------------
// Vehicle photo cache: one real photo per model, read from disk once and
// reused across every vehicle of that model.
// ---------------------------------------------------------------------

const photoBufferCache = new Map<string, Buffer>();
function loadPhoto(slug: string): Buffer {
  let buf = photoBufferCache.get(slug);
  if (!buf) {
    buf = readFileSync(join(ASSETS_DIR, `${slug}.jpg`));
    photoBufferCache.set(slug, buf);
  }
  return buf;
}

/**
 * Writes the cached photo bytes to storage under this vehicle's own key and
 * inserts its `documents` row. The bytes are shared across vehicles of the
 * same model (real photos of that model, not a unique shoot per listing),
 * but each vehicle gets its own document row and storage key, same as a
 * real upload would.
 */
async function addVehiclePhoto(merchantId: string, vehicleId: string, photoSlug: string): Promise<void> {
  const body = loadPhoto(photoSlug);
  const key = `merchant/${merchantId}/${vehicleId}/vehicle_photo/${generateId("document")}-${photoSlug}.jpg`;
  await getStorageAdapter().putObject({ key, body, contentType: "image/jpeg" });
  await db("documents").insert({
    id: generateId("document"),
    merchant_id: merchantId,
    vehicle_id: vehicleId,
    kind: "vehicle_photo",
    storage_key: key,
    original_name: `${photoSlug}.jpg`,
    size_bytes: body.length,
    content_type: "image/jpeg",
    review_state: "ok",
  });
}

/** A plain-text placeholder for a non-photo document — no real PDFs to seed. */
async function addDocument(input: {
  merchantId?: string | null;
  userId?: string | null;
  vehicleId?: string | null;
  kind: string;
  reviewState?: "ok" | "pending" | "expiring" | "rejected";
  expiresAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
}): Promise<void> {
  const body = Buffer.from(`Seed fixture document - ${input.kind}`, "utf-8");
  const owner = input.merchantId ? `merchant/${input.merchantId}` : `user/${input.userId}`;
  const key = `${owner}/${input.vehicleId ?? "account"}/${input.kind}/${generateId("document")}.pdf`;
  await getStorageAdapter().putObject({ key, body, contentType: "application/pdf" });
  await db("documents").insert({
    id: generateId("document"),
    merchant_id: input.merchantId ?? null,
    user_id: input.userId ?? null,
    vehicle_id: input.vehicleId ?? null,
    kind: input.kind,
    storage_key: key,
    original_name: `${input.kind}.pdf`,
    size_bytes: body.length,
    content_type: "application/pdf",
    review_state: input.reviewState ?? "ok",
    expires_at: input.expiresAt ?? null,
    reviewed_by: input.reviewedBy ?? null,
    review_note: input.reviewNote ?? null,
    reviewed_at: input.reviewState && input.reviewState !== "pending" ? new Date() : null,
  });
}

// ---------------------------------------------------------------------
// Wipe — leaf tables first, respecting every RESTRICT/CASCADE boundary.
// audit_log is append-only (DB-level REVOKE) and is never touched: a
// re-run just adds a fresh set of entries alongside the last run's, which
// is a defensible thing for a real audit trail to do.
// ---------------------------------------------------------------------

async function wipeDemoData(): Promise<void> {
  const users = await db("users").where("email", "like", `%${DOMAIN}`).select("id");
  const userIds = users.map((u) => u.id as string);
  const admins = await db("admin_users").where("email", "like", `%${DOMAIN}`).select("id");
  const adminIds = admins.map((a) => a.id as string);

  const merchants = userIds.length
    ? await db("merchants").whereIn("user_id", userIds).select("id")
    : [];
  const merchantIds = merchants.map((m) => m.id as string);

  const vehicles = merchantIds.length
    ? await db("vehicles").whereIn("merchant_id", merchantIds).select("id")
    : [];
  const vehicleIds = vehicles.map((v) => v.id as string);

  const bookings = merchantIds.length
    ? await db("bookings").whereIn("merchant_id", merchantIds).select("id")
    : [];
  const bookingIds = bookings.map((b) => b.id as string);

  const runs = merchantIds.length
    ? await db("payout_runs").whereIn("merchant_id", merchantIds).select("id")
    : [];
  const runIds = runs.map((r) => r.id as string);

  if (adminIds.length) await db("comms_runs").whereIn("sent_by", adminIds).delete();
  if (adminIds.length) await db("comms_templates").whereIn("created_by", adminIds).delete();

  if (runIds.length) {
    await db("payout_queries").whereIn("payout_run_id", runIds).delete();
    await db("payout_run_lines").whereIn("payout_run_id", runIds).delete();
    await db("payout_runs").whereIn("id", runIds).delete();
  }

  if (bookingIds.length) {
    await db("ratings").whereIn("booking_id", bookingIds).delete();
    await db("documents").whereIn("booking_id", bookingIds).delete();
    await db("booking_reports").whereIn("booking_id", bookingIds).delete();
    await db("booking_events").whereIn("booking_id", bookingIds).delete();
    await db("handovers").whereIn("booking_id", bookingIds).delete();
  }
  if (merchantIds.length) {
    const subjects = [...bookingIds, ...runIds, ...vehicleIds];
    await db("notifications").whereIn("merchant_id", merchantIds).delete();
    if (subjects.length) await db("notifications").whereIn("subject_id", subjects).delete();
  }
  if (userIds.length) await db("notifications").whereIn("user_id", userIds).delete();

  if (bookingIds.length) await db("bookings").whereIn("id", bookingIds).delete();

  if (vehicleIds.length) {
    await db("vehicle_review_checks").whereIn("vehicle_id", vehicleIds).delete();
    await db("vehicle_events").whereIn("vehicle_id", vehicleIds).delete();
  }
  if (merchantIds.length) await db("merchant_review_checks").whereIn("merchant_id", merchantIds).delete();

  // Every remaining `documents` row scoped to these merchants/vehicles/users
  // (owner docs, vehicle docs/photos not already caught above).
  if (merchantIds.length) await db("documents").whereIn("merchant_id", merchantIds).delete();
  if (userIds.length) await db("documents").whereIn("user_id", userIds).delete();

  if (vehicleIds.length) await db("vehicles").whereIn("id", vehicleIds).delete();
  if (merchantIds.length) await db("merchants").whereIn("id", merchantIds).delete();

  // admin_sessions / admin_login_challenges cascade from admin_users.
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  if (userIds.length) await db("users").whereIn("id", userIds).delete();

  // eslint-disable-next-line no-console
  console.log(
    `Wiped: ${userIds.length} users, ${adminIds.length} admins, ${merchantIds.length} merchants, ${vehicleIds.length} vehicles, ${bookingIds.length} bookings, ${runIds.length} payout runs.`,
  );
}

// ---------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------

interface SeededAdmin {
  id: string;
  role: string;
}

async function seedAdmins(): Promise<Record<string, SeededAdmin>> {
  const rows: Array<{
    key: string;
    email: string;
    fullName: string;
    role: string;
    queues: string[];
  }> = [
    { key: "super", email: `admin.wanjiru${DOMAIN}`, fullName: "Wanjiru Kamau", role: "admin_super", queues: [] },
    {
      key: "reviewer",
      email: `admin.otieno${DOMAIN}`,
      fullName: "Otieno Ochieng",
      role: "admin_reviewer",
      queues: ["vehicles", "merchants"],
    },
    {
      key: "finance",
      email: `admin.njoroge${DOMAIN}`,
      fullName: "Njoroge Kariuki",
      role: "admin_finance",
      queues: ["payouts"],
    },
  ];

  const out: Record<string, SeededAdmin> = {};
  for (const row of rows) {
    const id = generateId("adminUser");
    await db("admin_users").insert({
      id,
      email: row.email,
      password_hash: await demoPasswordHash(),
      phone: fakePhone(),
      full_name: row.fullName,
      role: row.role,
      assigned_queues: row.queues,
      status: "active",
      last_login_at: daysAgo(1),
    });
    out[row.key] = { id, role: row.role };
  }
  return out;
}

// ---------------------------------------------------------------------
// Merchants + vehicles
// ---------------------------------------------------------------------

interface SeededMerchant {
  key: string;
  userId: string;
  merchantId: string;
  ownerName: string;
  phone: string;
  approved: boolean;
}

interface VehicleSpec {
  key: string;
  type: string;
  make: string;
  model: string;
  year: string;
  seats: number;
  transmission: string;
  fuel: string;
  colour: string;
  county: string;
  pickupAddress: string;
  dailyRateKes: number;
  minimumHireDays: number;
  chauffeured: boolean;
  status: "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";
  photoSlug: string;
  reviewerNote?: string;
  reviewerNoteMeta?: string;
  docStates?: { logbook?: string; comprehensive_insurance?: string; tracker_certificate?: string };
}

interface SeededVehicle {
  key: string;
  id: string;
  merchantId: string;
  registration: string;
  dailyRateAmount: number;
  status: string;
  pickupAddress: string;
}

async function createMerchantUser(input: {
  email: string;
  fullName: string;
  phone: string;
}): Promise<string> {
  const id = generateId("user");
  await db("users").insert({
    id,
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    password_hash: await demoPasswordHash(),
    roles: ["merchant"],
    email_verified: true,
    phone_verified: true,
  });
  return id;
}

async function seedMerchant(
  key: string,
  opts: {
    email: string;
    ownerType: "individual" | "company";
    ownerName: string;
    companyName?: string;
    county: string;
    approved: boolean;
    adminReviewerId: string;
  },
): Promise<SeededMerchant> {
  const phone = fakePhone();
  const [firstName, ...rest] = opts.ownerName.split(" ");
  const surname = rest.join(" ") || firstName;
  const userId = await createMerchantUser({ email: opts.email, fullName: opts.ownerName, phone });
  const merchant = await getOrCreateMerchant(userId);

  await db("merchants")
    .where({ id: merchant.id })
    .update({
      owner_type: opts.ownerType,
      company_name: opts.ownerType === "company" ? opts.companyName : null,
      company_cert_no: opts.ownerType === "company" ? "CPR/2019/004821" : null,
      company_kra: opts.ownerType === "company" ? "P051234567X" : null,
      first_name: firstName,
      surname,
      national_id: `3${Math.floor(1000000 + Math.random() * 8999999)}`,
      kra_pin: `A0${Math.floor(10000000 + Math.random() * 89999999)}Z`,
      payout_same: true,
      payout_method: "mpesa",
      payout_detail: phone,
      onboarding_submitted: true,
      onboarding_step: 5,
      approved_at: opts.approved ? daysAgo(30) : null,
      merchant_terms_accepted_version: "2026-06-01",
      merchant_terms_accepted_at: daysAgo(60),
    });

  // Owner documents — every merchant carries these; a company also carries
  // its three business documents.
  await addDocument({ merchantId: merchant.id, kind: "national_id", reviewState: opts.approved ? "ok" : "pending" });
  await addDocument({ merchantId: merchant.id, kind: "kra_pin", reviewState: opts.approved ? "ok" : "pending" });
  if (opts.ownerType === "company") {
    await addDocument({
      merchantId: merchant.id,
      kind: "certificate_of_incorporation",
      reviewState: opts.approved ? "ok" : "pending",
    });
    await addDocument({ merchantId: merchant.id, kind: "company_kra_pin", reviewState: opts.approved ? "ok" : "pending" });
    await addDocument({ merchantId: merchant.id, kind: "cr12", reviewState: opts.approved ? "ok" : "pending" });
  }

  if (opts.approved) {
    await db.transaction((trx) =>
      writeAuditEntry(trx, {
        actorId: opts.adminReviewerId,
        actorType: "admin",
        action: "merchant.approved",
        entityType: "merchant",
        entityId: merchant.id,
        after: { approved_at: new Date().toISOString() },
      }),
    );
  }

  return { key, userId, merchantId: merchant.id, ownerName: opts.ownerName, phone, approved: opts.approved };
}

async function seedVehicle(
  merchant: SeededMerchant,
  spec: VehicleSpec,
  adminReviewerId: string,
): Promise<SeededVehicle> {
  const registration = `K${["D", "C", "B", "A"][Math.floor(Math.random() * 4)]}${["A", "B", "C", "D", "E", "F", "G", "H"][
    Math.floor(Math.random() * 8)
  ]} ${Math.floor(100 + Math.random() * 899)}${["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"][Math.floor(Math.random() * 10)]}`;

  const [vehicle] = await db("vehicles")
    .insert({
      id: generateId("vehicle"),
      merchant_id: merchant.merchantId,
      type: spec.type,
      make: spec.make,
      model: spec.model,
      year: spec.year,
      registration,
      transmission: spec.transmission,
      fuel: spec.fuel,
      colour: spec.colour,
      seats: spec.seats,
      county: spec.county,
      pickup_address: spec.pickupAddress,
      daily_rate_amount: spec.dailyRateKes * 100,
      minimum_hire_days: spec.minimumHireDays,
      chauffeured: spec.chauffeured,
      status: spec.status,
      listing_ref: spec.status === "draft" ? null : await nextListingRef(db),
      submitted_at: spec.status === "draft" ? null : daysAgo(20),
      verification_badge: "none",
      reviewer_note: spec.reviewerNote ?? null,
      reviewer_note_meta: spec.reviewerNoteMeta ?? null,
      reviewer_note_resolved: false,
    })
    .returning("*");

  const v = vehicle as { id: string };

  // Vehicle events — a short, plausible review-history timeline.
  await db("vehicle_events").insert({
    id: generateId("vehicleEvent"),
    vehicle_id: v.id,
    merchant_id: merchant.merchantId,
    kind: "draft_started",
    tone: "grey",
    label: "Draft started",
    actor_type: "merchant",
    occurred_at: daysAgo(22),
  });
  if (spec.status !== "draft") {
    await db("vehicle_events").insert({
      id: generateId("vehicleEvent"),
      vehicle_id: v.id,
      merchant_id: merchant.merchantId,
      kind: "submitted",
      tone: "grey",
      label: "Submitted for review",
      body: "Three documents and photos received.",
      actor_type: "merchant",
      occurred_at: daysAgo(20),
    });
  }
  if (spec.status === "live") {
    await db("vehicle_events").insert({
      id: generateId("vehicleEvent"),
      vehicle_id: v.id,
      merchant_id: merchant.merchantId,
      kind: "approved",
      tone: "green",
      label: "Approved and live",
      actor_type: "reviewer",
      actor_name: "Otieno Ochieng",
      occurred_at: daysAgo(18),
    });
    await db.transaction((trx) =>
      writeAuditEntry(trx, {
        actorId: adminReviewerId,
        actorType: "admin",
        action: "vehicle.approved",
        entityType: "vehicle",
        entityId: v.id,
        after: { status: "live", registration },
      }),
    );
  }
  if (spec.status === "rejected") {
    await db("vehicle_events").insert({
      id: generateId("vehicleEvent"),
      vehicle_id: v.id,
      merchant_id: merchant.merchantId,
      kind: "rejected",
      tone: "red",
      label: "Rejected",
      body: spec.reviewerNote ?? null,
      actor_type: "reviewer",
      actor_name: "Otieno Ochieng",
      occurred_at: daysAgo(17),
    });
    await db.transaction((trx) =>
      writeAuditEntry(trx, {
        actorId: adminReviewerId,
        actorType: "admin",
        action: "vehicle.rejected",
        entityType: "vehicle",
        entityId: v.id,
        after: { status: "rejected", reason: spec.reviewerNote },
      }),
    );
  }
  if (spec.status === "action") {
    await db("vehicle_events").insert({
      id: generateId("vehicleEvent"),
      vehicle_id: v.id,
      merchant_id: merchant.merchantId,
      kind: "note",
      tone: "red",
      label: "More information needed",
      body: spec.reviewerNote ?? null,
      actor_type: "reviewer",
      actor_name: "Otieno Ochieng",
      occurred_at: daysAgo(16),
    });
    await db.transaction((trx) =>
      writeAuditEntry(trx, {
        actorId: adminReviewerId,
        actorType: "admin",
        action: "vehicle.changes_requested",
        entityType: "vehicle",
        entityId: v.id,
        after: { status: "action", note: spec.reviewerNote },
      }),
    );
  }
  if (spec.status === "review" || spec.status === "pending") {
    await db("vehicle_events").insert({
      id: generateId("vehicleEvent"),
      vehicle_id: v.id,
      merchant_id: merchant.merchantId,
      kind: "reviewer_opened",
      tone: "blue",
      label: spec.status === "review" ? "Reviewer opened your file" : "Waiting in the review queue",
      actor_type: spec.status === "review" ? "reviewer" : "system",
      actor_name: spec.status === "review" ? "Otieno Ochieng" : null,
      occurred_at: daysAgo(15),
    });
  }

  if (spec.status === "review") {
    await db("vehicles").where({ id: v.id }).update({ review_assignee: adminReviewerId });
  }

  // Documents.
  if (spec.status !== "draft") {
    const docStates = spec.docStates ?? {};
    await addDocument({
      merchantId: merchant.merchantId,
      vehicleId: v.id,
      kind: "logbook",
      reviewState: (docStates.logbook as "ok" | "pending" | "expiring" | "rejected" | undefined) ?? "ok",
      reviewedBy: adminReviewerId,
      reviewNote: docStates.logbook === "rejected" ? spec.reviewerNote ?? null : null,
    });
    await addDocument({
      merchantId: merchant.merchantId,
      vehicleId: v.id,
      kind: "comprehensive_insurance",
      reviewState:
        (docStates.comprehensive_insurance as "ok" | "pending" | "expiring" | "rejected" | undefined) ?? "ok",
      expiresAt: new Date(Date.now() + 200 * DAY_MS).toISOString().slice(0, 10),
    });
    await addDocument({
      merchantId: merchant.merchantId,
      vehicleId: v.id,
      kind: "tracker_certificate",
      reviewState: (docStates.tracker_certificate as "ok" | "pending" | "expiring" | "rejected" | undefined) ?? "ok",
    });
  } else {
    await addDocument({ merchantId: merchant.merchantId, vehicleId: v.id, kind: "logbook", reviewState: "ok" });
  }

  // Real photos — 2 per vehicle where the model has more than one shot
  // available; every seeded model has exactly one real photo on file, so
  // this is one document row per vehicle pointing at that shared file.
  await addVehiclePhoto(merchant.merchantId, v.id, spec.photoSlug);

  return {
    key: spec.key,
    id: v.id,
    merchantId: merchant.merchantId,
    registration,
    dailyRateAmount: spec.dailyRateKes * 100,
    status: spec.status,
    pickupAddress: spec.pickupAddress,
  };
}

// ---------------------------------------------------------------------
// Renters
// ---------------------------------------------------------------------

interface SeededRenter {
  key: string;
  userId: string;
  fullName: string;
}

async function seedRenter(input: {
  key: string;
  email: string;
  fullName: string;
  county: string;
  docsAccepted: boolean;
}): Promise<SeededRenter> {
  const id = generateId("user");
  await db("users").insert({
    id,
    full_name: input.fullName,
    phone: fakePhone(),
    email: input.email,
    password_hash: await demoPasswordHash(),
    roles: ["customer"],
    email_verified: true,
    phone_verified: true,
  });

  await addDocument({
    userId: id,
    kind: "national_id",
    reviewState: input.docsAccepted ? "ok" : "pending",
  });
  await addDocument({
    userId: id,
    kind: "driving_licence",
    reviewState: input.docsAccepted ? "ok" : "rejected",
    reviewNote: input.docsAccepted ? null : "The licence photo is too blurry to read the expiry date. Re-upload a clearer scan.",
  });

  return { key: input.key, userId: id, fullName: input.fullName };
}

// ---------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------

interface BookingSpec {
  key: string;
  vehicleKey: string;
  renterKey: string;
  status: "requested" | "confirmed" | "active" | "completed" | "declined" | "expired" | "cancelled";
  pickupDaysOffset: number; // negative = past
  durationDays: number;
  returnedDaysAgo?: number; // for completed
  depositReleased?: boolean;
  note?: string | null;
}

async function seedBooking(
  spec: BookingSpec,
  vehicle: SeededVehicle,
  merchant: SeededMerchant,
  renter: SeededRenter,
): Promise<{ id: string; ref: string } | null> {
  const pickupAt = daysFromNow(spec.pickupDaysOffset);
  const dropoffAt = new Date(pickupAt.getTime() + spec.durationDays * DAY_MS);
  const pricing = computeBookingPricing(vehicle.dailyRateAmount, spec.durationDays);
  const ref = await nextBookingRef();

  const row: Record<string, unknown> = {
    id: generateId("booking"),
    ref,
    merchant_id: merchant.merchantId,
    vehicle_id: vehicle.id,
    hirer_id: renter.userId,
    status: spec.status,
    pickup_at: pickupAt,
    dropoff_at: dropoffAt,
    pickup_location: vehicle.pickupAddress,
    dropoff_location: vehicle.pickupAddress,
    note_from_hirer: spec.note ?? null,
    gross_amount: pricing.gross.amount,
    commission_amount: pricing.commission.amount,
    merchant_net_amount: pricing.merchantNet.amount,
    deposit_amount: pricing.deposit.amount,
    payout_method: "mpesa",
    payout_detail: merchant.phone,
    payout_account_name: merchant.ownerName,
  };

  if (spec.status === "requested") {
    row.response_due_at = new Date(Date.now() + 8 * 60 * 60 * 1000);
  }
  if (spec.status === "completed") {
    const returnedAt = daysAgo(spec.returnedDaysAgo ?? 3);
    row.has_pickup_condition_photos = true;
    row.returned_at = returnedAt;
    row.deposit_release_at = new Date(returnedAt.getTime() + DAY_MS);
    row.deposit_released = spec.depositReleased ?? false;
    row.rating_open_until = new Date(returnedAt.getTime() + 14 * DAY_MS);
  }
  if (spec.status === "declined") {
    row.decline_reason_code = "vehicle_unavailable";
    row.decline_note = "Already promised to another hirer for those dates.";
  }
  if (spec.status === "expired") {
    row.response_due_at = daysAgo(1);
  }
  if (spec.status === "cancelled") {
    const gross = pricing.gross.amount;
    const fee = Math.round(gross * 0.25);
    const commission = Math.round(fee * 0.15);
    row.cancellation_fee_amount = fee;
    row.cancellation_fee_currency = "KES";
    row.commission_amount = commission;
    row.merchant_net_amount = fee - commission;
    row.refund_amount = gross - fee;
    row.refund_currency = "KES";
    row.cancel_reason = "Change of plans";
  }

  const [booking] = await db("bookings").insert(row).returning("*");
  if (!booking) return null;
  const b = booking as { id: string };

  await db("booking_events").insert({
    id: generateId("bookingEvent"),
    booking_id: b.id,
    merchant_id: merchant.merchantId,
    kind: "requested",
    tone: "amber",
    label: "Request received",
    body: `Hirer has paid KES ${(pricing.gross.amount / 100).toLocaleString("en-KE")} to CRAL. Held until you answer.`,
    actor_type: "hirer",
    occurred_at: daysAgo(spec.pickupDaysOffset < 0 ? -spec.pickupDaysOffset + 1 : 1),
  });

  if (["confirmed", "active", "completed"].includes(spec.status)) {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "confirmed",
      tone: "blue",
      label: "You accepted the booking",
      body: "Pick-up details sent.",
      actor_type: "merchant",
    });
  }
  if (["active", "completed"].includes(spec.status)) {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "vehicle_handed_over",
      tone: "green",
      label: "Vehicle handed over",
      body: "Checked over together at pick-up - condition photos attached.",
      actor_type: "merchant",
    });
  }
  if (spec.status === "completed") {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "vehicle_returned",
      tone: "green",
      label: "Vehicle returned",
      body: "Checked over on return - no claim raised.",
      actor_type: "merchant",
    });
  }
  if (spec.status === "declined") {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "declined",
      tone: "red",
      label: "You declined the request",
      body: (row.decline_note as string) ?? null,
      actor_type: "merchant",
    });
  }
  if (spec.status === "expired") {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "expired",
      tone: "grey",
      label: "Request expired - no answer in time",
      actor_type: "system",
    });
  }
  if (spec.status === "cancelled") {
    await db("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: b.id,
      merchant_id: merchant.merchantId,
      kind: "cancelled",
      tone: "red",
      label: "Cancelled late by the hirer",
      body: "Cancelled after pick-up time, so the 25% late fee applies.",
      actor_type: "hirer",
    });
  }

  return { id: b.id, ref };
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");

  await wipeDemoData();

  // eslint-disable-next-line no-console
  console.log("Seeding admins...");
  const admins = await seedAdmins();
  const reviewerId = admins.reviewer!.id;

  // eslint-disable-next-line no-console
  console.log("Seeding merchants...");
  const merchantA = await seedMerchant("A", {
    email: `merchant.mwangi${DOMAIN}`,
    ownerType: "individual",
    ownerName: "James Mwangi",
    county: "Nairobi",
    approved: true,
    adminReviewerId: reviewerId,
  });
  const merchantB = await seedMerchant("B", {
    email: `merchant.riftvalley${DOMAIN}`,
    ownerType: "company",
    ownerName: "Grace Wambui",
    companyName: "Rift Valley Rentals Ltd",
    county: "Nakuru",
    approved: true,
    adminReviewerId: reviewerId,
  });
  const merchantC = await seedMerchant("C", {
    email: `merchant.achieng${DOMAIN}`,
    ownerType: "individual",
    ownerName: "Grace Achieng",
    county: "Kisumu",
    approved: false,
    adminReviewerId: reviewerId,
  });
  const merchantD = await seedMerchant("D", {
    email: `merchant.hassan${DOMAIN}`,
    ownerType: "individual",
    ownerName: "Omar Hassan",
    county: "Mombasa",
    approved: true,
    adminReviewerId: reviewerId,
  });

  // eslint-disable-next-line no-console
  console.log("Seeding vehicles + real photos...");
  const vehicleSpecs: Array<[SeededMerchant, VehicleSpec]> = [
    [
      merchantA,
      {
        key: "A1", type: "suv", make: "Toyota", model: "Land Cruiser Prado", year: "2019", seats: 7,
        transmission: "Automatic", fuel: "Diesel", colour: "Pearl white", county: "Nairobi",
        pickupAddress: "Nairobi - Westlands", dailyRateKes: 12500, minimumHireDays: 2, chauffeured: true,
        status: "live", photoSlug: "prado",
      },
    ],
    [
      merchantA,
      {
        key: "A2", type: "sedan", make: "Toyota", model: "Probox", year: "2017", seats: 5,
        transmission: "Manual", fuel: "Petrol", colour: "White", county: "Nairobi",
        pickupAddress: "Nairobi - Embakasi", dailyRateKes: 3200, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "probox",
      },
    ],
    [
      merchantA,
      {
        key: "A3", type: "van", make: "Toyota", model: "Hiace", year: "2018", seats: 14,
        transmission: "Manual", fuel: "Diesel", colour: "Silver", county: "Nairobi",
        pickupAddress: "Nairobi - Kilimani", dailyRateKes: 9000, minimumHireDays: 1, chauffeured: true,
        status: "live", photoSlug: "hiace",
      },
    ],
    [
      merchantA,
      {
        key: "A4", type: "sedan", make: "Subaru", model: "Impreza", year: "2016", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Blue", county: "Nairobi",
        pickupAddress: "Nairobi - Lavington", dailyRateKes: 5500, minimumHireDays: 1, chauffeured: false,
        status: "review", photoSlug: "impreza",
        docStates: { logbook: "ok", comprehensive_insurance: "pending", tracker_certificate: "pending" },
      },
    ],
    [
      merchantA,
      {
        key: "A5", type: "suv", make: "Mitsubishi", model: "Pajero Sport", year: "2015", seats: 7,
        transmission: "Automatic", fuel: "Diesel", colour: "Black", county: "Nairobi",
        pickupAddress: "Nairobi - Karen", dailyRateKes: 8500, minimumHireDays: 2, chauffeured: true,
        status: "action", photoSlug: "pajero-sport",
        reviewerNote:
          "The comprehensive insurance certificate uploaded has expired. Upload a current certificate and we will finish the review the same day.",
        reviewerNoteMeta: "Otieno Ochieng - Compliance - " + new Date().toDateString(),
        docStates: { logbook: "ok", comprehensive_insurance: "rejected", tracker_certificate: "ok" },
      },
    ],
    [
      merchantB,
      {
        key: "B1", type: "sedan", make: "Toyota", model: "Corolla Axio", year: "2018", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "White", county: "Nakuru",
        pickupAddress: "Nakuru - Milimani", dailyRateKes: 4200, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "axio",
      },
    ],
    [
      merchantB,
      {
        key: "B2", type: "truck", make: "Isuzu", model: "Forward", year: "2015", seats: 3,
        transmission: "Manual", fuel: "Diesel", colour: "White", county: "Nakuru",
        pickupAddress: "Nakuru - Industrial Area", dailyRateKes: 16000, minimumHireDays: 2, chauffeured: true,
        status: "live", photoSlug: "isuzu-forward",
      },
    ],
    [
      merchantB,
      {
        key: "B3", type: "suv", make: "Toyota", model: "RAV4", year: "2020", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "White", county: "Nakuru",
        pickupAddress: "Nakuru - Section 58", dailyRateKes: 9800, minimumHireDays: 1, chauffeured: false,
        status: "pending", photoSlug: "rav4",
        docStates: { logbook: "pending", comprehensive_insurance: "pending", tracker_certificate: "pending" },
      },
    ],
    [
      merchantC,
      {
        key: "C1", type: "sedan", make: "Mazda", model: "Demio", year: "2017", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Silver", county: "Kisumu",
        pickupAddress: "Kisumu - Milimani", dailyRateKes: 3100, minimumHireDays: 1, chauffeured: false,
        status: "rejected", photoSlug: "demio",
        reviewerNote:
          "The name on the logbook does not match your account or your national ID. Upload a logbook in your name, or a signed management agreement plus the owner's ID.",
        reviewerNoteMeta: "Otieno Ochieng - Compliance - " + new Date().toDateString(),
        docStates: { logbook: "rejected", comprehensive_insurance: "ok", tracker_certificate: "ok" },
      },
    ],
    [
      merchantC,
      {
        key: "C2", type: "sedan", make: "Toyota", model: "Vitz", year: "2016", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Grey", county: "Kisumu",
        pickupAddress: "Kisumu - Nyalenda", dailyRateKes: 3400, minimumHireDays: 1, chauffeured: false,
        status: "review", photoSlug: "vitz",
        docStates: { logbook: "ok", comprehensive_insurance: "ok", tracker_certificate: "pending" },
      },
    ],
    [
      merchantC,
      {
        key: "C3", type: "sedan", make: "Nissan", model: "Note", year: "2019", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Orange", county: "Kisumu",
        pickupAddress: "Kisumu - Milimani", dailyRateKes: 4000, minimumHireDays: 1, chauffeured: false,
        status: "draft", photoSlug: "note",
      },
    ],
    [
      merchantD,
      {
        key: "D1", type: "suv", make: "Toyota", model: "Land Cruiser 70", year: "2014", seats: 7,
        transmission: "Manual", fuel: "Diesel", colour: "White", county: "Mombasa",
        pickupAddress: "Mombasa - Nyali", dailyRateKes: 14000, minimumHireDays: 2, chauffeured: true,
        status: "live", photoSlug: "land-cruiser-70",
      },
    ],
    [
      merchantD,
      {
        key: "D2", type: "van", make: "Toyota", model: "Noah", year: "2017", seats: 8,
        transmission: "Automatic", fuel: "Petrol", colour: "White", county: "Mombasa",
        pickupAddress: "Mombasa - Bamburi", dailyRateKes: 7500, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "noah",
      },
    ],

    // Budget hatchbacks - the cars most people in this market actually
    // hire. Three of these models were already seeded under merchant C,
    // but C is deliberately unapproved and its cars sit in draft/review/
    // rejected to exercise those states, so none of them reach the
    // catalog. These are separate cars, on approved merchants, priced
    // under the "Budget friendly" rail's KES 4,000 line.
    [
      merchantA,
      {
        key: "A6", type: "sedan", make: "Mazda", model: "Demio", year: "2018", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Red", county: "Nairobi",
        pickupAddress: "Nairobi - Kasarani", dailyRateKes: 3000, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "demio",
      },
    ],
    [
      merchantA,
      {
        key: "A7", type: "sedan", make: "Toyota", model: "Vitz", year: "2017", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Silver", county: "Nairobi",
        pickupAddress: "Nairobi - Ngara", dailyRateKes: 2900, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "vitz",
      },
    ],
    [
      merchantA,
      {
        key: "A8", type: "sedan", make: "Honda", model: "Fit", year: "2018", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "White", county: "Nairobi",
        pickupAddress: "Nairobi - South B", dailyRateKes: 3300, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "fit",
      },
    ],
    [
      merchantB,
      {
        key: "B4", type: "sedan", make: "Nissan", model: "Note", year: "2019", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Blue", county: "Nakuru",
        pickupAddress: "Nakuru - Lanet", dailyRateKes: 3600, minimumHireDays: 1, chauffeured: false,
        status: "live", photoSlug: "note",
      },
    ],

    // Executive. The "Executive" rail is priced at KES 10,000/day and up,
    // and until now the only cars over that line were a Prado, a Land
    // Cruiser 70 and a lorry - so a rail captioned "weddings, client
    // pitches, delegations" was showing a tipper truck. These are real
    // chauffeur-driven saloons and a V8, which is what that copy means.
    [
      merchantA,
      {
        key: "A9", type: "sedan", make: "Mercedes-Benz", model: "E-Class", year: "2018", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Black", county: "Nairobi",
        pickupAddress: "Nairobi - Westlands", dailyRateKes: 18000, minimumHireDays: 1, chauffeured: true,
        status: "live", photoSlug: "e-class",
      },
    ],
    [
      merchantA,
      {
        key: "A10", type: "sedan", make: "BMW", model: "5 Series", year: "2017", seats: 5,
        transmission: "Automatic", fuel: "Petrol", colour: "Navy", county: "Nairobi",
        pickupAddress: "Nairobi - Upper Hill", dailyRateKes: 15500, minimumHireDays: 1, chauffeured: true,
        status: "live", photoSlug: "bmw-5-series",
      },
    ],
    [
      merchantD,
      {
        key: "D3", type: "suv", make: "Toyota", model: "Land Cruiser V8", year: "2018", seats: 7,
        transmission: "Automatic", fuel: "Diesel", colour: "Pearl white", county: "Mombasa",
        pickupAddress: "Mombasa - Nyali", dailyRateKes: 22000, minimumHireDays: 2, chauffeured: true,
        status: "live", photoSlug: "land-cruiser-200",
      },
    ],
  ];

  const vehicles: Record<string, SeededVehicle> = {};
  for (const [merchant, spec] of vehicleSpecs) {
    vehicles[spec.key] = await seedVehicle(merchant, spec, reviewerId);
  }

  // eslint-disable-next-line no-console
  console.log("Seeding renters...");
  const renters: Record<string, SeededRenter> = {};
  const renterSpecs = [
    { key: "faith", email: `renter.faith${DOMAIN}`, fullName: "Faith Njeri", county: "Nairobi", docsAccepted: true },
    { key: "samuel", email: `renter.samuel${DOMAIN}`, fullName: "Samuel Mutiso", county: "Nairobi", docsAccepted: true },
    { key: "mercy", email: `renter.mercy${DOMAIN}`, fullName: "Mercy Atieno", county: "Kisumu", docsAccepted: true },
    { key: "peter", email: `renter.peter${DOMAIN}`, fullName: "Peter Ochieng", county: "Mombasa", docsAccepted: true },
    { key: "safiri", email: `renter.safiri${DOMAIN}`, fullName: "Safiri Tours Ltd", county: "Nairobi", docsAccepted: true },
    { key: "dennis", email: `renter.dennis${DOMAIN}`, fullName: "Dennis Kariuki", county: "Nakuru", docsAccepted: false },
  ];
  for (const spec of renterSpecs) {
    renters[spec.key] = await seedRenter(spec);
  }

  // eslint-disable-next-line no-console
  console.log("Seeding bookings...");
  const merchantByKey: Record<string, SeededMerchant> = { A: merchantA, B: merchantB, D: merchantD };
  const vehicleOwner: Record<string, string> = {
    A1: "A", A2: "A", A3: "A", A4: "A", A5: "A",
    B1: "B", B2: "B", B3: "B",
    D1: "D", D2: "D",
  };

  const bookingSpecs: BookingSpec[] = [
    { key: "bk1", vehicleKey: "A1", renterKey: "faith", status: "requested", pickupDaysOffset: 3, durationDays: 3, note: "Weekend trip to Naivasha with my sister. I will be the only driver." },
    { key: "bk2", vehicleKey: "A1", renterKey: "safiri", status: "requested", pickupDaysOffset: 8, durationDays: 7, note: "Two guests, Maasai Mara circuit. Driver must have park entry experience." },
    { key: "bk3", vehicleKey: "A2", renterKey: "samuel", status: "confirmed", pickupDaysOffset: 5, durationDays: 2, note: null },
    { key: "bk4", vehicleKey: "A3", renterKey: "mercy", status: "active", pickupDaysOffset: -1, durationDays: 3, note: null },
    { key: "bk5", vehicleKey: "B1", renterKey: "peter", status: "requested", pickupDaysOffset: 2, durationDays: 2, note: "Airport pickup - flight lands 14:40." },
    { key: "bk6", vehicleKey: "B2", renterKey: "dennis", status: "confirmed", pickupDaysOffset: 6, durationDays: 3, note: "Moving furniture, Nakuru to Molo." },
    { key: "bk7", vehicleKey: "D1", renterKey: "faith", status: "declined", pickupDaysOffset: -10, durationDays: 4, note: null },
    { key: "bk8", vehicleKey: "D2", renterKey: "samuel", status: "expired", pickupDaysOffset: -15, durationDays: 2, note: null },
    { key: "bk9", vehicleKey: "A2", renterKey: "mercy", status: "cancelled", pickupDaysOffset: -8, durationDays: 2, note: null },
    { key: "bk10", vehicleKey: "A1", renterKey: "peter", status: "completed", pickupDaysOffset: -6, durationDays: 3, returnedDaysAgo: 3, depositReleased: true, note: null },
    { key: "bk11", vehicleKey: "A3", renterKey: "safiri", status: "completed", pickupDaysOffset: -27, durationDays: 7, returnedDaysAgo: 20, depositReleased: true, note: null },
    { key: "bk12", vehicleKey: "B1", renterKey: "dennis", status: "completed", pickupDaysOffset: -47, durationDays: 2, returnedDaysAgo: 45, depositReleased: true, note: null },
    { key: "bk13", vehicleKey: "D2", renterKey: "faith", status: "completed", pickupDaysOffset: -73, durationDays: 3, returnedDaysAgo: 70, depositReleased: true, note: null },
    { key: "bk14", vehicleKey: "A2", renterKey: "samuel", status: "completed", pickupDaysOffset: -104, durationDays: 4, returnedDaysAgo: 100, depositReleased: true, note: null },
    { key: "bk15", vehicleKey: "B2", renterKey: "mercy", status: "completed", pickupDaysOffset: -134, durationDays: 4, returnedDaysAgo: 130, depositReleased: true, note: null },
    { key: "bk16", vehicleKey: "D1", renterKey: "peter", status: "completed", pickupDaysOffset: -9, durationDays: 4, returnedDaysAgo: 5, depositReleased: false, note: null },
  ];

  const bookings: Record<string, { id: string; ref: string }> = {};
  for (const spec of bookingSpecs) {
    const vehicle = vehicles[spec.vehicleKey]!;
    const merchant = merchantByKey[vehicleOwner[spec.vehicleKey]!]!;
    const renter = renters[spec.renterKey]!;
    const result = await seedBooking(spec, vehicle, merchant, renter);
    if (result) bookings[spec.key] = result;
  }

  // eslint-disable-next-line no-console
  console.log("Seeding ratings...");
  const completedKeys = ["bk10", "bk11", "bk12", "bk13", "bk14", "bk15", "bk16"];
  for (const key of completedKeys) {
    const booking = bookings[key];
    const spec = bookingSpecs.find((s) => s.key === key)!;
    if (!booking) continue;
    const renter = renters[spec.renterKey]!;
    const merchant = merchantByKey[vehicleOwner[spec.vehicleKey]!]!;
    await db("ratings")
      .insert({
        id: generateId("review"),
        booking_id: booking.id,
        rater_id: merchant.userId,
        ratee_id: renter.userId,
        ratee_type: "hirer",
        stars: 5,
        comment: "On time, tank full, no marks.",
      })
      .onConflict(["booking_id", "rater_id", "ratee_type"])
      .ignore();
    // A renter rates the owner back on most (not all - "not rated yet" should still show somewhere real).
    if (key !== "bk16") {
      await db("ratings")
        .insert({
          id: generateId("review"),
          booking_id: booking.id,
          rater_id: renter.userId,
          ratee_id: merchant.userId,
          ratee_type: "merchant",
          stars: key === "bk15" ? 4 : 5,
          comment: key === "bk15" ? "Good car, a bit late on pickup." : "Smooth handover, car was exactly as listed.",
        })
        .onConflict(["booking_id", "rater_id", "ratee_type"])
        .ignore();
    }
  }

  // eslint-disable-next-line no-console
  console.log("Cutting payout runs...");
  async function cutFor(merchantKey: string, keys: string[]): Promise<void> {
    const merchant = merchantByKey[merchantKey]!;
    // Oldest first; every run but the last is marked paid, the most recent
    // stays `scheduled` - exactly the shape the payouts dev-seed uses, and
    // what makes the merchant's "Next payout" tile show something real.
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const booking = bookings[key];
      const spec = bookingSpecs.find((s) => s.key === key)!;
      if (!booking) continue;
      const returnedAt = daysAgo(spec.returnedDaysAgo ?? 3);
      const runDate = nextMonday(returnedAt);
      const isLast = i === keys.length - 1;
      const run = await db.transaction((trx) =>
        cutPayoutRun(
          trx,
          merchant.merchantId,
          { method: "mpesa", detail: merchant.phone, accountName: merchant.ownerName },
          {
            bookingIds: [booking.id],
            runDate,
            ...(isLast ? {} : { markPaid: { providerCode: `SJ${Math.floor(1000000 + Math.random() * 8999999)}`, paidAt: new Date(`${runDate}T06:36:00.000Z`) } }),
          },
        ),
      );
      if (run) {
        // eslint-disable-next-line no-console
        console.log(`  ${merchantKey}: cut ${run.ref} (${run.status}) for ${key}`);
      }
    }
  }
  // Oldest -> newest per merchant so the last one left `scheduled` is genuinely the most recent.
  await cutFor("A", ["bk14", "bk11"]);
  await cutFor("B", ["bk15", "bk12"]);
  await cutFor("D", ["bk13"]);
  // bk10 (A) and bk16 (D) stay uncut - bk10 is payable-but-not-yet-cut (the
  // dashboard's "Next payout" also counts these, not just scheduled runs);
  // bk16 is still inside its 24h deposit hold, so it is not payable at all.

  // eslint-disable-next-line no-console
  console.log("Seeding notifications...");
  const HOUR = 60 * 60 * 1000;
  await db.transaction(async (trx) => {
    // Merchant-side.
    await notify(trx, {
      merchantId: merchantA.merchantId,
      category: "booking",
      title: "New booking request",
      body: "A hirer wants your Land Cruiser Prado and has already paid CRAL. Answer before the window closes.",
      ref: bookings.bk1?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk1?.id ?? null,
      occurredAt: new Date(Date.now() - 3 * HOUR),
    });
    await notify(trx, {
      merchantId: merchantA.merchantId,
      category: "review",
      title: "Insurance certificate rejected",
      body: "The comprehensive insurance on your Pajero Sport has expired. Upload a current certificate to continue review.",
      ref: vehicles.A5?.registration ?? null,
      subjectType: "vehicle",
      subjectId: vehicles.A5?.id ?? null,
      occurredAt: daysAgo(1),
    });
    await notify(trx, {
      merchantId: merchantA.merchantId,
      category: "payout",
      title: "Payout sent",
      body: "Finished hires cleared to your M-Pesa. The Safaricom code is on the payout.",
      subjectType: "payout_run",
      occurredAt: daysAgo(20),
    });
    await notify(trx, {
      merchantId: merchantA.merchantId,
      category: "rating",
      title: "A hirer rated you 5 out of 5",
      body: '"Smooth handover, car was exactly as listed." You have not rated them back yet.',
      ref: bookings.bk10?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk10?.id ?? null,
      occurredAt: daysAgo(3),
    });

    await notify(trx, {
      merchantId: merchantB.merchantId,
      category: "review",
      title: "Vehicle is in the review queue",
      body: "Toyota RAV4 documents received. Reviews take up to two working days.",
      ref: vehicles.B3?.registration ?? null,
      subjectType: "vehicle",
      subjectId: vehicles.B3?.id ?? null,
      occurredAt: daysAgo(2),
    });
    await notify(trx, {
      merchantId: merchantB.merchantId,
      category: "booking",
      title: "New booking request",
      body: "A hirer wants your Isuzu Forward and has already paid CRAL.",
      ref: bookings.bk6?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk6?.id ?? null,
      occurredAt: daysAgo(1),
    });

    await notify(trx, {
      merchantId: merchantC.merchantId,
      category: "review",
      title: "Logbook rejected",
      body: "The name on the logbook is not yours. Upload a logbook in your name or a signed management agreement.",
      ref: vehicles.C1?.registration ?? null,
      subjectType: "vehicle",
      subjectId: vehicles.C1?.id ?? null,
      occurredAt: daysAgo(17),
    });

    await notify(trx, {
      merchantId: merchantD.merchantId,
      category: "return",
      title: "Vehicle returned",
      body: "The hirer returned the Land Cruiser. Condition photos are attached to the booking.",
      ref: bookings.bk16?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk16?.id ?? null,
      occurredAt: daysAgo(5),
    });

    // Renter-side.
    await notify(trx, {
      userId: renters.samuel!.userId,
      category: "booking",
      title: "Booking confirmed",
      body: "The owner accepted your request for the Toyota Probox. Pick-up details are on your trip.",
      ref: bookings.bk3?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk3?.id ?? null,
      occurredAt: daysAgo(1),
    });
    await notify(trx, {
      userId: renters.faith!.userId,
      category: "booking",
      title: "Request declined",
      body: "The owner already promised the Land Cruiser to another hirer for those dates. You have not been charged.",
      ref: bookings.bk7?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk7?.id ?? null,
      occurredAt: daysAgo(10),
    });
    await notify(trx, {
      userId: renters.peter!.userId,
      category: "rating",
      title: "James Mwangi rated you 5 out of 5",
      body: '"On time, tank full, no marks." Rate your trip back.',
      ref: bookings.bk10?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk10?.id ?? null,
      occurredAt: daysAgo(3),
    });
    await notify(trx, {
      userId: renters.mercy!.userId,
      category: "return",
      title: "Handover starting",
      body: "Your Toyota Hiace pickup is confirmed for today. The owner will meet you at Nairobi - Kilimani.",
      ref: bookings.bk4?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk4?.id ?? null,
      occurredAt: daysAgo(1),
    });
    await notify(trx, {
      userId: renters.dennis!.userId,
      category: "booking",
      title: "Booking confirmed",
      body: "The owner accepted your request for the Isuzu Forward. Pick-up details are on your trip.",
      ref: bookings.bk6?.ref ?? null,
      subjectType: "booking",
      subjectId: bookings.bk6?.id ?? null,
      occurredAt: daysAgo(1),
    });
  });

  // eslint-disable-next-line no-console
  console.log("Seeding admin communications...");
  const [insuranceTemplate] = await db("comms_templates")
    .insert({
      id: generateId("commsTemplate"),
      label: "Insurance renewal reminder",
      channel: "sms",
      body: "Hi {{name}}, your comprehensive insurance on {{registration}} expires soon. Upload the renewal in the CRAL merchant app to avoid a break in your listing.",
      created_by: admins.super!.id,
      use_count: 1,
      last_used_at: daysAgo(6),
    })
    .returning("*");
  const [welcomeTemplate] = await db("comms_templates")
    .insert({
      id: generateId("commsTemplate"),
      label: "Monthly payout reminder",
      channel: "email",
      subject: "Your CRAL payout schedule this month",
      body: "Hi {{name}}, a quick reminder of when your next payout is scheduled and how to update your M-Pesa or bank details if anything has changed.",
      created_by: admins.super!.id,
      use_count: 1,
      last_used_at: daysAgo(2),
    })
    .returning("*");

  await db("comms_runs").insert({
    id: generateId("commsRun"),
    audience_key: "expiring",
    channel: "sms",
    body: (insuranceTemplate as { body: string }).body,
    template_id: (insuranceTemplate as { id: string }).id,
    recipient_count: 3,
    sent_count: 3,
    failed_count: 0,
    status: "done",
    sent_by: admins.super!.id,
    completed_at: daysAgo(6),
    created_at: daysAgo(6),
    updated_at: daysAgo(6),
  });
  await db("comms_runs").insert({
    id: generateId("commsRun"),
    audience_key: "verified",
    channel: "email",
    subject: (welcomeTemplate as { subject: string }).subject,
    body: (welcomeTemplate as { body: string }).body,
    template_id: (welcomeTemplate as { id: string }).id,
    recipient_count: 3,
    sent_count: 2,
    failed_count: 1,
    status: "done",
    sent_by: admins.super!.id,
    completed_at: daysAgo(2),
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
  });

  // eslint-disable-next-line no-console
  console.log("\nDone. Every seeded account shares one password - sign in with any of these:\n");
  // eslint-disable-next-line no-console
  console.log(`  Password (all accounts): ${DEMO_PASSWORD}\n`);
  // eslint-disable-next-line no-console
  console.log(`  Admin (super, all queues):   admin.wanjiru${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Admin (reviewer):            admin.otieno${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Admin (finance):             admin.njoroge${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Merchant (approved, fleet):  merchant.mwangi${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Merchant (company):          merchant.riftvalley${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Merchant (not yet approved): merchant.achieng${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(`  Renter:                      renter.faith${DOMAIN}`);
  // eslint-disable-next-line no-console
  console.log(
    "\nThe admin console also asks for an SMS code at sign-in - with SMS_ADAPTER=console (the default for\nlocal dev), that code is printed to this API server's own terminal instead of being texted.\n",
  );

  await db.destroy();
}

main().catch(async (error: unknown) => {
  console.error("seed-demo failed:", error);
  await db.destroy();
  process.exit(1);
});
