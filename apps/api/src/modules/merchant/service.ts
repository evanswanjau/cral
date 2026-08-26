import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { emailAdapter } from "../../lib/adapters.js";
import {
  emailButton,
  emailHeading,
  emailLayout,
  emailMuted,
  emailParagraph,
} from "../../lib/email-templates.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import type {
  DocumentKind,
  DocumentRow,
  MerchantOnboardingReminderRow,
  MerchantRow,
  ReminderTier,
  VehicleRow,
} from "./db-types.js";
import type { CreateVehicleInput, PatchOnboardingInput, VehicleInput } from "./schemas.js";

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}

/** The merchant listing agreement from the Review step — independent of users.terms_accepted_version. */
const MERCHANT_TERMS_VERSION = "2026-08-25";

const VEHICLE_DOC_KINDS: DocumentKind[] = [
  "logbook",
  "comprehensive_insurance",
  "tracker_certificate",
];
const OWNER_DOC_KINDS: DocumentKind[] = ["national_id", "kra_pin"];
const MAX_VEHICLE_PHOTOS = 3;

// Built lazily, not at module load, so importing this module (which every
// test file does transitively via app.ts) doesn't require a working
// STORAGE_ADAPTER — only actually uploading a document does.
let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

function merchantAppUrl(): string {
  return (process.env.MERCHANT_APP_URL ?? "http://localhost:5174").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

export async function getOrCreateMerchant(userId: string): Promise<MerchantRow> {
  const existing = await db<MerchantRow>("merchants").where({ user_id: userId }).first();
  if (existing) return existing;

  const [created] = await db<MerchantRow>("merchants")
    .insert({ id: generateId("merchant"), user_id: userId })
    .returning("*");
  if (!created) throw new Error("Failed to create merchant draft");
  return created;
}

async function touchActivity(merchantId: string, trx: Knex.Transaction | Knex = db): Promise<void> {
  await trx("merchants").where({ id: merchantId }).update({ last_activity_at: new Date() });
}

async function requireOwnVehicle(userId: string, vehicleId: string): Promise<VehicleRow> {
  const merchant = await getOrCreateMerchant(userId);
  const vehicle = await db<VehicleRow>("vehicles")
    .where({ id: vehicleId, merchant_id: merchant.id })
    .first();
  if (!vehicle) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "vehicle_not_found",
      message: "That vehicle doesn't exist on your draft.",
    });
  }
  return vehicle;
}

