/** Maps a Better Auth client error to a key under `auth.` / `common.` in messages/nl.json. */
export function authErrorKey(error: { status?: number; code?: string } | null | undefined) {
  if (!error) return null;
  if (error.status === 429) return 'auth.tooManyAttempts' as const;
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'auth.invalidCredentials' as const;
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'auth.emailTaken' as const;
    case 'INVALID_TOKEN':
      return 'auth.resetInvalid' as const;
    case 'PASSWORD_TOO_SHORT':
      return 'auth.validation.passwordLength' as const;
    default:
      return 'common.genericError' as const;
  }
}
