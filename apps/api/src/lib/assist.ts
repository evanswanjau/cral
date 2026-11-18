import { ApiError } from "@cral/types";

/**
 * Assist sessions (Phase 3, PR AG3; `docs/plans/trucks-and-sales-agents.md`
 * B3). A sales agent fills in onboarding for the owner with an assist
 * token. This file is the main safety control: the routes that token may
 * reach, and the onboarding fields it may never write.
 *
 * Narrower than B3's sketch on purpose. B3 listed `/merchant/vehicles*`,
 * `/merchant/drivers*` and `/auth/phone/verification/*` too; the wizard
 * calls none of the first two, and the phone must already be verified by
 * the owner before an assist can start (the consent code goes to it), so
 * none of them is needed. Anything not named here is `403 assist_scope`.
 */
export const ASSIST_TTL_SECONDS = 60 * 60;
export const ASSIST_CODE_TTL_SECONDS = 10 * 60;
export const ASSIST_CODE_MAX_ATTEMPTS = 5;

/** `METHOD route-pattern`, exactly as Express registered it (`req.route.path`). */
export const ASSIST_ALLOWED_ROUTES: ReadonlySet<string> = new Set([
  "GET /merchant/onboarding",
  "PATCH /merchant/onboarding",
  "POST /merchant/onboarding/vehicles",
  "PATCH /merchant/onboarding/vehicles/:vehicleId",
  "DELETE /merchant/onboarding/vehicles/:vehicleId",
  "POST /merchant/onboarding/documents",
  // Only a document this agent uploaded (the service 404s any other).
  "GET /merchant/onboarding/documents/:documentId",
  "DELETE /merchant/onboarding/documents/:documentId",
  "POST /merchant/onboarding/assist/end",
]);

/**
 * `PATCH /merchant/onboarding` keys an assist may not send: the payout
 * number and account, and the merchant terms. They are the owner's own
 * acts, like the submission itself; an agent setting where the money goes
 * is exactly the fraud this keeps out.
 */
export const ASSIST_FORBIDDEN_PATCH_KEYS: readonly string[] = [
  "phone",
  "payout_same",
  "payout_method",
  "payout_detail",
  "bank_name",
  "bank_branch",
  "bank_account_name",
  "bank_account_number",
  "terms_accepted",
];

export function assistRouteKey(method: string, routePath: string | undefined): string | null {
  return routePath ? `${method.toUpperCase()} ${routePath}` : null;
}

export function isAssistAllowed(method: string, routePath: string | undefined): boolean {
  const key = assistRouteKey(method, routePath);
  return key !== null && ASSIST_ALLOWED_ROUTES.has(key);
}

export function assistScopeError(field?: string): ApiError {
  return new ApiError({
    status: 403,
    type: "auth_error",
    code: "assist_scope",
    message: field
      ? "An agent can't change this for the owner. The owner sets it themselves."
      : "An assist session only reaches onboarding.",
    ...(field ? { field } : {}),
  });
}

export function onboardingSubmittedError(): ApiError {
  return new ApiError({
    status: 409,
    type: "conflict",
    code: "onboarding_submitted",
    message: "This account has been sent for review, so the assist session has ended.",
  });
}
