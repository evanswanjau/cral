import { z } from "zod";

export const CHANNELS = ["sms", "email", "both"] as const;
export const AUDIENCE_KEYS = ["all", "verified", "pending", "companies", "expiring", "single"] as const;

export const CreateTemplateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  channel: z.enum(CHANNELS),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1),
});

export const SendCommsSchema = z.object({
  audience: z.enum(AUDIENCE_KEYS),
  merchant_id: z.string().trim().min(1).optional(),
  channel: z.enum(CHANNELS),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1),
  template_id: z.string().trim().min(1).optional(),
});

export const ListRunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