function docSlot(doc: DocumentRow | undefined) {
  if (!doc) return null;
  return {
    status: "attached" as const,
    document_id: doc.id,
    original_name: doc.original_name,
    size_bytes: doc.size_bytes,
    content_type: doc.content_type,
    uploaded_at: doc.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------
// §9 Onboarding state — read + patch
// ---------------------------------------------------------------------

export async function getOnboardingState(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();
  const vehicles = await db<VehicleRow>("vehicles")
    .where({ merchant_id: merchant.id })
    .orderBy("created_at", "asc");
  const documents = await db<DocumentRow>("documents").where({ merchant_id: merchant.id });

  return serializeState(merchant, vehicles, documents, user?.phone ?? null);
}

function serializeState(
  merchant: MerchantRow,
  vehicles: VehicleRow[],
  documents: DocumentRow[],
  phone: string | null,
) {
  const ownerDocs = {
    national_id: docSlot(documents.find((d) => d.vehicle_id === null && d.kind === "national_id")),
    kra_pin: docSlot(documents.find((d) => d.vehicle_id === null && d.kind === "kra_pin")),
  };

  return {
    step: merchant.onboarding_step,
    max_step: merchant.onboarding_max_step,
    screen: merchant.onboarding_screen,
    owner_type: merchant.owner_type,
    company_name: merchant.company_name,
    company_cert_no: merchant.company_cert_no,
    company_kra: merchant.company_kra,
    first_name: merchant.first_name,
    middle_name: merchant.middle_name,
    surname: merchant.surname,
    national_id: merchant.national_id,
    kra_pin: merchant.kra_pin,
    phone, // lives on users, not merchants — see identity's §4 payout-phone deviation
    county: merchant.county,
    payout_same: merchant.payout_same,
    payout_method: merchant.payout_method,
    payout_detail: merchant.payout_detail,
    bank_name: merchant.bank_name,
    bank_branch: merchant.bank_branch,
    bank_account_name: merchant.bank_account_name,
    bank_account_number: merchant.bank_account_number,
    terms_accepted: merchant.merchant_terms_accepted_version !== null,
    owner_docs: ownerDocs,
    vehicles: vehicles.map((v) => serializeVehicle(v, documents)),
    submitted: merchant.onboarding_submitted,
    last_activity_at: merchant.last_activity_at.toISOString(),
  };
}

function serializeVehicle(vehicle: VehicleRow, documents: DocumentRow[]) {
  const vehicleDocs = documents.filter((d) => d.vehicle_id === vehicle.id);
  return {
    id: vehicle.id,
    type: vehicle.type,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    registration: vehicle.registration,
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    colour: vehicle.colour,
    pickup_address: vehicle.pickup_address,
    daily_rate: String(Math.round(vehicle.daily_rate_amount / 100)),
    insurance_expiry: vehicle.insurance_expiry,
    docs: {
      logbook: docSlot(vehicleDocs.find((d) => d.kind === "logbook")),
      comprehensive_insurance: docSlot(vehicleDocs.find((d) => d.kind === "comprehensive_insurance")),
      tracker_certificate: docSlot(vehicleDocs.find((d) => d.kind === "tracker_certificate")),
    },
    photos: vehicleDocs.filter((d) => d.kind === "vehicle_photo").map((d) => docSlot(d)),
  };
}

// users.phone is the actual payout-phone home (see identity's spec §4
// deviation); the onboarding wizard's "phone" field writes there, not to
// merchants, so patching it needs a users update alongside the merchant one.
async function setUserPhone(userId: string, phone: string): Promise<void> {
  await db("users").where({ id: userId }).update({ phone });
}

export async function patchOnboarding(
  userId: string,
  patch: PatchOnboardingInput,
  _ctx: RequestContext,
): Promise<ReturnType<typeof getOnboardingState>> {
  const merchant = await getOrCreateMerchant(userId);

  const { step, max_step, screen, phone, terms_accepted, ...rest } = patch;
  const update: Record<string, unknown> = { ...rest, last_activity_at: new Date() };
  if (step !== undefined) update.onboarding_step = step;
  if (screen !== undefined) update.onboarding_screen = screen;
  // Monotonic: the furthest step ever reached only ever moves forward, so
  // navigating back to an earlier step can't make later ones unreachable.
  if (max_step !== undefined) {
    update.onboarding_max_step = Math.max(max_step, merchant.onboarding_max_step);
  }
  if (terms_accepted === true && merchant.merchant_terms_accepted_version === null) {
    update.merchant_terms_accepted_version = MERCHANT_TERMS_VERSION;
    update.merchant_terms_accepted_at = new Date();
    update.merchant_terms_accepted_ip = _ctx.ip;
  } else if (terms_accepted === false) {
    update.merchant_terms_accepted_version = null;
    update.merchant_terms_accepted_at = null;
    update.merchant_terms_accepted_ip = null;
  }

  await db<MerchantRow>("merchants").where({ id: merchant.id }).update(update);
  if (phone) await setUserPhone(userId, phone);

  return getOnboardingState(userId);
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

function toDailyRateCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function vehicleUpdateFromInput(input: VehicleInput) {
  const { daily_rate, ...rest } = input;
  const update: Record<string, unknown> = { ...rest };
  const cents = toDailyRateCents(daily_rate);
  if (cents !== undefined) update.daily_rate_amount = cents;
  return update;
}

export async function addVehicle(userId: string, input: CreateVehicleInput, _ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const [vehicle] = await db<VehicleRow>("vehicles")
    .insert({
      id: generateId("vehicle"),
      merchant_id: merchant.id,
      ...vehicleUpdateFromInput(input),
    })
    .returning("*");
  if (!vehicle) throw new Error("Failed to create vehicle");
  await touchActivity(merchant.id);
  return serializeVehicle(vehicle, []);
}

export async function patchVehicle(
  userId: string,
  vehicleId: string,
  input: VehicleInput,
  _ctx: RequestContext,
) {
  const vehicle = await requireOwnVehicle(userId, vehicleId);
  const [updated] = await db<VehicleRow>("vehicles")
    .where({ id: vehicle.id })
    .update(vehicleUpdateFromInput(input))
    .returning("*");
  if (!updated) throw new Error("Failed to update vehicle");
  await touchActivity(vehicle.merchant_id);
  const documents = await db<DocumentRow>("documents").where({ vehicle_id: vehicle.id });
  return serializeVehicle(updated, documents);
}

export async function removeVehicle(userId: string, vehicleId: string, _ctx: RequestContext) {
  const vehicle = await requireOwnVehicle(userId, vehicleId);
  await db<VehicleRow>("vehicles").where({ id: vehicle.id }).delete();
  await touchActivity(vehicle.merchant_id);
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface UploadDocumentInput {
  kind: DocumentKind;
  vehicleId?: string | undefined;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

function buildStorageKey(merchantId: string, vehicleId: string | null, kind: DocumentKind, name: string): string {
  const safeName = name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  return `merchant/${merchantId}/${vehicleId ?? "owner"}/${kind}/${generateId("document")}-${safeName}`;
}

export async function uploadDocument(userId: string, input: UploadDocumentInput, _ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const isOwnerKind = OWNER_DOC_KINDS.includes(input.kind);
  const isVehicleKind = VEHICLE_DOC_KINDS.includes(input.kind) || input.kind === "vehicle_photo";

  if (isOwnerKind && input.vehicleId) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "vehicle_id_not_allowed",
      message: "Owner documents aren't scoped to a vehicle.",
      field: "vehicle_id",
    });
  }
  if (isVehicleKind && !input.vehicleId) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "vehicle_id_required",
      message: "This document kind needs a vehicle_id.",
      field: "vehicle_id",
    });
  }
  let vehicle: VehicleRow | null = null;
  if (input.vehicleId) vehicle = await requireOwnVehicle(userId, input.vehicleId);

  const key = buildStorageKey(merchant.id, vehicle?.id ?? null, input.kind, input.file.originalname);
  await getStorageAdapter().putObject({
    key,
    body: input.file.buffer,
    contentType: input.file.mimetype,
  });

  const row = await db.transaction(async (trx) => {
    if (input.kind === "vehicle_photo") {
      const count = await trx<DocumentRow>("documents")
        .where({ vehicle_id: vehicle!.id, kind: "vehicle_photo" })
        .count({ n: "*" })
        .first();
      if (Number(count?.n ?? 0) >= MAX_VEHICLE_PHOTOS) {
        throw new ApiError({
          status: 422,
          type: "validation_error",
          code: "too_many_photos",
          message: `Only ${MAX_VEHICLE_PHOTOS} photos are allowed per vehicle.`,
        });
      }
    } else {
      // Single-slot kind — replace whatever was there before.
      await trx<DocumentRow>("documents")
        .where({ merchant_id: merchant.id, vehicle_id: vehicle?.id ?? null, kind: input.kind })
        .delete();
    }

    const [inserted] = await trx<DocumentRow>("documents")
      .insert({
        id: generateId("document"),
        merchant_id: merchant.id,
        vehicle_id: vehicle?.id ?? null,
        kind: input.kind,
        storage_key: key,
        original_name: input.file.originalname,
        size_bytes: input.file.size,
        content_type: input.file.mimetype,
      })
      .returning("*");
    if (!inserted) throw new Error("Failed to record document");
    return inserted;
  });

  await touchActivity(merchant.id);

  return {
    document_id: row.id,
    original_name: row.original_name,
    size_bytes: row.size_bytes,
    content_type: row.content_type,
  };
}

