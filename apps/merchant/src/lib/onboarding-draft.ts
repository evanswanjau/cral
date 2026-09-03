/**
 * Client-side draft state for the merchant onboarding wizard.
 *
 * The server (apps/api/src/modules/merchant) is now the source of truth - 
 * `loadDraftFromServer` reads it on mount and `syncDraftToServer`/the
 * vehicle and document functions below push every meaningful change back,
 * which is what makes resuming on a different device or browser possible.
 * `localStorage` is kept only as a same-device offline-typing buffer: it's
 * still written on every change so a flaky connection doesn't lose
 * keystrokes, but it's read back only when the server has nothing yet.
 */

import { getCurrentUserId } from "./auth.js";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import type { VehicleType } from "./vehicle-categories.js";

export type OwnerType = "individual" | "company";
/**
 * Individuals are paid by M-Pesa; registered companies are paid by bank
 * transfer only, because the account has to be in the company name to match
 * its KRA records - an M-Pesa line belongs to a person, not a company.
 * (Owner's call, 2026-08-25 - supersedes the earlier M-Pesa-only rule.)
 */
export type PayoutMethod = "mpesa" | "bank";
export type { VehicleType };
export type Transmission = "Automatic" | "Manual";
export type Fuel = "Petrol" | "Diesel" | "Hybrid" | "Electric";

/** A single attached document's metadata, plus the server id needed to delete it. */
export interface DraftDocument {
  documentId: string;
  name: string;
  size: number;
  type: string;
}

export interface VehicleDocs {
  logbook: DraftDocument | null;
  comprehensiveInsurance: DraftDocument | null;
  trackerCertificate: DraftDocument | null;
}

/** Metadata for one uploaded photo. Preview image lives in photo-preview-cache.ts for the session only. */
export interface DraftPhoto {
  id: string;
  documentId: string;
  name: string;
  size: number;
  type: string;
}

export interface DraftVehicle {
  id: string;
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  registration: string;
  transmission: Transmission;
  fuel: Fuel;
  colour: string;
  county: string;
  pickupAddress: string;
  dailyRate: string;
  /** "list" = dailyRate is the price a hirer pays; "net" = it was grossed up from a take-home amount. */
  rateMode: "list" | "net";
  /** true = hire comes with the owner's driver; false = self-drive. */
  chauffeured: boolean;
  photos: DraftPhoto[];
  docs: VehicleDocs;
  insuranceExpiry: string;
}

export interface OwnerDocs {
  nationalId: DraftDocument | null;
  kraPin: DraftDocument | null;
  /** Company only. */
  certificateOfIncorporation: DraftDocument | null;
  cr12: DraftDocument | null;
}

export interface OnboardingDraft {
  step: number;
  /** Furthest step ever reached - drives which stepper tabs are clickable. */
  maxStepReached: number;
  screen: "fleet" | "vehicle-form";
  ownerType: OwnerType;
  companyName: string;
  certNo: string;
  companyKra: string;
  companyEmail: string;
  companyAddress: string;
  firstName: string;
  middleName: string;
  surname: string;
  nationalId: string;
  kraPin: string;
  phone: string;
  /** Server-owned: true once the payout phone has passed SMS verification. Not patchable. */
  phoneVerified: boolean;
  /** Read-only here - collected once at sign-up (CLAUDE.md's recorded decision), prefilled from GET /me. */
  email: string;
  payoutSame: boolean;
  payoutMethod: PayoutMethod;
  /** M-Pesa payout number, national format without the +254. */
  payoutDetail: string;
  bankName: string;
  bankBranch: string;
  bankAccountName: string;
  bankAccountNumber: string;
  termsAccepted: boolean;
  ownerDocs: OwnerDocs;
  vehicles: DraftVehicle[];
  editingVehicleId: string | null;
  vehicleDraft: DraftVehicle | null;
  submitted: boolean;
}

const KEY_PREFIX = "cral-merchant-onboarding-v3";

function storageKey(): string {
  const userId = getCurrentUserId();
  return userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX;
}

export function emptyDraft(): OnboardingDraft {
  return {
    step: 1,
    maxStepReached: 1,
    screen: "fleet",
    ownerType: "individual",
    companyName: "",
    certNo: "",
    companyKra: "",
    companyEmail: "",
    companyAddress: "",
    firstName: "",
    middleName: "",
    surname: "",
    nationalId: "",
    kraPin: "",
    phone: "",
    phoneVerified: false,
    email: "",
    payoutSame: true,
    payoutMethod: "mpesa",
    payoutDetail: "",
    bankName: "",
    bankBranch: "",
    bankAccountName: "",
    bankAccountNumber: "",
    termsAccepted: false,
    ownerDocs: { nationalId: null, kraPin: null, certificateOfIncorporation: null, cr12: null },
    vehicles: [],
    editingVehicleId: null,
    vehicleDraft: null,
    submitted: false,
  };
}

