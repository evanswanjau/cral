import { ApiError } from "@cral/types";

/** node-pg surfaces a unique-constraint breach as SQLSTATE 23505. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  if (!e || e.code !== "23505") return false;
  return constraint === undefined || e.constraint === constraint;
}

export const REGISTRATION_UNIQUE_INDEX = "vehicles_registration_norm_unique";

/**
 * Rethrows a plate-uniqueness breach as the shared error envelope, or
 * re-throws anything else untouched. Registration is globally unique
 * (across every merchant), so a collision here means the plate is already
 * listed on the platform by someone.
 */
export function rethrowRegistrationConflict(err: unknown): never {
  if (isUniqueViolation(err, REGISTRATION_UNIQUE_INDEX)) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "registration_taken",
      message: "That registration is already listed on CRAL.",
      field: "registration",
    });
  }
  throw err;
}
