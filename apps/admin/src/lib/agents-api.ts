import { apiGet, apiPost } from "./api.js";

/** `openapi/admin-agents.yaml` - a sales agent's two screens. */

export type AgentMerchantStatus = "invited" | "onboarding" | "submitted" | "changes_requested" | "verified";

export interface AgentMerchant {
  id: string;
  owner_type: "individual" | "company";
  name: string | null;
  email: string;
  /** E.164. */
  phone: string | null;
  status: AgentMerchantStatus;
  onboarding: { step: number; of: number; label: string };
  invite_pending: boolean;
  invited_at: string | null;
  onboarding_source: "self" | "agent_invite" | "agent_link";
  agent: { id: string; name: string } | null;
  created_at: string;
  last_activity_at: string;
}

export interface AgentMerchantsResponse {
  data: AgentMerchant[];
  next_cursor: string | null;
  has_more: boolean;
  total: number;
}

export interface InviteResult {
  merchant: AgentMerchant;
  invite_sent: boolean;
}

export function fetchAgentMerchants(params: { q?: string; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiGet<AgentMerchantsResponse>(`/admin/agents/merchants${qs ? `?${qs}` : ""}`);
}

/** The caller's personal sign-up link (PR AG2). The code is issued on the first call. */
export interface SignupLink {
  code: string;
  url: string;
}

export function fetchSignupLink() {
  return apiGet<SignupLink>("/admin/agents/link");
}

/** Every sales agent, for Ops Merchants' agent filter. Owner only. */
export interface AgentSummary {
  id: string;
  name: string;
  status: "active" | "disabled";
  merchants: number;
}

export function fetchAgents() {
  return apiGet<{ data: AgentSummary[] }>("/admin/agents");
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function addAgentMerchant(input: {
  owner_type: "individual" | "company";
  name: string;
  email: string;
  phone: string;
}) {
  return apiPost<InviteResult>("/admin/agents/merchants", input, idem());
}

export function resendAgentInvite(merchantId: string) {
  return apiPost<InviteResult>(`/admin/agents/merchants/${merchantId}/resend-invite`, undefined, idem());
}

/** `+254712345678` -> `0712 345 678`, the way people read a number aloud. */
export function displayPhone(e164: string): string {
  const local = e164.startsWith("+254") ? `0${e164.slice(4)}` : e164;
  return local.length === 10 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

/** A WhatsApp chat with the merchant - wa.me takes the number without the "+". */
export function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}
