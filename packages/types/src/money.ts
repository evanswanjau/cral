import { z } from "zod";

/**
 * Money per spec §2: always an integer of the currency's smallest unit
 * ("cents") plus an ISO 4217 code. Never a float, never a formatted string.
 * Display formatting is the client's job.
 */
export const MoneySchema = z.object({
  amount: z.number().int(),
  currency: z.string().length(3).default("KES"),
});

export type Money = z.infer<typeof MoneySchema>;

export function kes(amountInCents: number): Money {
  return { amount: amountInCents, currency: "KES" };
}
