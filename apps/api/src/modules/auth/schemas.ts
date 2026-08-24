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

export const CheckPasswordResetSchema = z
  .object({
    token: z.string().optional(),
    phone: z.string().optional(),
    code: z
      .string()
      .regex(/^[0-9]{6}$/)
      .optional(),
  })
  .refine((v) => v.token ?? (v.phone && v.code), {
    message: "Provide either a token, or both phone and code.",
  });

export const ResetPasswordSchema = z
  .object({
    token: z.string().optional(),
    phone: z.string().optional(),
    code: z
      .string()
      .regex(/^[0-9]{6}$/)
      .optional(),
    new_password: z.string().min(10),
  })
  .refine((v) => v.token ?? (v.phone && v.code), {
    message: "Provide either a token, or both phone and code.",
  });

export const ChangePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(10),
});

export const AcceptTermsSchema = z.object({
  version: z.string(),
});
