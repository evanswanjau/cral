import { z } from "zod";

export const ADMIN_ROLES = ["admin_reviewer", "admin_finance", "admin_support", "admin_super"] as const;

export const CreateAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1),
  full_name: z.string().trim().min(1).max(200),
  role: z.enum(ADMIN_ROLES),
  queues: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const UpdateAdminSchema = z.object({
  role: z.enum(ADMIN_ROLES),
  queues: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const ListAdminsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
