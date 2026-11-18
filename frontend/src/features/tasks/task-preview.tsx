'use client';

import { ArrowRight, Check, Hand, Plus, Trash2, TriangleAlert, UserMinus, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  InlineDate,
  InlineMultiSelect,
  InlineSelect,
  InlineText,
  InlineTextarea,
} from '@/components/inline-edit/inline-edit';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  approveTaskRequest,
  cancelTaskRequest,
  createTaskLabel,
  declineTaskRequest,
  deleteTask,
  patchTask,
  requestTask,
  unassignTask,
} from '@/server/tasks/actions';
import {
  EXTERNAL_ASSIGNEE,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPatch,
  type TaskPriority,
  type TaskStatus,
} from './schemas';
import { LabelChip, PriorityBadge, TaskStatusBadge } from './task-badges';
import { AssigneeName } from './task-card';
import { nextColor } from './task-form';
import { assigneeUserId, isDueAfterEvent, isOverdue } from './task-rules';
import { useActionFeedback, useTasksContext, type ShownTask } from './tasks-context';

/** Saves one inline edit; resolves to whether it worked (a failure shows a toast). */
function usePatchTask(task: ShownTask) {
  const t = useTranslations();
  const router = useRouter();
  const { executeAsync } = useAction(patchTask.bind(null, task.eventId, task.id));
  return async (patch: TaskPatch): Promise<boolean> => {
    const result = await executeAsync(patch);
    if (!result || result.serverError || result.validationErrors) {
      toast.error(t(result?.serverError?.message ?? 'common.checkFields'));
      return false;
    }
    router.refresh();
    return true;
  };
}

/**
 * One task, edited in place: click a value and it becomes its input. Managers change every field
 * (not the creator); the assignee changes the status. Below: requests, taking yourself off the
 * task, asking for it, and deleting it.
 */
export function TaskPreview({ task, onDeleted }: { task: ShownTask; onDeleted: () => void }) {
  const t = useTranslations();
  const { labels, today, userId, readOnly, mode, canManage, event } = useTasksContext();
  const patch = usePatchTask(task);
  const overdue = isOverdue(task, today);
  const mine = assigneeUserId(task) === userId;
  const canEdit = canManage && !readOnly;
  const eventEndsAt = event?.endsAt ?? task.event?.endsAt;
  const labelById = new Map(labels.map((label) => [label.id, label]));

  return (
    <div className="flex flex-col gap-6">
      <InlineText
        label={t('taskForm.title')}
        value={task.title}
        onSave={(title) => patch({ title })}
        editable={canEdit}
        required
        maxLength={200}
        className="text-xl font-bold"
      />

      <dl className="grid gap-2 text-sm">
        <Detail label={t('taskForm.status')}>
          <span className="flex items-center gap-2">
            <InlineSelect<TaskStatus>
              label={t('taskForm.status')}
              value={task.status}
              onSave={(status) => patch({ status })}
              editable={!readOnly && (canManage || mine)}
              options={TASK_STATUSES.map((value) => ({
                value,
                label: t(`taskStatus.${value}`),
              }))}
              render={(value) => <TaskStatusBadge status={value} overdue={false} />}
              className="w-auto flex-1"
            />
            {overdue && <Badge variant="bad">{t('tasks.overdue')}</Badge>}
          </span>
        </Detail>
        <Detail label={t('taskForm.priority')}>
          <InlineSelect<TaskPriority>
            label={t('taskForm.priority')}
            value={task.priority}
            onSave={(priority) => patch({ priority })}
            editable={canEdit}
            options={TASK_PRIORITIES.map((value) => ({
              value,
              label: t(`taskPriority.${value}`),
            }))}
            render={(value) => <PriorityBadge priority={value} />}
          />
        </Detail>
        <Detail label={t('taskForm.labels')}>
          <InlineMultiSelect
            label={t('taskForm.labels')}
            value={task.labelIds}
            onSave={(labelIds) => patch({ labelIds })}
            editable={canEdit}
            placeholder={t('tasks.noLabels')}
            options={labels.map((label) => ({
              value: label.id,
              label: <LabelChip label={label} />,
            }))}
            render={(ids) => (
              <span className="flex flex-wrap gap-1.5">
                {ids.map((id) => {
                  const label = labelById.get(id);
                  return label && <LabelChip key={id} label={label} />;
                })}
              </span>
            )}
            footer={
              event ? (select) => <NewLabel eventId={event.id} onCreated={select} /> : undefined
            }
          />
        </Detail>
        <Detail label={t('taskForm.dueDate')}>
          <InlineDate
            label={t('taskForm.dueDate')}
            value={task.dueDate}
            onSave={(dueDate) => patch({ dueDate })}
            editable={canEdit}
            placeholder={t('tasks.noDueDate')}
            format={(day) => (
              <span className={cn(overdue && 'font-bold text-status-bad')}>{formatDay(day)}</span>
            )}
          />
          {task.dueDate && eventEndsAt && isDueAfterEvent(task.dueDate, eventEndsAt) && (
            <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-status-warn">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {t('taskForm.dueAfterEvent')}
            </span>
          )}
        </Detail>
        <Detail label={t('taskForm.assignee')}>
          <AssigneeField task={task} editable={canEdit} onSave={patch} />
        </Detail>
        {mode === 'mine' && task.event && (
          <Detail label={t('tasks.event')}>
            <Link
              href={`/events/${task.event.id}/tasks`}
              className="inline-flex items-center gap-1 font-bold text-primary underline-offset-4 hover:underline"
            >
              {task.event.name}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Detail>
        )}
        <Detail label={t('tasks.createdBy')}>
          <span className="inline-flex items-center gap-1">
            {task.createdBy.userId === userId ? t('tasks.you') : task.createdBy.name}
            {!task.createdBy.active && <Badge variant="secondary">{t('tasks.inactive')}</Badge>}
          </span>
        </Detail>
      </dl>

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-muted-foreground">{t('taskForm.description')}</h3>
        <InlineTextarea
          label={t('taskForm.description')}
          value={task.description ?? ''}
          onSave={(description) => patch({ description: description || null })}
          editable={canEdit}
          placeholder={canEdit ? t('tasks.addDescription') : t('tasks.noDescription')}
          maxLength={5000}
        />
      </section>

      {!readOnly && <PreviewActions task={task} mine={mine} onDeleted={onDeleted} />}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2">
      <dt className="py-2 font-bold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-semibold">{children}</dd>
    </div>
  );
}

