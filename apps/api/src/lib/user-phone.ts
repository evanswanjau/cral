import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";
import { normalizePhone } from "./identifier.js";
import { isUniqueViolation } from "./pg-errors.js";

/**
 * The one place `users.phone` is written. `users.phone` is the real home
 * for both a merchant's payout number and a renter's contact number (the
 * spec §4 deviation), so the normalisation, the uniqueness mapping and -
 * most importantly - the "a changed number is no longer a verified
 * number" rule all have to be identical on both sides. A second copy of
 * that last rule is how a `phone_verified` flag ends up following a
 * number it was never earned on.
 */
export async function setUserPhone(
  userId: string,
  rawPhone: string,
  conn: Knex | Knex.Transaction = db,
): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "That doesn't look like a valid Kenyan phone number.",
      field: "phone",
    });
  }

  const current = await conn("users").where({ id: userId }).first();
  // Changing the number drops any prior verification — the new one hasn't
  // been proven, and a verified flag must never follow a number it wasn't
  // earned on.
  const update: Record<string, unknown> =
    current?.phone === phone ? { phone } : { phone, phone_verified: false };

  try {
    await conn("users").where({ id: userId }).update(update);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError({
        status: 409,
        type: "conflict",
        code: "phone_taken",
        message: "That phone number is already registered to another account.",
        field: "phone",
      });
    }
    throw err;
  }
}
