import { msg, type MessageKey } from '@/i18n/keys';

/** Better Auth error codes of the organization endpoints → a message for the admin. */
const MESSAGES: Record<string, MessageKey> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: msg('members.errors.alreadyMember'),
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: msg('members.errors.lastOwner'),
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: msg('members.errors.lastOwner'),
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: msg('members.errors.notAllowed'),
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: msg('members.errors.notAllowed'),
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: msg('members.errors.notAllowed'),
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: msg('members.errors.notAllowed'),
  YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION: msg('members.errors.notAllowed'),
  // Our own code (backend/src/auth/auth.membership.ts): the invitation was cancelled.
  INVITATION_EMAIL_FAILED: msg('members.errors.emailFailed'),
};

export function memberErrorMessage(error: { code?: string } | null | undefined): MessageKey {
  return (error?.code && MESSAGES[error.code]) || msg('common.genericError');
}
