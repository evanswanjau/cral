import { Router, type Request } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "./service.js";
import * as authService from "./service.js";
import {
  AcceptTermsSchema,
  ChangePasswordSchema,
  CheckPasswordResetSchema,
  Disable2faSchema,
  Enroll2faSchema,
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  PhoneVerificationConfirmSchema,
  RefreshTokenSchema,
  RegisterSchema,
  ResetPasswordSchema,
  TwoFactorChallengeSchema,
  Verify2faSchema,
} from "./schemas.js";

export const authRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

// --- §4 Registration and verification --------------------------------

authRouter.post(
  "/auth/register",
  rateLimit({ bucket: "register", limit: 10, windowSeconds: 3600 }),
  validateBody(RegisterSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, ctxOf(req));
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/auth/otp/request",
  rateLimit({ bucket: "otp_request", limit: 5, windowSeconds: 3600 }),
  validateBody(OtpRequestSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.requestOtp(req.body.identifier, req.body.purpose);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/otp/verify",
  rateLimit({ bucket: "otp_verify", limit: 10, windowSeconds: 3600 }),
  validateBody(OtpVerifySchema),
  asyncHandler(async (req, res) => {
    const result = await authService.verifyOtp(
      {
        identifier: req.body.identifier,
        purpose: req.body.purpose,
        code: req.body.code,
        deviceId: req.body.device_id,
      },
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

authRouter.get(
  "/auth/registration-state",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await authService.getRegistrationState(req.auth!.sub);
    res.status(200).json(result);
  }),
);

authRouter.get(
  "/me",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await authService.getMe(req.auth!.sub);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/terms/accept",
  authenticate(),
  validateBody(AcceptTermsSchema),
  asyncHandler(async (req, res) => {
    await authService.acceptTerms(req.auth!.sub, req.body.version, ctxOf(req));
    res.status(204).send();
  }),
);

// --- §5 Login and sessions --------------------------------------------

authRouter.post(
  "/auth/login",
  // Looser than the 10-failure account lockout in the service layer — that's
  // the primary defense; this is just a backstop against outright abuse.
  rateLimit({
    bucket: "login",
    limit: 20,
    windowSeconds: 900,
    keyFn: (req) => req.body?.identifier ?? req.ip ?? "unknown",
  }),
  validateBody(LoginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(
      req.body.identifier,
      req.body.password,
      req.body.device_id,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/token/refresh",
  validateBody(RefreshTokenSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshToken(req.body.refresh_token, ctxOf(req));
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/logout",
  authenticate(),
  validateBody(LogoutSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.auth!.sub, req.auth!.sid, req.body.all_devices);
    res.status(204).send();
  }),
);

authRouter.get(
  "/auth/sessions",
  authenticate(),
  asyncHandler(async (req, res) => {
    const data = await authService.listSessions(req.auth!.sub, req.auth!.sid);
    res.status(200).json({ data, next_cursor: null, has_more: false });
  }),
);

authRouter.delete(
  "/auth/sessions/:id",
  authenticate(),
  asyncHandler(async (req, res) => {
    await authService.revokeSession(req.auth!.sub, req.params.id as string);
    res.status(204).send();
  }),
);

// "Sign out everywhere" — every session but the caller's current one.
authRouter.post(
  "/auth/sessions/revoke-all",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await authService.revokeAllOtherSessions(
      req.auth!.sub,
      req.auth!.sid,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

// --- Onboarding phone verification -----------------------------------
//
// Proves the merchant holds the payout number before onboarding can be
// submitted. Authenticated — it's the number already on the account.

authRouter.post(
  "/auth/phone/verification/start",
  authenticate(),
  // Keyed by user, not IP — every merchant on a shared NAT (or localhost)
  // otherwise fights over one bucket. Each send still costs an SMS, so the
  // cap stays low; the 15-minute window just lets a stuck flow recover.
  rateLimit({
    bucket: "phone_verify_start",
    limit: 5,
    windowSeconds: 900,
    keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown",
  }),
  asyncHandler(async (req, res) => {
    const result = await authService.startPhoneVerification(req.auth!.sub);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/phone/verification/confirm",
  authenticate(),
  rateLimit({
    bucket: "phone_verify_confirm",
    limit: 15,
    windowSeconds: 900,
    keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown",
  }),
  validateBody(PhoneVerificationConfirmSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.confirmPhoneVerification(
      req.auth!.sub,
      req.body.code,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

// --- §7 Opt-in SMS two-factor ------------------------------------------
//
// The only SMS an established account ever receives. Enrolment is two
// steps (choose a handset, prove you hold it); after that every password
// login raises a challenge that /auth/2fa/challenge answers.

authRouter.get(
  "/auth/2fa",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await authService.getTwoFactorState(req.auth!.sub);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/2fa/enroll",
  authenticate(),
  rateLimit({ bucket: "two_factor_enroll", limit: 5, windowSeconds: 3600 }),
  validateBody(Enroll2faSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.enroll2fa(req.auth!.sub, req.body.phone);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/2fa/verify",
  authenticate(),
  rateLimit({ bucket: "two_factor_verify", limit: 10, windowSeconds: 3600 }),
  validateBody(Verify2faSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.verify2fa(req.auth!.sub, req.body.code, ctxOf(req));
    res.status(200).json(result);
  }),
);

// Unauthenticated on purpose — the caller has passed a password but has no
// token yet. The challenge id is the only thing that identifies them.
authRouter.post(
  "/auth/2fa/challenge",
  rateLimit({
    bucket: "two_factor_challenge",
    limit: 10,
    windowSeconds: 900,
    keyFn: (req) => req.body?.challenge_id ?? req.ip ?? "unknown",
  }),
  validateBody(TwoFactorChallengeSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.completeTwoFactorChallenge(
      req.body.challenge_id,
      req.body.code,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

// Raises a fresh challenge for someone already signed in, so they can
// satisfy the code half of DELETE /auth/2fa.
authRouter.post(
  "/auth/2fa/challenge/send",
  authenticate(),
  rateLimit({ bucket: "two_factor_reauth", limit: 5, windowSeconds: 3600 }),
  asyncHandler(async (req, res) => {
    const result = await authService.sendTwoFactorChallenge(req.auth!.sub);
    res.status(200).json(result);
  }),
);

authRouter.delete(
  "/auth/2fa",
  authenticate(),
  validateBody(Disable2faSchema),
  asyncHandler(async (req, res) => {
    await authService.disable2fa(req.auth!.sub, req.body.password, req.body.code, ctxOf(req));
    res.status(204).send();
  }),
);

// --- §6 Forgot and reset password --------------------------------------

authRouter.post(
  "/auth/password/forgot",
  rateLimit({
    bucket: "password_forgot",
    limit: 3,
    windowSeconds: 3600,
    keyFn: (req) => req.body?.identifier ?? req.ip ?? "unknown",
  }),
  validateBody(ForgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(req.body.identifier);
    res.status(202).json(result);
  }),
);

authRouter.post(
  "/auth/password/reset/check",
  validateBody(CheckPasswordResetSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.checkPasswordReset(req.body);
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/password/reset",
  rateLimit({ bucket: "password_reset", limit: 10, windowSeconds: 3600 }),
  validateBody(ResetPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body, ctxOf(req));
    res.status(200).json(result);
  }),
);

authRouter.post(
  "/auth/password/change",
  authenticate(),
  validateBody(ChangePasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword(
      req.auth!.sub,
      req.auth!.sid,
      req.body.current_password,
      req.body.new_password,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

authRouter.get("/auth/password/policy", (_req, res) => {
  res.status(200).json(authService.getPasswordPolicy());
});

// --- Fallback for the admin-exception endpoint (Phase 3 builds the rest of admin) ---

authRouter.post("/admin/team/:id/reset-invite", authenticate(), (_req, _res, next) => {
  next(
    new ApiError({
      status: 501,
      type: "server_error",
      code: "not_implemented",
      message: "Admin team management ships in Phase 3.",
    }),
  );
});