export async function deleteDocument(userId: string, documentId: string, _ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, merchant_id: merchant.id })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist on your draft.",
    });
  }
  await db<DocumentRow>("documents").where({ id: doc.id }).delete();
  await touchActivity(merchant.id);
}

/**
 * Reads one of the caller's own documents back. This is what lets an
 * uploaded photo still render after a reload — object URLs die with the
 * page, and the storage bucket is never public, so the bytes have to come
 * back through an authenticated request.
 *
 * Scoped to the caller's merchant, so someone else's document id is a 404
 * (not a 403 — a merchant has no business learning that another merchant's
 * document exists).
 */
export async function readDocument(userId: string, documentId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, merchant_id: merchant.id })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist on your draft.",
    });
  }

  const body = await getStorageAdapter()
    .getObject(doc.storage_key)
    .catch(() => {
      // The row survived but the bytes didn't (a wiped .local-storage in
      // dev, most likely). Report it as missing rather than a 500.
      throw new ApiError({
        status: 404,
        type: "not_found",
        code: "document_bytes_missing",
        message: "That file is no longer stored. Attach it again.",
      });
    });

  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

// ---------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------

function outstandingDocumentCount(
  merchant: MerchantRow,
  vehicles: VehicleRow[],
  documents: DocumentRow[],
): number {
  const ownerMissing = OWNER_DOC_KINDS.filter(
    (kind) => !documents.some((d) => d.vehicle_id === null && d.kind === kind),
  ).length;
  const vehicleMissing = vehicles.reduce((sum, v) => {
    const missing = VEHICLE_DOC_KINDS.filter(
      (kind) => !documents.some((d) => d.vehicle_id === v.id && d.kind === kind),
    ).length;
    return sum + missing;
  }, 0);
  return ownerMissing + vehicleMissing;
}

