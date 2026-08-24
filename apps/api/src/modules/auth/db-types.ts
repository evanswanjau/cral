export interface UserRow {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  password_hash: string;
  roles: string[];
  phone_verified: boolean;
  email_verified: boolean;
  terms_accepted_version: string | null;
  terms_accepted_at: Date | null;
  terms_accepted_ip: string | null;
  failed_login_count: number;
  locked_until: Date | null;
  pin_hash: string | null;
  erasure_requested: boolean;
  erasure_cooling_off_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  device_id: string;
  device_label: string | null;
  ip: string | null;
  user_agent: string | null;
  token_hash: string;
  previous_token_hash: string | null;
  expires_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OtpCodeRow {
  id: string;
  identifier: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
