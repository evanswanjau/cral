import { apiGet, apiPatch, apiPost } from "./api.js";
import type { AdminRole } from "./auth-api.js";

export interface AdminRow {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  role: AdminRole;
  assigned_queues: string[];
  status: "active" | "disabled";
  last_login_at: string | null;
  created_at: string;
}

export interface TeamResponse {
  data: AdminRow[];
  next_cursor: string | null;
  has_more: boolean;
}

export function fetchTeam(cursor?: string) {
  return apiGet<TeamResponse>(`/admin/team${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function createTeamMember(input: {
  email: string;
  phone: string;
  full_name: string;
  role: AdminRole;
  queues: string[];
}) {
  return apiPost<{ admin: AdminRow; password: string }>("/admin/team", input, idem());
}

export function updateTeamMember(id: string, input: { role: AdminRole; queues: string[] }) {
  return apiPatch<AdminRow>(`/admin/team/${id}`, input);
}

export function deactivateTeamMember(id: string) {
  return apiPost<AdminRow>(`/admin/team/${id}/deactivate`, undefined, idem());
}

export function reactivateTeamMember(id: string) {
  return apiPost<AdminRow>(`/admin/team/${id}/reactivate`, undefined, idem());
}

export function resetTeamMemberPassword(id: string) {
  return apiPost<{ password: string }>(`/admin/team/${id}/reset-invite`, undefined, idem());
}