async function assertCompleteForSubmission(userId: string): Promise<{
  merchant: MerchantRow;
  vehicles: VehicleRow[];
  documents: DocumentRow[];
}> {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();
  const vehicles = await db<VehicleRow>("vehicles").where({ merchant_id: merchant.id });
  const documents = await db<DocumentRow>("documents").where({ merchant_id: merchant.id });

  function fail(message: string): never {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "incomplete_onboarding",
      message,
    });
  }

  // Mirrors YourDetails.tsx's requiredFilled exactly.
  if (!merchant.first_name?.trim()) fail("First name is required.");
  if (!merchant.surname?.trim()) fail("Surname is required.");
  if (!merchant.national_id?.trim()) fail("National ID number is required.");
  if (!merchant.kra_pin?.trim()) fail("KRA PIN is required.");
  if (!user?.phone?.trim()) fail("Phone number is required.");
  if (!merchant.county?.trim()) fail("County is required.");

  if (merchant.owner_type === "company") {
    if (!merchant.company_name?.trim()) fail("Company name is required.");
    if (!merchant.company_cert_no?.trim()) fail("Certificate of incorporation number is required.");
    if (!merchant.company_kra?.trim()) fail("Company KRA PIN is required.");
  }

  const payoutFilled =
    merchant.payout_method === "bank"
      ? merchant.bank_name?.trim() &&
        merchant.bank_branch?.trim() &&
        merchant.bank_account_name?.trim() &&
        merchant.bank_account_number?.trim()
      : merchant.payout_same
        ? user?.phone?.trim()
        : merchant.payout_detail?.trim();
  if (!payoutFilled) fail("Payout details are incomplete.");

  if (vehicles.length === 0) fail("Add at least one vehicle.");

  for (const v of vehicles) {
    for (const kind of VEHICLE_DOC_KINDS) {
      if (!documents.some((d) => d.vehicle_id === v.id && d.kind === kind)) {
        fail(`${v.registration || "A vehicle"} is missing a required document.`);
      }
    }
    const hasInsuranceDoc = documents.some(
      (d) => d.vehicle_id === v.id && d.kind === "comprehensive_insurance",
    );
    if (hasInsuranceDoc) {
      if (!v.insurance_expiry) fail(`${v.registration || "A vehicle"}'s insurance expiry date is required.`);
      else if (new Date(v.insurance_expiry) < new Date()) {
        fail(`${v.registration || "A vehicle"}'s insurance has expired.`);
      }
    }
  }

  for (const kind of OWNER_DOC_KINDS) {
    if (!documents.some((d) => d.vehicle_id === null && d.kind === kind)) {
      fail("Your owner documents are incomplete.");
    }
  }

  if (merchant.merchant_terms_accepted_version === null) fail("Terms must be accepted.");

  return { merchant, vehicles, documents };
}

