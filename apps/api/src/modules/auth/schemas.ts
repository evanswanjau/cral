import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(["customer", "merchant"]),
  accepted_terms_version: z.string(),
  // Optional: onboarding collects these, so sign-up stays email + password.
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

export const OtpRequestSchema = z.object({
  identifier: z.string(),
  purpose: z.enum(["signup", "login", "phone_change", "password_reset"]),
});

export const OtpVerifySchema = z.object({
  identifier: z.string(),
  purpose: z.enum(["signup", "login", "phone_change", "password_reset"]),
  code: z.string().regex(/^[0-9]{6}$/),
  device_id: z.string().optional(),
});

export const LoginSchema = z.object({
  identifier: z.string(),
  password: z.string(),
  device_id: z.string(),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string(),
});

export const LogoutSchema = z.object({
  all_devices: z.boolean().optional().default(false),
});

export const ForgotPasswordSchema = z.object({
  identifier: z.string(),
});

// Reset is by emailed link only — the token from that link is the sole
// credential. SMS is reserved for opt-in 2FA challenges.
export const CheckPasswordResetSchema = z.object({
  token: z.string().min(1),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(10),
});

export const ChangePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(10),
});

export const AcceptTermsSchema = z.object({
  version: z.string(),
});

// --- Onboarding phone verification -----------------------------------

export const PhoneVerificationConfirmSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
});

// --- §7 Opt-in SMS two-factor -----------------------------------------

export const Enroll2faSchema = z.object({
  phone: z.string().min(1),
});

export const Verify2faSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
});

/**
 * The post-password step. `code` is either the texted six digits or one of
 * the ten recovery codes, so it can't be pinned to a six-digit pattern.
 */
export const TwoFactorChallengeSchema = z.object({
  challenge_id: z.string().min(1),
  code: z.string().min(6).max(64),
});

export const TwoFactorResendSchema = z.object({
  challenge_id: z.string().min(1),
  channel: z.enum(["sms", "email"]).optional(),
});

export const Disable2faSchema = z.object({
  password: z.string(),
  // Optional — the Settings switch-off asks for the password only. A
  // texted or recovery code is still honoured when supplied.
  code: z.string().min(6).max(64).optional(),
});
