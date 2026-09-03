import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { appendVehicleEvent, nextListingRef } from "../../lib/vehicle-events.js";
import { isUniqueViolation, rethrowRegistrationConflict } from "../../lib/pg-errors.js";
import { assertNotPast } from "../../lib/dates.js";
import { normalizePhone } from "../../lib/identifier.js";
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
  ProfileChangeRequestRow,
  ReminderTier,
  VehicleRow,
} from "./db-types.js";
import type {
  CreateVehicleInput,
  PatchOnboardingInput,
  PayoutSettingsInput,
  ProfilePatchInput,
  VehicleInput,
} from "./schemas.js";

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

  return serializeState(
    merchant,
    vehicles,
    documents,
    user?.phone ?? null,
    Boolean(user?.phone_verified),
  );
}

function serializeState(
  merchant: MerchantRow,
  vehicles: VehicleRow[],
  documents: DocumentRow[],
  phone: string | null,
  phoneVerified: boolean,
) {
  const ownerDoc = (kind: DocumentKind) =>
    docSlot(documents.find((d) => d.vehicle_id === null && d.kind === kind));
  const ownerDocs = {
    national_id: ownerDoc("national_id"),
    kra_pin: ownerDoc("kra_pin"),
    certificate_of_incorporation: ownerDoc("certificate_of_incorporation"),
    cr12: ownerDoc("cr12"),
  };

  return {
    step: merchant.onboarding_step,
    max_step: merchant.onboarding_max_step,
    screen: merchant.onboarding_screen,
    owner_type: merchant.owner_type,
    company_name: merchant.company_name,
    company_cert_no: merchant.company_cert_no,
    company_kra: merchant.company_kra,
    company_email: merchant.company_email,
    company_address: merchant.company_address,
    first_name: merchant.first_name,
    middle_name: merchant.middle_name,
    surname: merchant.surname,
    national_id: merchant.national_id,
    kra_pin: merchant.kra_pin,
    // Stored E.164, but the wizard's PhoneInput works in bare national
    // digits (it prepends +254 itself) — hand it back in that shape.
    phone: phone ? phone.replace(/^\+254/, "") : null,
    phone_verified: phoneVerified,
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
    county: vehicle.county,
    pickup_address: vehicle.pickup_address,
    daily_rate: String(Math.round(vehicle.daily_rate_amount / 100)),
    rate_mode: vehicle.rate_mode === "net" ? "net" : "list",
    chauffeured: vehicle.chauffeured,
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
async function setUserPhone(
  userId: string,
  rawPhone: string,
  conn: Knex | Knex.Transaction = db,
): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "That doesn't look like a valid Kenyan phone number.",
      field: "phone",
    });
  }

  const current = await conn("users").where({ id: userId }).first();
  // Changing the number drops any prior verification — the new one hasn't
  // been proven, and a verified flag must never follow a number it wasn't
  // earned on.
  const update: Record<string, unknown> =
    current?.phone === phone ? { phone } : { phone, phone_verified: false };

  try {
    await conn("users").where({ id: userId }).update(update);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError({
        status: 409,
        type: "conflict",
        code: "phone_taken",
        message: "That phone number is already registered to another account.",
        field: "phone",
      });
    }
    throw err;
  }
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
// Settings → Business — merchant profile read + patch
// (see openapi/merchant-settings.yaml)
// ---------------------------------------------------------------------

// Account-level documents shown on Settings -> Business. "personal" ones
// are always shown; "business" ones only for a company. This is display +
// upload only - the onboarding submission gate still uses OWNER_DOC_KINDS
// (national_id + kra_pin) and is untouched.
const PROFILE_DOC_META: Record<string, { label: string; group: "personal" | "business" }> = {
  national_id: { label: "Owner ID - front and back", group: "personal" },
  kra_pin: { label: "KRA PIN certificate", group: "personal" },
  certificate_of_incorporation: { label: "Certificate of incorporation", group: "business" },
  cr12: { label: "CR12 - company shareholding", group: "business" },
};
/** Account-level document kinds that may be uploaded from Settings -> Business. */
export const ACCOUNT_DOC_KINDS = Object.keys(PROFILE_DOC_META) as DocumentKind[];