export function emptyVehicle(id: string): DraftVehicle {
  return {
    id,
    type: "sedan",
    make: "",
    model: "",
    year: "",
    registration: "",
    transmission: "Automatic",
    fuel: "Petrol",
    colour: "",
    county: "",
    pickupAddress: "",
    dailyRate: "",
    rateMode: "list",
    chauffeured: true,
    photos: [],
    docs: { logbook: null, comprehensiveInsurance: null, trackerCertificate: null },
    insuranceExpiry: "",
  };
}

// --- local offline-typing buffer ---------------------------------------

function loadLocalDraft(): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return emptyDraft();
    return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<OnboardingDraft>) };
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(draft: OnboardingDraft): void {
  window.localStorage.setItem(storageKey(), JSON.stringify(draft));
}

export function clearDraft(): void {
  window.localStorage.removeItem(storageKey());
}

/**
 * Whether this merchant is allowed past onboarding into the dashboard. A
 * submitted draft always has at least one vehicle (the Vehicles step won't
 * advance without one), but both are checked so a hand-edited or partially
 * migrated draft can't unlock an empty dashboard.
 */
export function isOnboardingComplete(draft: OnboardingDraft): boolean {
  return draft.submitted && draft.vehicles.length > 0;
}

// --- server sync ---------------------------------------------------------

interface WireDocSlot {
  status: "attached";
  document_id: string;
  original_name: string;
  size_bytes: number;
  content_type: string;
  uploaded_at: string;
}

interface WireVehicle {
  id: string;
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  registration: string;
  transmission: Transmission;
  fuel: Fuel;
  colour: string | null;
  county: string | null;
  pickup_address: string | null;
  daily_rate: string;
  rate_mode?: "list" | "net";
  chauffeured: boolean;
  insurance_expiry: string | null;
  docs: {
    logbook: WireDocSlot | null;
    comprehensive_insurance: WireDocSlot | null;
    tracker_certificate: WireDocSlot | null;
  };
  photos: (WireDocSlot | null)[];
}

interface WireOnboardingState {
  step: number;
  max_step: number;
  screen: "fleet" | "vehicle-form";
  owner_type: OwnerType;
  company_name: string | null;
  company_cert_no: string | null;
  company_kra: string | null;
  company_email: string | null;
  company_address: string | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  national_id: string | null;
  kra_pin: string | null;
  phone: string | null;
  phone_verified: boolean;
  payout_same: boolean;
  payout_method: PayoutMethod;
  payout_detail: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  terms_accepted: boolean;
  owner_docs: {
    national_id: WireDocSlot | null;
    kra_pin: WireDocSlot | null;
    certificate_of_incorporation: WireDocSlot | null;
    cr12: WireDocSlot | null;
  };
  vehicles: WireVehicle[];
  submitted: boolean;
  last_activity_at: string;
}

function toDraftDoc(slot: WireDocSlot | null): DraftDocument | null {
  if (!slot) return null;
  return {
    documentId: slot.document_id,
    name: slot.original_name,
    size: slot.size_bytes,
    type: slot.content_type,
  };
}

function toDraftVehicle(v: WireVehicle): DraftVehicle {
  return {
    id: v.id,
    type: v.type,
    make: v.make,
    model: v.model,
    year: v.year,
    registration: v.registration,
    transmission: v.transmission,
    fuel: v.fuel,
    colour: v.colour ?? "",
    county: v.county ?? "",
    pickupAddress: v.pickup_address ?? "",
    chauffeured: v.chauffeured ?? true,
    dailyRate: v.daily_rate,
    rateMode: v.rate_mode === "net" ? "net" : "list",
    photos: v.photos
      .filter((p): p is WireDocSlot => p !== null)
      .map((p) => ({ id: p.document_id, documentId: p.document_id, name: p.original_name, size: p.size_bytes, type: p.content_type })),
    docs: {
      logbook: toDraftDoc(v.docs.logbook),
      comprehensiveInsurance: toDraftDoc(v.docs.comprehensive_insurance),
      trackerCertificate: toDraftDoc(v.docs.tracker_certificate),
    },
    insuranceExpiry: v.insurance_expiry ?? "",
  };
}

