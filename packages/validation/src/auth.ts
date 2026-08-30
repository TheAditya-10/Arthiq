import { z } from "zod";

// Deliberately generous but sane bounds — see docs/SECURITY.md. Password
// strength beyond a length floor is not enforced further in V1 (no fake
// "strength meter" theatre); scrypt cost + rate limiting on /auth/login do
// the actual work of making credential stuffing/guessing impractical.
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