// Columns the Business tab may write. `phone` is deliberately not here —
// it goes through setUserPhone so E.164 normalisation and the
// phone_verified reset both still happen (spec §10 gate).
const PROFILE_MERCHANT_FIELDS = [
  "owner_type",
  "trading_name",
  "company_name",
  "company_cert_no",
  "company_kra",
  "company_email",
  "company_address",
  "first_name",
  "middle_name",
  "surname",
  "kra_pin",
  "national_id",
] as const;

/**
 * The payout block, shared by GET /merchant/profile and the response of
 * PUT /merchant/payout-settings. The M-Pesa number is *always* the
 * account phone — to change it you change the phone on the profile — so
 * `mpesa_number_verified` is just `users.phone_verified`.
 */
function serializePayout(
  merchant: MerchantRow,
  user: { phone?: string | null; phone_verified?: boolean } | undefined,
) {
  return {
    method: (merchant.payout_method === "bank" ? "bank" : "mpesa") as "mpesa" | "bank",
    schedule: (merchant.payout_schedule === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly",
    mpesa_number: user?.phone ?? null,
    mpesa_number_verified: Boolean(user?.phone_verified) && !!user?.phone,
    mpesa_name: merchant.payout_mpesa_name,
    bank_name: merchant.bank_name,
    bank_branch: merchant.bank_branch,
    bank_account_name: merchant.bank_account_name,
    bank_account_number: merchant.bank_account_number,
  };
}

interface ProfileUser {
  email?: string | null;
  phone?: string | null;
  phone_verified?: boolean;
  status?: string | null;
  erasure_cooling_off_until?: Date | string | null;
}

function serializeProfile(
  merchant: MerchantRow,
  user: ProfileUser | undefined,
  documents: DocumentRow[],
) {
  const deletionAt = user?.erasure_cooling_off_until
    ? new Date(user.erasure_cooling_off_until).toISOString()
    : null;
  return {
    owner_type: merchant.owner_type,
    trading_name: merchant.trading_name,
    company_name: merchant.company_name,
    company_cert_no: merchant.company_cert_no,
    company_kra: merchant.company_kra,
    company_email: merchant.company_email,
    company_address: merchant.company_address,
    first_name: merchant.first_name,
    middle_name: merchant.middle_name,
    surname: merchant.surname,
    kra_pin: merchant.kra_pin,
    national_id: merchant.national_id,
    email: user?.email ?? "",
    phone: user?.phone ?? null,
    phone_verified: Boolean(user?.phone_verified),
    account_status: user?.status ?? "active",
    deletion_scheduled_at: user?.status === "pending_deletion" ? deletionAt : null,
    approved_at: merchant.approved_at ? merchant.approved_at.toISOString() : null,
    member_since: merchant.created_at.toISOString(),
    payout: serializePayout(merchant, user),
    documents: Object.entries(PROFILE_DOC_META)
      .filter(([, meta]) => meta.group === "personal" || merchant.owner_type === "company")
      .map(([kind, meta]) => {
        const doc = documents.find((d) => d.vehicle_id === null && d.kind === kind);
        return {
          kind,
          label: meta.label,
          group: meta.group,
          review_state: doc?.review_state ?? "pending",
          uploaded_at: doc ? doc.created_at.toISOString() : null,
          document_id: doc?.id ?? null,
        };
      }),
  };
}

function serializeChangeRequest(row: ProfileChangeRequestRow) {
  return {
    id: row.id,
    status: row.status,
    changes: row.changes,
    reviewer_note: row.reviewer_note,
    submitted_at: row.created_at.toISOString(),
    decided_at: row.decided_at ? row.decided_at.toISOString() : null,
  };
}

export async function getProfile(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();
  const documents = await db<DocumentRow>("documents").where({ merchant_id: merchant.id });
  const pending = await db<ProfileChangeRequestRow>("profile_change_requests")
    .where({ merchant_id: merchant.id, status: "pending" })
    .first();
  return {
    ...serializeProfile(merchant, user, documents),
    // Once onboarding is submitted the fields are locked - changes go
    // through review (see requestProfileChange).
    profile_locked: merchant.onboarding_submitted,
    pending_change: pending ? serializeChangeRequest(pending) : null,
  };
}

/** The set of fields a change request may touch (merchant columns + phone). */
const CHANGE_REQUEST_FIELDS = [...PROFILE_MERCHANT_FIELDS, "phone"] as const;

/**
 * Post-submission profile edits don't apply directly - they're captured as
 * a `profile_change_requests` row an admin approves, at which point the
 * account goes back to review. Pre-submission (the wizard hasn't finished)
 * the same call still applies immediately.
 */
export async function patchProfile(
  userId: string,
  patch: ProfilePatchInput,
  ctx: RequestContext,
): Promise<ReturnType<typeof getProfile>> {
  const merchant = await getOrCreateMerchant(userId);

  if (merchant.onboarding_submitted) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "profile_locked",
      message: "These details are locked after submission. Request a change for review instead.",
    });
  }

  const { phone, ...rest } = patch;
  const merchantUpdate: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const field of PROFILE_MERCHANT_FIELDS) {
    if (rest[field] === undefined) continue;
    merchantUpdate[field] = rest[field];
    before[field] = (merchant as unknown as Record<string, unknown>)[field];
  }

  if (merchantUpdate.owner_type === "company" && merchant.payout_method !== "bank") {
    merchantUpdate.payout_method = "bank";
  }

  if (Object.keys(merchantUpdate).length === 0 && phone === undefined) {
    return getProfile(userId);
  }

  await db.transaction(async (trx) => {
    if (Object.keys(merchantUpdate).length > 0) {
      merchantUpdate.last_activity_at = new Date();
      await trx<MerchantRow>("merchants").where({ id: merchant.id }).update(merchantUpdate);
    }
    if (phone !== undefined) await setUserPhone(userId, phone, trx);

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "merchant.profile_updated",
      entityType: "merchant",
      entityId: merchant.id,
      before: Object.keys(before).length ? before : undefined,
      after: {
        ...merchantUpdate,
        ...(phone !== undefined ? { phone_changed: true } : {}),
      },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return getProfile(userId);
}

export async function getProfileChangeRequest(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const pending = await db<ProfileChangeRequestRow>("profile_change_requests")
    .where({ merchant_id: merchant.id, status: "pending" })
    .first();
  return pending ? serializeChangeRequest(pending) : null;
}

export async function requestProfileChange(
  userId: string,
  patch: ProfilePatchInput,
  ctx: RequestContext,
) {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();

  // Only fields that actually differ from what's on file.
  const changes: Record<string, unknown> = {};
  for (const field of CHANGE_REQUEST_FIELDS) {
    const next = (patch as Record<string, unknown>)[field];
    if (next === undefined) continue;
    const current =
      field === "phone"
        ? (user?.phone ?? "")
        : ((merchant as unknown as Record<string, unknown>)[field] ?? "");
    if (String(next) !== String(current)) changes[field] = next;
  }

  if (Object.keys(changes).length === 0) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "no_changes",
      message: "Nothing here is different from what's on file.",
    });
  }

  const id = generateId("profileChangeRequest");
  const row = await db.transaction(async (trx) => {
    // One open request at a time - a new submission replaces the last.
    await trx("profile_change_requests")
      .where({ merchant_id: merchant.id, status: "pending" })
      .delete();
    const [inserted] = await trx<ProfileChangeRequestRow>("profile_change_requests")
      .insert({ id, merchant_id: merchant.id, requested_by: userId, status: "pending", changes })
      .returning("*");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "merchant.profile_change_requested",
      entityType: "merchant",
      entityId: merchant.id,
      after: { request_id: id, fields: Object.keys(changes) },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return inserted!;
  });

  return serializeChangeRequest(row);
}