/**
 * The assignee as a menu of members, plus "nobody" and "someone without an account" (which
 * turns the field into a name input). Choosing nobody asks for confirmation first.
 */
function AssigneeField({
  task,
  editable,
  onSave,
}: {
  task: ShownTask;
  editable: boolean;
  onSave: (patch: TaskPatch) => Promise<boolean>;
}) {
  const t = useTranslations();
  const { members, userId } = useTasksContext();
  const [typingName, setTypingName] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { assignee } = task;
  const mine = assigneeUserId(task) === userId;

  if (typingName) {
    return (
      <InlineText
        label={t('taskForm.assigneeName')}
        value={assignee?.type === 'external' ? assignee.name : ''}
        placeholder={t('taskForm.assigneeNamePlaceholder')}
        maxLength={200}
        required
        startEditing
        onDone={() => setTypingName(false)}
        onSave={(name) => onSave({ assigneeName: name })}
      />
    );
  }

  // A typed-in name gets its own value, so choosing "someone without an account" again still
  // opens the name for editing instead of counting as "no change".
  const current =
    assignee === null
      ? ''
      : assignee.type === 'member'
        ? assignee.userId
        : `${EXTERNAL_ASSIGNEE}:current`;
  // Someone who left stays selectable on their (done) task, so the menu can show them.
  const inactive =
    assignee?.type === 'member' && !members.some((m) => m.userId === assignee.userId)
      ? { value: assignee.userId, label: `${assignee.name} (${t('tasks.inactive')})` }
      : null;
  const options = [
    { value: '', label: t('taskForm.nobody') },
    ...members.map((member) => ({ value: member.userId, label: member.name })),
    ...(inactive ? [inactive] : []),
    { value: EXTERNAL_ASSIGNEE, label: t('taskForm.external') },
  ];

  return (
    <>
      <InlineSelect<string>
        label={t('taskForm.assignee')}
        value={current}
        editable={editable}
        options={options}
        render={() => <AssigneeName assignee={assignee} isMe={mine} />}
        onSave={async (value) => {
          if (value === EXTERNAL_ASSIGNEE) {
            setTypingName(true);
            return false;
          }
          if (value === '') {
            setConfirming(true);
            return false;
          }
          return onSave({ assigneeUserId: value });
        }}
      />
      <ConfirmUnassign task={task} mine={mine} open={confirming} onOpenChange={setConfirming} />
    </>
  );
}

