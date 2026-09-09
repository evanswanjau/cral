import { z } from "zod";

/**
 * `device_id` is optional here — spec §8's login body is `{ email,
 * password }` only. When absent the service mints one so `admin_sessions`
 * still has a stable per-device key; a client that wants its sessions list
 * to read well passes its own.
 */
export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  device_id: z.string().optional(),
});

export const AdminVerifyTwoFactorSchema = z.object({
  challenge_token: z.string().min(1),
  code: z.string().regex(/^[0-9]{6}$/),
});

export const AdminRefreshSchema = z.object({
  refresh_token: z.string().min(1),
});
