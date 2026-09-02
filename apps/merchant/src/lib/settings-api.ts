import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPut } from "./api.js";

/**
 * Settings → Business (merchant profile) and the Statements list on
 * Settings → Payouts. See openapi/merchant-settings.yaml and the
 * `/merchant/payouts/statements` path in openapi/merchant-payouts.yaml.
 */

export type OwnerType = "individual" | "company";

export interface ProfileDocument {
  kind: "national_id" | "kra_pin";
  label: string;
  review_state: "ok" | "pending" | "expiring" | "rejected";
  uploaded_at: string | null;
  document_id: string | null;
}

export type PayoutMethod = "mpesa" | "bank";
export type PayoutSchedule = "weekly" | "monthly";

export interface PayoutSettings {
  method: PayoutMethod;
  schedule: PayoutSchedule;
  /** Always the account phone — change it on the profile. */
  mpesa_number: string | null;
  mpesa_number_verified: boolean;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
}

export interface PayoutSettingsInput {
  method: PayoutMethod;
  schedule: PayoutSchedule;
  bank_name?: string;
  bank_branch?: string;
  bank_account_name?: string;
  bank_account_number?: string;
}

export interface MerchantProfile {
  owner_type: OwnerType;
  trading_name: string | null;
  company_name: string | null;
  company_cert_no: string | null;
  company_kra: string | null;
  company_email: string | null;
  company_address: string | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  kra_pin: string | null;
  national_id: string | null;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  account_status: "active" | "suspended" | "pending_deletion" | "deleted";
  deletion_scheduled_at: string | null;
  approved_at: string | null;
  member_since: string;
  payout: PayoutSettings;
  documents: ProfileDocument[];
}

export type MerchantProfilePatch = Partial<
  Pick<
    MerchantProfile,
    | "owner_type"
    | "trading_name"
    | "company_name"
    | "company_cert_no"
    | "company_kra"
    | "company_email"
    | "company_address"
    | "first_name"
    | "middle_name"
    | "surname"
    | "kra_pin"
    | "national_id"
  >
> & { phone?: string };

export function getProfile() {
  return apiGet<MerchantProfile>("/merchant/profile");
}

export function patchProfile(patch: MerchantProfilePatch) {
  return apiPatch<MerchantProfile>("/merchant/profile", patch);
}

export function useProfile() {
  return useQuery({ queryKey: ["merchant-profile"], queryFn: getProfile });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchProfile,
    onSuccess: (data) => {
      qc.setQueryData(["merchant-profile"], data);
      // The header chip and onboarding cache read some of the same fields.
      void qc.invalidateQueries({ queryKey: ["onboarding"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function updatePayoutSettings(input: PayoutSettingsInput) {
  return apiPut<PayoutSettings>("/merchant/payout-settings", input);
}

export function useUpdatePayoutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updatePayoutSettings,
    onSuccess: () => {
      // The block lives inside the profile payload the Payouts tab reads.
      void qc.invalidateQueries({ queryKey: ["merchant-profile"] });
    },
  });
}

// --- Statements (Settings → Payouts) --------------------------------

export interface StatementMonth {
  month: string;
  label: string;
  net: { amount: number; currency: string };
}

export function listStatements() {
  return apiGet<{ data: StatementMonth[] }>("/merchant/payouts/statements");
}

export function useStatements() {
  return useQuery({ queryKey: ["payout-statements"], queryFn: listStatements });
}