/**
 * Maps the server's state onto the wizard's draft shape.
 *
 * Note what is deliberately *not* taken from the server: `screen`,
 * `editingVehicleId` and `vehicleDraft` are ephemeral navigation state that
 * only means anything within one page session. `editingVehicleId` can't
 * survive a round-trip, so honouring a persisted `screen: "vehicle-form"`
 * used to land the merchant in a blank form that reported itself as new - 
 * and typing into it created a *duplicate* vehicle beside the one they
 * thought they were editing. Resuming always lands on the fleet list, at
 * the step they left off.
 */
function toDraft(state: WireOnboardingState): OnboardingDraft {
  return {
    step: state.step,
    maxStepReached: Math.max(state.max_step ?? state.step, state.step),
    screen: "fleet",
    ownerType: state.owner_type,
    companyName: state.company_name ?? "",
    certNo: state.company_cert_no ?? "",
    companyKra: state.company_kra ?? "",
    companyEmail: state.company_email ?? "",
    companyAddress: state.company_address ?? "",
    firstName: state.first_name ?? "",
    middleName: state.middle_name ?? "",
    surname: state.surname ?? "",
    nationalId: state.national_id ?? "",
    kraPin: state.kra_pin ?? "",
    phone: state.phone ?? "",
    phoneVerified: state.phone_verified ?? false,
    email: "", // filled separately from GET /me, as before
    payoutSame: state.payout_same,
    payoutMethod: state.payout_method,
    payoutDetail: state.payout_detail ?? "",
    bankName: state.bank_name ?? "",
    bankBranch: state.bank_branch ?? "",
    bankAccountName: state.bank_account_name ?? "",
    bankAccountNumber: state.bank_account_number ?? "",
    termsAccepted: state.terms_accepted,
    ownerDocs: {
      nationalId: toDraftDoc(state.owner_docs.national_id),
      kraPin: toDraftDoc(state.owner_docs.kra_pin),
      certificateOfIncorporation: toDraftDoc(state.owner_docs.certificate_of_incorporation ?? null),
      cr12: toDraftDoc(state.owner_docs.cr12 ?? null),
    },
    vehicles: state.vehicles.map(toDraftVehicle),
    editingVehicleId: null,
    vehicleDraft: null,
    submitted: state.submitted,
  };
}

/**
 * Loads onboarding progress, server-first. A brand-new draft (nothing typed
 * yet on the server) falls back to whatever's in the local offline-typing
 * buffer, so a merchant who started filling in the form just before a
 * network hiccup doesn't lose it. Once the server has anything real, it's
 * authoritative - that's what makes resuming on a different device work.
 */
export async function loadDraftFromServer(): Promise<OnboardingDraft> {
  const state = await apiGet<WireOnboardingState>("/merchant/onboarding");
  const fromServer = toDraft(state);
  const isBrandNew = state.step === 1 && state.vehicles.length === 0 && state.first_name === null;
  if (isBrandNew) {
    const local = loadLocalDraft();
    if (local.step > 1 || local.vehicles.length > 0 || local.firstName) {
      // Same reasoning as toDraft(): never resume into the vehicle form,
      // whose in-progress identity can't be trusted across a page session.
      return { ...local, screen: "fleet", editingVehicleId: null, vehicleDraft: null };
    }
  }
  return fromServer;
}

const PATCHABLE_KEYS: (keyof OnboardingDraft)[] = [
  "step",
  "maxStepReached",
  "screen",
  "ownerType",
  "companyName",
  "certNo",
  "companyKra",
  "companyEmail",
  "companyAddress",
  "firstName",
  "middleName",
  "surname",
  "nationalId",
  "kraPin",
  "phone",
  "payoutSame",
  "payoutMethod",
  "payoutDetail",
  "bankName",
  "bankBranch",
  "bankAccountName",
  "bankAccountNumber",
  "termsAccepted",
];

const DRAFT_TO_WIRE_KEY: Partial<Record<keyof OnboardingDraft, string>> = {
  maxStepReached: "max_step",
  ownerType: "owner_type",
  companyName: "company_name",
  certNo: "company_cert_no",
  companyKra: "company_kra",
  companyEmail: "company_email",
  companyAddress: "company_address",
  firstName: "first_name",
  middleName: "middle_name",
  nationalId: "national_id",
  kraPin: "kra_pin",
  payoutSame: "payout_same",
  payoutMethod: "payout_method",
  payoutDetail: "payout_detail",
  bankName: "bank_name",
  bankBranch: "bank_branch",
  bankAccountName: "bank_account_name",
  bankAccountNumber: "bank_account_number",
  termsAccepted: "terms_accepted",
};

