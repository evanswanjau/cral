import { apiGet, apiPost } from "./api.js";

export type CommsChannel = "sms" | "email" | "both";
export type AudienceKey = "all" | "verified" | "pending" | "companies" | "expiring" | "single";

export interface AudienceRow {
  key: AudienceKey;
  label: string;
  count: number;
  sms_opt_out_count: number;
  note: string;
}

export interface TemplateRow {
  id: string | null;
  label: string;
  channel: CommsChannel;
  subject: string | null;
  body: string;
  trigger: "automatic" | "manual";
  use_count: number;
  last_used_at: string | null;
}

export interface CommsRun {
  id: string;
  audience_key: AudienceKey;
  audience_label: string;
  channel: CommsChannel;
  subject: string | null;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sending" | "done";
  sent_by_name: string;
  created_at: string;
  completed_at: string | null;
}

export interface CommsRunsResponse {
  data: CommsRun[];
  next_cursor: string | null;
  has_more: boolean;
  stats: {
    sent_this_month: number;
    delivery_rate: number | null;
    sms_spend_kes: number;
    opt_outs: number;
  };
}

export function fetchAudiences() {
  return apiGet<{ data: AudienceRow[] }>("/admin/comms/audiences");
}

export function fetchTemplates() {
  return apiGet<{ data: TemplateRow[] }>("/admin/comms/templates");
}

export function createTemplate(input: { label: string; channel: CommsChannel; subject?: string; body: string }) {
  return apiPost<TemplateRow>("/admin/comms/templates", input);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function sendComms(input: {
  audience: AudienceKey;
  merchant_id?: string;
  channel: CommsChannel;
  subject?: string;
  body: string;
  template_id?: string;
}) {
  return apiPost<CommsRun>("/admin/comms/send", input, idem());
}

export function fetchRuns(cursor?: string) {
  return apiGet<CommsRunsResponse>(`/admin/comms/runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}
