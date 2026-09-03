import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from "./api.js";

/**
 * Settings → Business (merchant profile) and the Statements list on
 * Settings → Payouts. See openapi/merchant-settings.yaml and the
 * `/merchant/payouts/statements` path in openapi/merchant-payouts.yaml.
 */

export type OwnerType = "individual" | "company";

export type AccountDocKind =
  | "national_id"
  | "kra_pin"
  | "certificate_of_incorporation"
  | "company_kra_pin"
  | "cr12";

export interface ProfileDocument {
  kind: AccountDocKind;
  label: string;
  group: "personal" | "business";
  review_state: "ok" | "pending" | "expiring" | "rejected";
  uploaded_at: string | null;
  document_id: string | null;
}

export interface ProfileChangeRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  changes: Record<string, string>;
  reviewer_note: string | null;
  submitted_at: string;
  decided_at: string | null;
}

export type PayoutMethod = "mpesa" | "bank";
export type PayoutSchedule = "weekly" | "monthly";

export interface PayoutSettings {
  method: PayoutMethod;
  schedule: PayoutSchedule;
  /** Always the account phone - change it on the profile. */
  mpesa_number: string | null;
  mpesa_number_verified: boolean;
  mpesa_name: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
}

export interface PayoutSettingsInput {
  method: PayoutMethod;
  schedule: PayoutSchedule;
  mpesa_name?: string;
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
  /** True once onboarding is submitted - edits then go through change-request review. */
  profile_locked: boolean;
  pending_change: ProfileChangeRequest | null;
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

// --- profile change requests (post-submission edits) --------------

export function requestProfileChange(patch: MerchantProfilePatch) {
  return apiPost<ProfileChangeRequest>("/merchant/profile/change-request", patch);
}

export function withdrawProfileChangeRequest() {
  return apiDelete<void>("/merchant/profile/change-request");
}

export function useRequestProfileChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestProfileChange,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["merchant-profile"] }),
  });
}

export function useWithdrawProfileChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawProfileChangeRequest,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["merchant-profile"] }),
  });
}

/** Upload/replace an account-level document (owner ID, KRA, cert of incorporation, CR12). */
export function uploadAccountDocument(kind: AccountDocKind, file: File) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);
  return apiUpload<{ document_id: string }>("/merchant/onboarding/documents", form);
}

export function useUploadAccountDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: AccountDocKind; file: File }) =>
      uploadAccountDocument(kind, file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["merchant-profile"] }),
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
