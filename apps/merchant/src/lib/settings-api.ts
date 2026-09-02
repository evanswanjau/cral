import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "./api.js";

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

export interface MerchantProfile {
  owner_type: OwnerType;
  trading_name: string | null;
  company_name: string | null;
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
  approved_at: string | null;
  member_since: string;
  documents: ProfileDocument[];
}

export type MerchantProfilePatch = Partial<
  Pick<
    MerchantProfile,
    | "owner_type"
    | "trading_name"
    | "company_name"
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
