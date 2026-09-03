import { z } from "zod";
import { VEHICLE_CATEGORIES } from "../vehicles/categories.js";

export const PatchOnboardingSchema = z.object({
  step: z.number().int().min(1).max(5).optional(),
  max_step: z.number().int().min(1).max(5).optional(),
  screen: z.enum(["fleet", "vehicle-form"]).optional(),
  owner_type: z.enum(["individual", "company"]).optional(),
  company_name: z.string().optional(),
  company_cert_no: z.string().optional(),
  company_kra: z.string().optional(),
  company_email: z.string().email().or(z.literal("")).optional(),
  company_address: z.string().optional(),
  first_name: z.string().optional(),
  middle_name: z.string().optional(),
  surname: z.string().optional(),
  national_id: z.string().optional(),
  kra_pin: z.string().optional(),
  phone: z.string().optional(),
  payout_same: z.boolean().optional(),
  payout_method: z.enum(["mpesa", "bank"]).optional(),
  payout_detail: z.string().optional(),
  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  terms_accepted: z.boolean().optional(),
});
export type PatchOnboardingInput = z.infer<typeof PatchOnboardingSchema>;

export const VehicleInputSchema = z.object({
  type: z.enum(VEHICLE_CATEGORIES).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  registration: z.string().optional(),
  transmission: z.enum(["Automatic", "Manual"]).optional(),
  fuel: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]).optional(),
  colour: z.string().optional(),
  // County is progressively filled like insurance_expiry — optional on the
  // wizard's lazy create, enforced per-vehicle at submission time.
  county: z.string().optional(),
  pickup_address: z.string().optional(),
  daily_rate: z.string().optional(),
  // Display-only preference; `daily_rate` is always the gross/list price.
  rate_mode: z.enum(["list", "net"]).optional(),
  insurance_expiry: z.string().nullable().optional(),
  chauffeured: z.boolean().optional(),
});
export type VehicleInput = z.infer<typeof VehicleInputSchema>;

export const CreateVehicleSchema = VehicleInputSchema.extend({
  type: z.enum(VEHICLE_CATEGORIES),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.string().min(1),
  registration: z.string().min(1),
  transmission: z.enum(["Automatic", "Manual"]),
  fuel: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]),
  pickup_address: z.string().min(1),
  daily_rate: z.string().min(1),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;

const DOCUMENT_KINDS = [
  "national_id",
  "kra_pin",
  "logbook",
  "comprehensive_insurance",
  "tracker_certificate",
  "vehicle_photo",
] as const;

export const UploadDocumentQuerySchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  vehicle_id: z.string().optional(),
});
export type UploadDocumentQuery = z.infer<typeof UploadDocumentQuerySchema>;

// --- Settings → Business (see openapi/merchant-settings.yaml) ----------
//
// Every field optional; `.strict()` so a typo'd key is a 422 rather than a
// silent no-op. `phone` is handled specially (routed through setUserPhone).
export const ProfilePatchSchema = z
  .object({
    owner_type: z.enum(["individual", "company"]),
    trading_name: z.string().max(200),
    company_name: z.string(),
    company_cert_no: z.string(),
    company_kra: z.string(),
    company_email: z.string().email().or(z.literal("")),
    company_address: z.string(),
    first_name: z.string(),
    middle_name: z.string(),
    surname: z.string(),
    kra_pin: z.string(),
    national_id: z.string(),
    phone: z.string(),
  })
  .partial()
  .strict();
export type ProfilePatchInput = z.infer<typeof ProfilePatchSchema>;

// --- Settings → Payouts (see openapi/merchant-settings.yaml) -----------
//
// A full replace of the payout block. Rules enforced in the service:
//  - `method: "mpesa"` is rejected for company merchants (paid to a bank
//    account in the company name — the same rule onboarding enforces).
//  - The M-Pesa payout number is *always* `users.phone` — there is no
//    field for it here; to change it, change the phone on the profile.
//  - `schedule` is coerced to "monthly" whenever `method` is "bank".
export const PayoutSettingsSchema = z.object({
  method: z.enum(["mpesa", "bank"]),
  schedule: z.enum(["weekly", "monthly"]),
  mpesa_name: z.string().max(200).optional(),
  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
});
export type PayoutSettingsInput = z.infer<typeof PayoutSettingsSchema>;
