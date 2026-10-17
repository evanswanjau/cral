import { z } from "zod";

export const InitiateStkPushSchema = z.object({
  // `deposit` is suspended (owner's call, 2026-10-17): CRAL collects the
  // hire only, so a renter can't be prompted for a separate deposit.
  // `payment_requests.purpose` keeps both values for rows already written.
  purpose: z.enum(["full"]),
  /** The payer's phone, if different from their account phone. E.164 or local format. */
  phone: z.string().min(9).max(15),
});

export type InitiateStkPushInput = z.infer<typeof InitiateStkPushSchema>;