function PreviewActions({
  task,
  mine,
  onDeleted,
}: {
  task: ShownTask;
  mine: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations();
  const { canManage, userId } = useTasksContext();
  const feedback = useActionFeedback();
  const { eventId } = task;
  const request = useAction(requestTask.bind(null, eventId, task.id), feedback);
  const cancel = useAction(cancelTaskRequest.bind(null, eventId, task.id), feedback);
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);
  const myRequest = task.pendingRequests.find((r) => r.userId === userId);
  const busy = request.isPending || cancel.isPending;
  const showRequests = canManage && task.pendingRequests.length > 0;
  const canRequest = !canManage && task.assignee === null && !myRequest;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5">
      {showRequests && (
        <section className="flex flex-col gap-2 rounded-2xl bg-brand-tint p-3">
          <h3 className="text-sm font-bold">{t('tasks.requests')}</h3>
          <ul className="flex flex-col gap-1.5">
            {task.pendingRequests.map((r) => (
              <RequestRow
                key={r.id}
                eventId={eventId}
                taskId={task.id}
                requestId={r.id}
                name={r.name}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {mine && (
          <>
            <Button variant="secondary" onClick={() => setConfirmingUnassign(true)}>
              <UserMinus data-icon="inline-start" aria-hidden />
              {t('tasks.unassignSelf')}
            </Button>
            <ConfirmUnassign
              task={task}
              mine
              open={confirmingUnassign}
              onOpenChange={setConfirmingUnassign}
            />
          </>
        )}
        {canRequest && (
          <Button variant="secondary" disabled={busy} onClick={() => request.execute()}>
            <Hand data-icon="inline-start" aria-hidden />
            {t('tasks.request')}
          </Button>
        )}
        {myRequest && (
          <>
            <Badge variant="brand" className="h-11 px-4">
              {t('tasks.requestPending')}
            </Badge>
            <Button variant="ghost" disabled={busy} onClick={() => cancel.execute()}>
              {t('tasks.cancelRequest')}
            </Button>
          </>
        )}
        {canManage && <DeleteTask task={task} onDeleted={onDeleted} />}
      </div>
    </div>
  );
}

/**
 * Removing an assignment means someone has to be found again, so it asks first. The assignee
 * taking themselves off gets other wording than a manager removing someone.
 */
function ConfirmUnassign({
  task,
  mine,
  open,
  onOpenChange,
}: {
  task: ShownTask;
  mine: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const unassign = useAction(unassignTask.bind(null, task.eventId, task.id), {
    onError: feedback.onError,
    onSuccess: () => {
      onOpenChange(false);
      feedback.onSuccess();
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mine ? t('tasks.unassignSelfTitle') : t('tasks.unassignTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mine
              ? t('tasks.unassignSelfWarning', { title: task.title })
              : t('tasks.unassignWarning', { name: task.assignee?.name ?? '', title: task.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={unassign.isPending}
            onClick={(event) => {
              // Keep the dialog open until the server answers.
              event.preventDefault();
              unassign.execute();
            }}
          >
            {mine ? t('tasks.unassignSelfConfirm') : t('tasks.unassignConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteTask({ task, onDeleted }: { task: ShownTask; onDeleted: () => void }) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const remove = useAction(deleteTask.bind(null, task.eventId, task.id), {
    onError: feedback.onError,
    onSuccess: () => {
      setOpen(false);
      onDeleted();
      feedback.onSuccess();
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" className="ml-auto" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" aria-hidden />
        {t('tasks.delete')}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('tasks.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('tasks.deleteWarning', { title: task.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.execute();
            }}
          >
            {t('tasks.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Under the label options: make a new label and select it. */
function NewLabel({ eventId, onCreated }: { eventId: string; onCreated: (id: string) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const { labels } = useTasksContext();
  const [name, setName] = useState('');
  const create = useAction(createTaskLabel.bind(null, eventId), {
    onSuccess: ({ data }) => {
      if (!data) return;
      onCreated(data.id);
      setName('');
      router.refresh();
    },
    onError: ({ error }) => toast.error(t(error.serverError?.message ?? 'common.genericError')),
  });
  const add = () => {
    if (name.trim()) create.execute({ name, color: nextColor(labels.length) });
  };
  return (
    <div className="flex gap-1.5 border-t border-border pt-2">
      <Input
        aria-label={t('taskLabels.newLabel')}
        placeholder={t('taskLabels.newLabelPlaceholder')}
        value={name}
        maxLength={50}
        className="h-9"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        aria-label={t('taskLabels.add')}
        disabled={!name.trim() || create.isPending}
        onClick={add}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}

function RequestRow({
  eventId,
  taskId,
  requestId,
  name,
}: {
  eventId: string;
  taskId: string;
  requestId: string;
  name: string;
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const approve = useAction(approveTaskRequest.bind(null, eventId, taskId, requestId), feedback);
  const decline = useAction(declineTaskRequest.bind(null, eventId, taskId, requestId), feedback);
  const busy = approve.isPending || decline.isPending;
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate font-semibold">{t('tasks.requestedBy', { name })}</span>
      <span className="flex shrink-0 gap-1">
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('tasks.approveRequest', { name })}
          title={t('tasks.approveRequest', { name })}
          disabled={busy}
          onClick={() => approve.execute()}
        >
          <Check aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('tasks.declineRequest', { name })}
          title={t('tasks.declineRequest', { name })}
          disabled={busy}
          onClick={() => decline.execute()}
        >
          <X aria-hidden />
        </Button>
      </span>
    </li>
  );
}
