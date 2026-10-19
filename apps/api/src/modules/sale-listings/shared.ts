import type { Knex } from "knex";
import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery, enqueueRenterNotificationDelivery } from "../../jobs/notification-delivery.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { effectiveDocState } from "../vehicles/service.js";
import type { DocumentRow, MerchantRow } from "../merchant/db-types.js";
import type { UserRow } from "../auth/db-types.js";
import { PHOTO_SLOTS, type PhotoSlot } from "./schemas.js";
import type { SaleListingRow, SaleListingStatus } from "./db-types.js";

/**
 * Helpers shared by the three car-sales modules - the seller side
 * (`sale-listings`), the public catalog (`sales-catalog`) and Ops
 * (`admin-sale-listings`). One copy of the rules each of them reads, so the
 * seller, the buyer and the reviewer can't disagree about what a listing is.
 */

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
export function saleStorage(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/** Statuses that still hold the car's plate and chassis (the partial unique indexes' `WHERE`). */
export const OPEN_STATUSES: SaleListingStatus[] = [
  "draft",
  "pending",
  "review",
  "action",
  "rejected",
  "live",
  "paused",
  "under_offer",
];
/** Listed means a buyer can see it. */
export const PUBLIC_STATUSES: SaleListingStatus[] = ["live", "under_offer"];
/** A reviewer can open a case in these - never a draft. */
export const CASE_STATUSES: SaleListingStatus[] = [
  "pending",
  "review",
  "action",
  "rejected",
  "live",
  "paused",
  "under_offer",
  "sold",
  "withdrawn",
  "expired",
  "removed",
];
/** Open listings a private (non-merchant) account may hold at once (owner's call, 2026-10-19). */
export const PRIVATE_LISTING_LIMIT = 2;
/** How long a listing stays live before it expires and needs a one-tap renew. */
export const LISTING_LIFETIME_DAYS = 60;
/** The expiry reminder goes out this many days before. */
export const EXPIRY_REMINDER_DAYS = 7;

export const PHOTO_LABELS: Record<PhotoSlot, string> = {
  front: "Front, plate showing",
  rear: "Rear, plate showing",
  left: "Left side",
  right: "Right side",
  interior_front: "Front seats and dashboard",
  interior_rear: "Rear seats",
  dashboard: "Odometer, engine running",
  engine_bay: "Engine bay with the chassis plate",
};

export const DOC_LABELS = {
  logbook: "Logbook",
  bank_clearance_letter: "Bank clearance letter",
  ntsa_search: "NTSA official search",
} as const;
export type SaleOwnDocKind = keyof typeof DOC_LABELS;
export const SALE_OWN_DOC_KINDS = Object.keys(DOC_LABELS) as SaleOwnDocKind[];

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function askingPrice(row: Pick<SaleListingRow, "asking_price_amount">): Money {
  return kes(Number(row.asking_price_amount));
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function title(row: Pick<SaleListingRow, "year" | "make" | "model">): string {
  return `${row.year} ${row.make} ${row.model}`;
}

export function notFound(code = "sale_listing_not_found", message = "That listing isn't available."): never {
  throw new ApiError({ status: 404, type: "not_found", code, message });
}

export function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

export function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface SaleDocs {
  logbook: DocumentRow | undefined;
  bank_clearance_letter: DocumentRow | undefined;
  ntsa_search: DocumentRow | undefined;
  photos: Record<PhotoSlot, DocumentRow | undefined>;
}

export async function saleDocuments(listingIds: string[]): Promise<Map<string, SaleDocs>> {
  const out = new Map<string, SaleDocs>();
  if (!listingIds.length) return out;
  const rows = await db<DocumentRow>("documents").whereIn("sale_listing_id", listingIds);
  for (const id of listingIds) {
    const own = rows.filter((r) => r.sale_listing_id === id);
    const photos = {} as Record<PhotoSlot, DocumentRow | undefined>;
    for (const slot of PHOTO_SLOTS) photos[slot] = own.find((r) => r.kind === "sale_photo" && r.slot === slot);
    out.set(id, {
      logbook: own.find((r) => r.kind === "logbook"),
      bank_clearance_letter: own.find((r) => r.kind === "bank_clearance_letter"),
      ntsa_search: own.find((r) => r.kind === "ntsa_search"),
      photos,
    });
  }
  return out;
}

export function docSlot(doc: DocumentRow | undefined) {
  if (!doc) return null;
  return {
    document_id: doc.id,
    original_name: doc.original_name,
    review_state: effectiveDocState(doc),
    review_note: doc.review_note,
  };
}

/** What is still missing before a listing can be submitted: the logbook and all eight photos. */
export function missingForSubmit(docs: SaleDocs): string[] {
  const missing: string[] = [];
  if (!docs.logbook || docs.logbook.review_state === "rejected") missing.push(DOC_LABELS.logbook.toLowerCase());
  const photos = PHOTO_SLOTS.filter((s) => !docs.photos[s] || docs.photos[s]!.review_state === "rejected");
  if (photos.length === PHOTO_SLOTS.length) missing.push("the eight photos");
  else if (photos.length) missing.push(`photos: ${photos.map((s) => PHOTO_LABELS[s].toLowerCase()).join(", ")}`);
  return missing;
}

// ---------------------------------------------------------------------
// The seller and their gate
// ---------------------------------------------------------------------

export interface Seller {
  user: UserRow;
  merchant: MerchantRow | null;
}

export async function loadSeller(userId: string): Promise<Seller> {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) throw new ApiError({ status: 401, type: "auth_error", code: "unauthenticated", message: "Sign in again." });
  const merchant = (await db<MerchantRow>("merchants").where({ user_id: userId }).first()) ?? null;
  return { user, merchant };
}

export interface SellerGate {
  type: "merchant" | "private";
  cleared: boolean;
  /** Why not, in the seller's words - null when cleared. */
  reason: string | null;
}

/**
 * Who may have a listing go live (docs/plans/car-sales.md section 2):
 * a merchant once their account is approved; a private seller once their
 * national ID has been accepted on the renter review and their phone is
 * verified (a buyer has to be able to reach them).
 */
export async function sellerGate(seller: Seller): Promise<SellerGate> {
  if (seller.merchant) {
    const cleared = seller.merchant.approved_at !== null;
    return {
      type: "merchant",
      cleared,
      reason: cleared ? null : "Your merchant account is still being reviewed.",
    };
  }
  if (!seller.user.phone_verified) {
    return { type: "private", cleared: false, reason: "Verify your phone number in your account." };
  }
  const id = await db<DocumentRow>("documents")
    .where({ user_id: seller.user.id, kind: "national_id" })
    .orderBy("created_at", "desc")
    .first();
  if (!id) return { type: "private", cleared: false, reason: "Upload your national ID in your account." };
  if (id.review_state === "rejected") {
    return { type: "private", cleared: false, reason: "Your national ID was not accepted. Upload it again in your account." };
  }
  if (id.review_state !== "ok") return { type: "private", cleared: false, reason: "Your national ID is still being checked." };
  return { type: "private", cleared: true, reason: null };
}

/** The name a buyer sees for the seller: the business, or a private seller's first name. */
export function sellerDisplayName(user: Pick<UserRow, "full_name">, merchant: MerchantRow | null): string {
  if (merchant) {
    if (merchant.owner_type === "company" && merchant.company_name) return merchant.trading_name ?? merchant.company_name;
    const first = merchant.first_name ?? user.full_name?.split(" ")[0];
    return first ?? "Private seller";
  }
  return user.full_name?.split(" ")[0] ?? "Private seller";
}

// ---------------------------------------------------------------------
// Serialising - the seller's own view (Ops reuses the car/disclosure half)
// ---------------------------------------------------------------------

export function carBlock(row: SaleListingRow) {
  return {
    category: row.category,
    make: row.make,
    model: row.model,
    year: row.year,
    registration: row.registration,
    chassis_number: row.chassis_number,
    mileage_km: row.mileage_km,
    engine_cc: row.engine_cc,
    transmission: row.transmission,
    fuel: row.fuel,
    colour: row.colour,
    drive: row.drive,
    import_status: row.import_status,
  };
}

export function disclosuresBlock(row: SaleListingRow) {
  return {
    known_faults: row.known_faults,
    accident_history: row.accident_history,
    accident_note: row.accident_note,
    encumbered: row.encumbered,
    service_history: row.service_history,
  };
}

export function documentsBlock(docs: SaleDocs) {
  return {
    logbook: docSlot(docs.logbook),
    bank_clearance_letter: docSlot(docs.bank_clearance_letter),
    ntsa_search: docSlot(docs.ntsa_search),
    photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s, docSlot(docs.photos[s])])) as Record<
      PhotoSlot,
      ReturnType<typeof docSlot>
    >,
  };
}