export async function submitOnboarding(userId: string, ctx: RequestContext) {
  const { merchant, vehicles, documents } = await assertCompleteForSubmission(userId);

  await db.transaction(async (trx) => {
    await trx<MerchantRow>("merchants")
      .where({ id: merchant.id })
      .update({ onboarding_submitted: true, last_activity_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "merchant.onboarding.submitted",
      entityType: "merchant",
      entityId: merchant.id,
      after: { onboarding_submitted: true },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return getOnboardingState(userId);
}

// ---------------------------------------------------------------------
// Reminder tiers (stalled onboarding — see jobs/merchant-reminders.ts)
// ---------------------------------------------------------------------

const TIERS: { tier: ReminderTier; afterMs: number }[] = [
  { tier: "24h", afterMs: 24 * 60 * 60 * 1000 },
  { tier: "3d", afterMs: 3 * 24 * 60 * 60 * 1000 },
  { tier: "30d", afterMs: 30 * 24 * 60 * 60 * 1000 },
];

/** Pure — every tier whose threshold has elapsed since `lastActivityAt`, largest first. */
export function computeDueTiers(lastActivityAt: Date, now: Date): ReminderTier[] {
  const elapsed = now.getTime() - lastActivityAt.getTime();
  return TIERS.filter((t) => elapsed >= t.afterMs)
    .sort((a, b) => b.afterMs - a.afterMs)
    .map((t) => t.tier);
}

/**
 * The single tier to send this sweep, or null. Picks the largest due tier
 * not yet satisfied — a merchant stalled 40 days with the job down for a
 * month gets one email, not three at once. "Satisfied" means a reminder row
 * exists for that tier with sent_at >= the merchant's current
 * last_activity_at — any earlier row is stale, from before a later activity
 * reset, and doesn't count.
 */
export async function findDueTierForMerchant(
  merchant: MerchantRow,
  now: Date,
): Promise<ReminderTier | null> {
  const due = computeDueTiers(merchant.last_activity_at, now);
  for (const tier of due) {
    const sent = await db<MerchantOnboardingReminderRow>("merchant_onboarding_reminders")
      .where({ merchant_id: merchant.id, tier })
      .andWhere("sent_at", ">=", merchant.last_activity_at)
      .first();
    if (!sent) return tier;
  }
  return null;
}

const TIER_COPY: Record<ReminderTier, { subject: string; heading: string }> = {
  "24h": { subject: "Pick up where you left off", heading: "You're almost there" },
  "3d": { subject: "Still there? Your listing is close", heading: "Your draft is waiting" },
  "30d": { subject: "Last call on your CRAL listing", heading: "It's been a month" },
};

const STEP_LABELS: Record<number, string> = {
  1: "Welcome",
  2: "Your details",
  3: "Vehicles",
  4: "Documents",
  5: "Review",
};

async function sendReminderEmail(merchant: MerchantRow, tier: ReminderTier): Promise<void> {
  const user = await db("users").where({ id: merchant.user_id }).first();
  if (!user?.email) return;

  const vehicles = await db<VehicleRow>("vehicles").where({ merchant_id: merchant.id });
  const documents = await db<DocumentRow>("documents").where({ merchant_id: merchant.id });
  const stepLabel = STEP_LABELS[merchant.onboarding_step] ?? "Onboarding";
  const outstanding = outstandingDocumentCount(merchant, vehicles, documents);

  const { subject, heading } = TIER_COPY[tier];
  const link = `${merchantAppUrl()}/onboarding`;
  const progressLine =
    merchant.onboarding_step === 4 && outstanding > 0
      ? `You're on Documents — ${outstanding} document${outstanding === 1 ? "" : "s"} left to attach.`
      : `You're on ${stepLabel}.`;

  await emailAdapter.send({
    to: user.email,
    subject,
    html: emailLayout({
      preheader: progressLine,
      bodyHtml: [
        emailHeading(heading),
        emailParagraph(progressLine),
        emailButton("Continue onboarding", link),
        emailMuted("You're getting this because your CRAL listing hasn't been submitted yet."),
      ].join(""),
    }),
    text: `${progressLine}\n\nContinue: ${link}`,
  });
}

/** Scans every unsubmitted merchant and sends at most one reminder each, run daily by the BullMQ worker. */
export async function runDailyReminderSweep(): Promise<{ sent: number }> {
  const stalled = await db<MerchantRow>("merchants").where({ onboarding_submitted: false });
  let sent = 0;
  for (const merchant of stalled) {
    const tier = await findDueTierForMerchant(merchant, new Date());
    if (!tier) continue;
    await sendReminderEmail(merchant, tier);
    await db<MerchantOnboardingReminderRow>("merchant_onboarding_reminders").insert({
      id: generateId("merchantOnboardingReminder"),
      merchant_id: merchant.id,
      tier,
    });
    sent++;
  }
  return { sent };
}