export async function withdrawProfileChangeRequest(userId: string, ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const deleted = await db("profile_change_requests")
    .where({ merchant_id: merchant.id, status: "pending" })
    .delete();
  if (deleted === 0) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "no_pending_change",
      message: "There's no change waiting for review.",
    });
  }
  await writeAuditEntry(db, {
    actorId: userId,
    actorType: "user",
    action: "merchant.profile_change_withdrawn",
    entityType: "merchant",
    entityId: merchant.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

/**
 * Admin decision on a change request. No admin portal yet, so this runs
 * from `apps/api/src/scripts/review-profile-change.ts`. Approving applies
 * the diff and sends the account back to review (`approved_at` -> null).
 */
export async function reviewProfileChange(
  requestId: string,
  decision: "approve" | "reject",
  reviewerId: string,
  note: string | null,
) {
  const req = await db<ProfileChangeRequestRow>("profile_change_requests")
    .where({ id: requestId })
    .first();
  if (!req) throw new Error(`No profile change request ${requestId}`);
  if (req.status !== "pending") throw new Error(`Request ${requestId} is already ${req.status}`);

  await db.transaction(async (trx) => {
    if (decision === "approve") {
      const { phone, ...merchantFields } = req.changes as Record<string, unknown>;
      if (Object.keys(merchantFields).length > 0) {
        await trx<MerchantRow>("merchants")
          .where({ id: req.merchant_id })
          .update({ ...merchantFields, last_activity_at: new Date() });
      }
      if (phone !== undefined) {
        const merchant = await trx<MerchantRow>("merchants").where({ id: req.merchant_id }).first();
        if (merchant) await setUserPhone(merchant.user_id, String(phone), trx);
      }
      // Back to review - the papers behind these fields need a fresh look.
      await trx<MerchantRow>("merchants").where({ id: req.merchant_id }).update({ approved_at: null });
    }
    await trx<ProfileChangeRequestRow>("profile_change_requests").where({ id: requestId }).update({
      status: decision === "approve" ? "approved" : "rejected",
      reviewer_id: reviewerId,
      reviewer_note: note,
      decided_at: new Date(),
    });
    await writeAuditEntry(trx, {
      actorId: reviewerId,
      actorType: "admin",
      action: `merchant.profile_change_${decision === "approve" ? "approved" : "rejected"}`,
      entityType: "merchant",
      entityId: req.merchant_id,
      after: { request_id: requestId, note },
    });
  });
}

// ---------------------------------------------------------------------
// Settings → Payouts — full replace of the payout block
// ---------------------------------------------------------------------

export async function getPayoutSettings(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();
  return serializePayout(merchant, user);
}

export async function updatePayoutSettings(
  userId: string,
  input: PayoutSettingsInput,
  ctx: RequestContext,
): Promise<ReturnType<typeof serializePayout>> {
  const merchant = await getOrCreateMerchant(userId);
  const user = await db("users").where({ id: userId }).first();

  // Companies are paid to a bank account in the company name — the same
  // rule onboarding's "Your details" step enforces (M-Pesa card disabled
  // for companies). Reject it here rather than silently coercing.
  if (merchant.owner_type === "company" && input.method === "mpesa") {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "mpesa_not_allowed_for_company",
      message: "Registered companies are paid by bank transfer only.",
      field: "method",
    });
  }

  const update: Record<string, unknown> = {
    payout_method: input.method,
    // Bank payouts always run monthly, on the 1st — no choice (owner's
    // call). M-Pesa may be weekly or monthly.
    payout_schedule: input.method === "bank" ? "monthly" : input.schedule,
    last_activity_at: new Date(),
  };

  if (input.method === "mpesa") {
    // The M-Pesa number is always the account phone; only the name is editable.
    update.payout_same = true;
    update.payout_detail = null;
    update.payout_mpesa_name = input.mpesa_name?.trim() || null;
  } else {
    update.bank_name = input.bank_name?.trim() || null;
    update.bank_branch = input.bank_branch?.trim() || null;
    update.bank_account_name = input.bank_account_name?.trim() || null;
    update.bank_account_number = (input.bank_account_number ?? "").replace(/\s/g, "") || null;
  }

  const before = {
    payout_method: merchant.payout_method,
    payout_schedule: merchant.payout_schedule,
    payout_same: merchant.payout_same,
    payout_detail: merchant.payout_detail,
    bank_name: merchant.bank_name,
    bank_account_number: merchant.bank_account_number,
  };

  await db.transaction(async (trx) => {
    await trx<MerchantRow>("merchants").where({ id: merchant.id }).update(update);
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "merchant.payout_settings_updated",
      entityType: "merchant",
      entityId: merchant.id,
      before,
      after: update,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const updated = await db<MerchantRow>("merchants").where({ id: merchant.id }).first();
  return serializePayout(updated!, user);
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
  const vehicle = await db
    .transaction(async (trx) => {
      const listingRef = await nextListingRef(trx);
      const [created] = await trx<VehicleRow>("vehicles")
        .insert({
          id: generateId("vehicle"),
          merchant_id: merchant.id,
          listing_ref: listingRef,
          ...vehicleUpdateFromInput(input),
        })
        .returning("*");
      if (!created) throw new Error("Failed to create vehicle");
      return created;
    })
    .catch(rethrowRegistrationConflict);
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
  if (input.insurance_expiry) assertNotPast(input.insurance_expiry, "insurance_expiry");
  const [updated] = await db<VehicleRow>("vehicles")
    .where({ id: vehicle.id })
    .update(vehicleUpdateFromInput(input))
    .returning("*")
    .catch(rethrowRegistrationConflict);
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
  const isOwnerKind = ACCOUNT_DOC_KINDS.includes(input.kind);
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
  if (!user?.phone_verified) fail("Verify your phone number before submitting.");

  if (merchant.owner_type === "company") {
    if (!merchant.company_name?.trim()) fail("Company name is required.");
    if (!merchant.company_cert_no?.trim()) fail("Certificate of incorporation number is required.");
    if (!merchant.company_kra?.trim()) fail("Company KRA PIN is required.");
    if (!merchant.company_email?.trim()) fail("Company email is required.");
    if (!merchant.company_address?.trim()) fail("Company physical location is required.");
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
    if (!v.county?.trim()) fail(`${v.registration || "A vehicle"} is missing its county.`);
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

  const requiredOwnerDocs: DocumentKind[] =
    merchant.owner_type === "company"
      ? [...OWNER_DOC_KINDS, "certificate_of_incorporation", "cr12"]
      : OWNER_DOC_KINDS;
  for (const kind of requiredOwnerDocs) {
    if (!documents.some((d) => d.vehicle_id === null && d.kind === kind)) {
      fail("Your account documents are incomplete.");
    }
  }

  if (merchant.merchant_terms_accepted_version === null) fail("Terms must be accepted.");

  return { merchant, vehicles, documents };
}

export async function submitOnboarding(userId: string, ctx: RequestContext) {
  const { merchant, vehicles } = await assertCompleteForSubmission(userId);

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

    // Every vehicle built through the wizard is submitted right along with
    // it — a vehicle added in onboarding must land as "pending review" on
    // the Vehicles screen, not sit as an editable draft the merchant never
    // explicitly submitted. Skips anything already past draft (defensive —
    // "add another vehicle" after a first submission re-runs this on a mix
    // of old and new vehicles).
    for (const v of vehicles) {
      if (v.status !== "draft") continue;
      const listingRef = v.listing_ref ?? (await nextListingRef(trx));
      await trx<VehicleRow>("vehicles")
        .where({ id: v.id })
        .update({ status: "pending", submitted_at: new Date(), listing_ref: listingRef });
      await appendVehicleEvent(trx, {
        vehicleId: v.id,
        merchantId: merchant.id,
        kind: "submitted",
        tone: "amber",
        label: "Submitted for review",
        body: "In the queue. Reviews take up to two working days.",
        actorType: "merchant",
      });
    }
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

/**
 * Scans every unsubmitted merchant and sends at most one onboarding
 * reminder each, then does the daily notification housekeeping — the
 * insurance-expiry generator and the 90-day retention purge. Run daily by
 * the BullMQ worker (10:00 Nairobi).
 *
 * The notifications module is imported lazily: it depends on this file for
 * `getOrCreateMerchant`, so a static import would be a cycle.
 */
export async function runDailyReminderSweep(): Promise<{
  sent: number;
  expiryNotices: number;
  purged: number;
  accountsDeleted: number;
}> {
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

  const { runExpiryNotificationSweep, purgeExpiredNotifications } = await import("../notifications/service.js");
  const expiryNotices = await runExpiryNotificationSweep();
  const purged = await purgeExpiredNotifications();

  // Accounts whose 30-day deletion grace period has elapsed. Lazy import —
  // auth/service isn't otherwise a dependency of this module.
  const { runAccountDeletionSweep } = await import("../auth/service.js");
  const { purged: accountsDeleted } = await runAccountDeletionSweep();

  return { sent, expiryNotices, purged, accountsDeleted };
}