/** Maps a partial draft patch to the PATCH /merchant/onboarding wire shape and sends it. Debounced by callers. */
export async function syncDraftToServer(patch: Partial<OnboardingDraft>): Promise<void> {
  const wireBody: Record<string, unknown> = {};
  for (const key of PATCHABLE_KEYS) {
    if (!(key in patch)) continue;
    const wireKey = DRAFT_TO_WIRE_KEY[key] ?? key;
    wireBody[wireKey] = patch[key];
  }
  if (Object.keys(wireBody).length === 0) return;
  await apiPatch("/merchant/onboarding", wireBody);
}

// --- phone verification ----------------------------------------------

/**
 * Pushes the current phone to the server, then texts a code to it. Kept
 * here so callers don't have to know it's two calls - the debounced draft
 * sync might not have landed the number yet when the merchant hits "Send
 * code".
 */
export async function startPhoneVerification(phone: string): Promise<{ masked_destination: string }> {
  await apiPatch("/merchant/onboarding", { phone });
  return apiPost<{ masked_destination: string }>("/auth/phone/verification/start");
}

export async function confirmPhoneVerification(code: string): Promise<void> {
  await apiPost("/auth/phone/verification/confirm", { code });
}

// --- vehicles --------------------------------------------------------

function vehicleToWireInput(v: Partial<DraftVehicle>) {
  const { pickupAddress, dailyRate, rateMode, insuranceExpiry, ...rest } = v;
  const body: Record<string, unknown> = { ...rest };
  if (pickupAddress !== undefined) body.pickup_address = pickupAddress;
  if (dailyRate !== undefined) body.daily_rate = dailyRate;
  if (rateMode !== undefined) body.rate_mode = rateMode;
  if (insuranceExpiry !== undefined) body.insurance_expiry = insuranceExpiry || null;
  return body;
}

export async function createVehicleOnServer(v: DraftVehicle): Promise<DraftVehicle> {
  const created = await apiPost<WireVehicle>("/merchant/onboarding/vehicles", vehicleToWireInput(v));
  return toDraftVehicle(created);
}

export async function updateVehicleOnServer(id: string, v: Partial<DraftVehicle>): Promise<DraftVehicle> {
  const updated = await apiPatch<WireVehicle>(`/merchant/onboarding/vehicles/${id}`, vehicleToWireInput(v));
  return toDraftVehicle(updated);
}

export async function deleteVehicleOnServer(id: string): Promise<void> {
  await apiDelete(`/merchant/onboarding/vehicles/${id}`);
}

// --- documents / photos ------------------------------------------------

interface WireUploadResponse {
  document_id: string;
  original_name: string;
  size_bytes: number;
  content_type: string;
}

async function uploadDocument(
  kind: string,
  file: File,
  vehicleId?: string,
): Promise<DraftDocument> {
  const formData = new FormData();
  formData.append("kind", kind);
  if (vehicleId) formData.append("vehicle_id", vehicleId);
  formData.append("file", file);
  const res = await apiUpload<WireUploadResponse>("/merchant/onboarding/documents", formData);
  return { documentId: res.document_id, name: res.original_name, size: res.size_bytes, type: res.content_type };
}

export function uploadOwnerDocument(
  kind: "national_id" | "kra_pin" | "certificate_of_incorporation" | "cr12",
  file: File,
): Promise<DraftDocument> {
  return uploadDocument(kind, file);
}

export function uploadVehicleDocument(
  vehicleId: string,
  kind: "logbook" | "comprehensive_insurance" | "tracker_certificate",
  file: File,
): Promise<DraftDocument> {
  return uploadDocument(kind, file, vehicleId);
}

export async function uploadVehiclePhoto(vehicleId: string, file: File): Promise<DraftPhoto> {
  const doc = await uploadDocument("vehicle_photo", file, vehicleId);
  return { id: doc.documentId, documentId: doc.documentId, name: doc.name, size: doc.size, type: doc.type };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiDelete(`/merchant/onboarding/documents/${documentId}`);
}

// --- submit --------------------------------------------------------------

/** Real submission. Throws ApiClientError with a specific message if the server finds the draft incomplete. */
export async function submitDraft(): Promise<OnboardingDraft> {
  const state = await apiPost<WireOnboardingState>("/merchant/onboarding/submit");
  const next = toDraft(state);
  saveDraft(next);
  return next;
}
