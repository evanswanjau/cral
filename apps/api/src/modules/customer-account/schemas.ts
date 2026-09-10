import { z } from "zod";

/**
 * The two documents a renter uploads before they can request a booking.
 * `driving_licence` became a real `DocumentKind` in migration
 * `20260910100000`; `national_id` is shared with the merchant side.
 */
export const RENTER_DOC_KINDS = ["national_id", "driving_licence"] as const;
export type RenterDocKind = (typeof RENTER_DOC_KINDS)[number];

export const UploadRenterDocumentSchema = z.object({
  kind: z.enum(RENTER_DOC_KINDS),
});

export type UploadRenterDocumentInput = z.infer<typeof UploadRenterDocumentSchema>;
