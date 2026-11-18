import { z } from 'zod';
import { msg } from '@/i18n/keys';
import { ASSIGNABLE_ROLES } from './permissions';

export const inviteSchema = z.object({
  email: z.email(msg('auth.validation.email')),
  role: z.enum(ASSIGNABLE_ROLES),
});
