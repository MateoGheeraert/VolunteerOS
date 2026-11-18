'use client';

import { TriangleAlert, UserMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OpenTaskCount } from '@/api/generated/types.gen';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { authClient } from '@/lib/auth-client';
import type { OrgRole } from '@/server/auth';
import { getOpenTaskCounts } from '@/server/tasks/actions';
import { memberErrorMessage } from './member-errors';
import { ASSIGNABLE_ROLES, type AssignableRole } from './permissions';

/**
 * Role picker and remove button for one member. Removing takes two clicks, and so does taking
 * away your own admin rights: both are hard to undo yourself. Before removing, it warns about the
 * member's unfinished tasks, which become unassigned.
 */
export function MemberActions({
  memberId,
  userId,
  name,
  role,
  isSelf,
}: {
  memberId: string;
  userId: string;
  name: string;
  role: OrgRole;
  isSelf: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [pendingSelfRole, setPendingSelfRole] = useState<AssignableRole | null>(null);
  const [openTasks, setOpenTasks] = useState<OpenTaskCount[]>([]);

  async function changeRole(newRole: AssignableRole) {
    setBusy(true);
    const { error } = await authClient.organization.updateMemberRole({ memberId, role: newRole });
    setBusy(false);
    setPendingSelfRole(null);
    if (error) {
      toast.error(t(memberErrorMessage(error)));
      return;
    }
    toast.success(t('members.roleChanged', { name, role: t(`members.roles.${newRole}`) }));
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    setBusy(false);
    setConfirmingRemove(false);
    if (error) {
      toast.error(t(memberErrorMessage(error)));
      return;
    }
    toast.success(t('members.removed', { name }));
    router.refresh();
  }

  function onRoleSelected(value: string) {
    const newRole = value as AssignableRole;
    if (newRole === role) return;
    if (isSelf && newRole === 'member') {
      setPendingSelfRole(newRole);
      return;
    }
    void changeRole(newRole);
  }

  if (pendingSelfRole) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-status-warn">
          {t('members.selfDemoteWarning')}
        </span>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void changeRole(pendingSelfRole)}
          disabled={busy}
        >
          {t('members.confirmRole')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPendingSelfRole(null)} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  async function startRemove() {
    setBusy(true);
    const result = await getOpenTaskCounts(userId);
    setBusy(false);
    // Without the counts, still allow removing: the backend releases the tasks either way.
    setOpenTasks(result?.data ?? []);
    setConfirmingRemove(true);
  }

  if (confirmingRemove) {
    const total = openTasks.reduce((sum, event) => sum + event.openTasks, 0);
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        {total > 0 && (
          <div
            role="alert"
            className="flex max-w-md items-start gap-2 rounded-xl bg-status-warn-bg px-3 py-2 text-sm font-semibold text-status-warn"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t('members.openTasksWarning', { name, count: total })}{' '}
              {openTasks.map((event) => `${event.eventName} (${event.openTasks})`).join(', ')}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="destructive" onClick={() => void remove()} disabled={busy}>
            {t('members.removeConfirm', { name })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmingRemove(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-40">
        <NativeSelect
          aria-label={t('members.roleOf', { name })}
          value={role}
          disabled={busy}
          onChange={(event) => onRoleSelected(event.target.value)}
        >
          {role === 'owner' && (
            <option value="owner" disabled>
              {t('members.roles.owner')}
            </option>
          )}
          {ASSIGNABLE_ROLES.map((option) => (
            <option key={option} value={option}>
              {t(`members.roles.${option}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={t('members.remove')}
        title={t('members.remove')}
        onClick={() => void startRemove()}
        disabled={busy}
      >
        <UserMinus aria-hidden />
      </Button>
    </div>
  );
}