export function serializeForSeller(
  row: SaleListingRow,
  docs: SaleDocs,
  gate: SellerGate,
  enquiries: { total: number; new: number },
) {
  return {
    id: row.id,
    ref: row.ref,
    title: title(row),
    status: row.status,
    vehicle_id: row.vehicle_id,
    seller_type: gate.type,
    seller_cleared: gate.cleared,
    seller_gate_reason: gate.reason,
    car: carBlock(row),
    asking_price: askingPrice(row),
    negotiable: row.negotiable,
    disclosures: disclosuresBlock(row),
    county: row.county,
    viewing_area: row.viewing_area,
    description: row.description,
    auto_share_contact: row.auto_share_contact,
    reviewer_note: row.reviewer_note,
    documents: documentsBlock(docs),
    missing_for_submit: missingForSubmit(docs),
    enquiries,
    view_count: row.view_count,
    submitted_at: iso(row.submitted_at),
    live_at: iso(row.live_at),
    expires_at: iso(row.expires_at),
    sold_at: iso(row.sold_at),
    created_at: row.created_at.toISOString(),
  };
}
export type SellerListing = ReturnType<typeof serializeForSeller>;

export async function enquiryCounts(listingIds: string[]): Promise<Map<string, { total: number; new: number }>> {
  const out = new Map<string, { total: number; new: number }>();
  for (const id of listingIds) out.set(id, { total: 0, new: 0 });
  if (!listingIds.length) return out;
  const rows = await db("sale_enquiries")
    .whereIn("sale_listing_id", listingIds)
    .groupBy("sale_listing_id", "status")
    .select("sale_listing_id", "status")
    .count<{ sale_listing_id: string; status: string; count: string }[]>("* as count");
  for (const r of rows) {
    const c = out.get(r.sale_listing_id)!;
    c.total += Number(r.count);
    if (r.status === "new") c.new += Number(r.count);
  }
  return out;
}

// ---------------------------------------------------------------------
// Notifying the seller - a merchant's feed, or a private seller's own
// ---------------------------------------------------------------------

type NotifyArgs = Omit<Parameters<typeof notify>[1], "merchantId" | "userId">;

/** Writes the seller's feed row inside the caller's transaction. */
export async function notifySeller(
  trx: Knex.Transaction,
  listing: Pick<SaleListingRow, "merchant_id" | "seller_user_id">,
  input: NotifyArgs,
): Promise<string> {
  return listing.merchant_id
    ? notify(trx, { ...input, merchantId: listing.merchant_id } as Parameters<typeof notify>[1])
    : notify(trx, { ...input, userId: listing.seller_user_id } as Parameters<typeof notify>[1]);
}

/** Post-commit delivery for rows written by `notifySeller`. */
export async function deliverToSeller(listing: Pick<SaleListingRow, "merchant_id">, ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (listing.merchant_id) await enqueueNotificationDelivery(listing.merchant_id, ids);
  else await enqueueRenterNotificationDelivery(ids);
}
