import { z } from "zod";

export const AddMerchantSchema = z.object({
  owner_type: z.enum(["individual", "company"]),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().min(1).max(30),
});
export type AddMerchantInput = z.infer<typeof AddMerchantSchema>;

export const ListAgentMerchantsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
