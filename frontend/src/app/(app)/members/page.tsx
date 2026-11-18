import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InvitationActions } from '@/features/members/invitation-actions';
import { InviteMemberForm } from '@/features/members/invite-member-form';
import { MemberActions } from '@/features/members/member-actions';
import { canManageMember, isExpired, isOrgAdmin } from '@/features/members/permissions';
import { formatDate } from '@/lib/format';
import { initials } from '@/lib/initials';
import {
  getActiveMember,
  listMembers,
  listPendingInvitations,
  requireActiveOrganization,
  type OrganizationInvitation,
  type OrganizationMember,
} from '@/server/auth';

export const metadata: Metadata = { title: 'Leden' };

export default function MembersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-4xl rounded-3xl bg-card" />}>
      <Members />
    </Suspense>
  );
}

/**
 * Every member sees who is in the organization. Admins (and owners) also get the controls and the
 * pending invitations; Better Auth enforces the same rules on every call.
 */
async function Members() {
  const [{ organization }, me, members, t] = await Promise.all([
    requireActiveOrganization(),
    getActiveMember(),
    listMembers(),
    getTranslations(),
  ]);
  const admin = isOrgAdmin(me.role);
  const invitations = admin ? await listPendingInvitations() : [];
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const byName = (a: OrganizationMember, b: OrganizationMember) =>
    a.user.name.localeCompare(b.user.name, 'nl');

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={t('members.title')}
        description={t('members.description', { organization: organization.name })}
      />

      {admin && (
        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">{t('members.invite.title')}</h2>
            <p className="text-muted-foreground">{t('members.invite.body')}</p>
          </div>
          <InviteMemberForm />
        </section>
      )}

      <section className="rounded-3xl bg-card p-2 shadow-soft sm:p-3">
        <ul className="divide-y divide-border">
          {[...members].sort(byName).map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-brand-tint font-bold text-primary">
                    {initials(member.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {member.user.name}
                    {member.id === me.id && (
                      <span className="font-semibold text-muted-foreground">
                        {' '}
                        ({t('members.you')})
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.user.email} ·{' '}
                    {t('members.joined', { date: formatDate(member.createdAt) })}
                  </p>
                </div>
              </div>
              {canManageMember(me, member, ownerCount) ? (
                <MemberActions
                  memberId={member.id}
                  name={member.user.name}
                  role={member.role}
                  isSelf={member.id === me.id}
                />
              ) : (
                <Badge variant={member.role === 'member' ? 'outline' : 'brand'}>
                  {t(`members.roles.${member.role}`)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>

      {admin && (
        <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-soft sm:p-6">
          <h2 className="text-lg">{t('members.invitations.title')}</h2>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">{t('members.invitations.empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {invitations.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

async function InvitationRow({ invitation }: { invitation: OrganizationInvitation }) {
  const t = await getTranslations();
  const expired = isExpired(invitation);
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-bold">{invitation.email}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t(`members.roles.${invitation.role}`)}</span>
          <span aria-hidden>·</span>
          {expired ? (
            <Badge variant="warn">{t('members.invitations.expired')}</Badge>
          ) : (
            <span>
              {t('members.invitations.expiresOn', { date: formatDate(invitation.expiresAt) })}
            </span>
          )}
        </div>
      </div>
      <InvitationActions
        invitationId={invitation.id}
        email={invitation.email}
        role={invitation.role}
      />
    </li>
  );
}
