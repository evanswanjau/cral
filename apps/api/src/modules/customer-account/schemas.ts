import { z } from "zod";

/**
 * The two documents a renter uploads before they can request a booking.
 * `driving_licence` became a real `DocumentKind` in migration
 * `20260910100000`; `national_id` is shared with the merchant side.
 */
export const RENTER_DOC_KINDS = ["national_id", "driving_licence"] as const;
export type RenterDocKind = (typeof RENTER_DOC_KINDS)[number];

/**
 * `expires_at` is required for a driving licence and ignored for an ID:
 * a Kenyan licence carries an expiry a reviewer has to check against, a
 * national ID does not expire. Collected as a field rather than read off
 * the photo - there is no OCR in this product, and a reviewer reading a
 * date out of an image is exactly the kind of guess the fabricated
 * `id_verified` badge taught us not to build on.
 */
export const UploadRenterDocumentSchema = z
  .object({
    kind: z.enum(RENTER_DOC_KINDS),
    expires_at: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "driving_licence" && !value.expires_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "Enter the expiry date shown on your licence.",
      });
    }
  });

export type UploadRenterDocumentInput = z.infer<typeof UploadRenterDocumentSchema>;
