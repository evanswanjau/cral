import { z } from "zod";

export const InitiateStkPushSchema = z.object({
  purpose: z.enum(["deposit", "full"]),
  /** The payer's phone, if different from their account phone. E.164 or local format. */
  phone: z.string().min(9).max(15),
});

export type InitiateStkPushInput = z.infer<typeof InitiateStkPushSchema>;
