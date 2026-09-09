import type { AdminRole } from "../../lib/jwt.js";

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  phone: string;
  full_name: string;
  role: AdminRole;
  assigned_queues: string[];
  /** "active" | "disabled" */
  status: string;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminSessionRow {
  id: string;
  admin_user_id: string;
  device_id: string;
  user_agent: string | null;
  ip: string | null;
  token_hash: string;
  previous_token_hash: string | null;
  /** Absolute cap — now + 8h at creation, never extended. */
  expires_at: Date;
  /** Bumped every authenticated request; the 20-minute idle window is measured against this. */
  last_seen_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminLoginChallengeRow {
  id: string;
  admin_user_id: string;
  token_hash: string;
  code_hash: string;
  device_id: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
