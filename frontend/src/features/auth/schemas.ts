import { z } from 'zod';
import { msg } from '@/i18n/keys';

/** Must match `minPasswordLength` in backend/src/auth/auth.ts. */
export const MIN_PASSWORD_LENGTH = 10;

const email = z.email(msg('auth.validation.email'));
const newPassword = z.string().min(MIN_PASSWORD_LENGTH, msg('auth.validation.passwordLength'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, msg('auth.validation.required')),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, msg('auth.validation.required')).max(100),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ newPassword });

export const organizationSchema = z.object({
  name: z.string().trim().min(1, msg('auth.validation.required')).max(100),
});
