import { authErrorKey } from '@/features/auth/auth-errors';

/** Maps a Better Auth error from the account settings to a translation key. */
export function accountErrorKey(error: { status?: number; code?: string }) {
  switch (error.code) {
    case 'INVALID_PASSWORD':
      return 'settings.account.wrongPassword' as const;
    case 'EMAIL_ALREADY_VERIFIED':
      return 'settings.account.alreadyVerified' as const;
    case 'UNAUTHORIZED':
      return 'common.sessionExpired' as const;
    default:
      return authErrorKey(error) ?? ('common.genericError' as const);
  }
}
