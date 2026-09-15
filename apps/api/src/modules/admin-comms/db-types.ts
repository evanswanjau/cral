export type CommsChannel = "sms" | "email" | "both";
export type AudienceKey = "all" | "verified" | "pending" | "companies" | "expiring" | "single";

export interface CommsTemplateRow {
  id: string;
  label: string;
  channel: CommsChannel;
  subject: string | null;
  body: string;
  created_by: string | null;
  use_count: number;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CommsRunRow {
  id: string;
  audience_key: AudienceKey;
  channel: CommsChannel;
  subject: string | null;
  body: string;
  template_id: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sending" | "done";
  sent_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

/** One resolved recipient — enough for the bulk-send job to reach them. */
export interface CommsRecipient {
  merchantId: string;
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
}
