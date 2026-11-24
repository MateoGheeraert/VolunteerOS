'use client';

import { ArrowRight, Check, Hand, Trash2, UserMinus, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
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
import { ModalActions, useOutsideSave } from '@/components/layout/modal-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { LabelChip } from '@/features/labels/label-chip';
import { AttachedFiles } from '@/features/uploads/attached-files';
import { formatDay } from '@/lib/format';
import {
  approveTaskRequest,
  cancelTaskRequest,
  changeTaskStatus,
  declineTaskRequest,
  deleteTask,
  requestTask,
  unassignTask,
  updateTask,
} from '@/server/tasks/actions';
import { TASK_STATUSES, taskToForm, type TaskStatus } from './schemas';
import { PriorityBadge, TaskStatusBadge } from './task-badges';
import { AssigneeName } from './task-card';
import { TaskForm } from './task-form';
import { assigneeUserId, isOverdue } from './task-rules';
import { useActionFeedback, useTasksContext, type ShownTask } from './tasks-context';

/** Link the save button at the bottom of the modal to the form above the files. */
const TASK_FORM_ID = 'task-form';
const STATUS_FORM_ID = 'task-status-form';

/**
 * Everything about one task, in its modal, laid out like a budget line's: the task (a form for
 * managers, read-only for everyone else), its files, then one row with save and the other actions.
 * The assignee who isn't a manager can only change the status, so they get just that select.
 */
export function TaskPreview({ task, onDeleted }: { task: ShownTask; onDeleted: () => void }) {
  const t = useTranslations();
  const { today, userId, readOnly, mode, canManage, event } = useTasksContext();
  const [saving, setSaving] = useState(false);
  const overdue = isOverdue(task, today);
  const mine = assigneeUserId(task) === userId;
  const canChangeStatus = !canManage && mine && !readOnly;
  const taskEvent = event ?? task.event ?? null;
  const canEdit = canManage && !readOnly && taskEvent !== null;
  const currentAssignee =
    task.assignee?.type === 'member'
      ? { userId: task.assignee.userId, name: task.assignee.name }
      : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl">{task.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {t('tasks.createdBy')}{' '}
            {task.createdBy.userId === userId ? t('tasks.you') : task.createdBy.name}
          </span>
          {mode === 'mine' && task.event && (
            <Link
              href={`/events/${task.event.id}/tasks`}
              className="inline-flex items-center gap-1 font-bold text-primary underline-offset-4 hover:underline"
            >
              {task.event.name}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
          {overdue && <Badge variant="bad">{t('tasks.overdue')}</Badge>}
        </DialogDescription>
      </DialogHeader>

      {canEdit && taskEvent ? (
        <TaskForm
          // Fresh form values after each save.
          key={`${task.id}-${task.updatedAt}`}
          outsideSave={{ formId: TASK_FORM_ID, onPendingChange: setSaving }}
          event={{ id: taskEvent.id, endsAt: taskEvent.endsAt }}
          action={updateTask.bind(null, task.eventId, task.id)}
          defaultValues={taskToForm(task)}
          currentAssignee={currentAssignee}
          onDone={() => toast.success(t('tasks.saved'))}
        />
      ) : (
        <TaskDetails
          // Fresh status select when the task changes elsewhere.
          key={`${task.id}-${task.updatedAt}`}
          task={task}
          canChangeStatus={canChangeStatus}
          onPendingChange={setSaving}
        />
      )}

      <AttachedFiles
        key={task.id}
        eventId={task.eventId}
        owner={{ taskId: task.id }}
        canAdd={canManage || mine}
        readOnly={readOnly}
      />

      {canManage && task.pendingRequests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-card bg-brand-tint p-3">
          <h3 className="text-sm font-bold">{t('tasks.requests')}</h3>
          <ul className="flex flex-col gap-1.5">
            {task.pendingRequests.map((r) => (
              <RequestRow
                key={r.id}
                eventId={task.eventId}
                taskId={task.id}
                requestId={r.id}
                name={r.name}
              />
            ))}
          </ul>
        </section>
      )}

      {!readOnly && (
        <TaskActions
          task={task}
          mine={mine}
          saveForm={canEdit ? TASK_FORM_ID : canChangeStatus ? STATUS_FORM_ID : null}
          saving={saving}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

/** What members see: the task read-only, with a status select when it is theirs. */
function TaskDetails({
  task,
  canChangeStatus,
  onPendingChange,
}: {
  task: ShownTask;
  canChangeStatus: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslations();
  const { labels, userId } = useTasksContext();
  const shownLabels = labels.filter((label) => task.labelIds.includes(label.id));

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Detail label={t('taskForm.status')}>
          {canChangeStatus ? (
            <StatusForm task={task} onPendingChange={onPendingChange} />
          ) : (
            <TaskStatusBadge status={task.status} overdue={false} />
          )}
        </Detail>
        <Detail label={t('taskForm.priority')}>
          <PriorityBadge priority={task.priority} />
        </Detail>
        <Detail label={t('taskForm.dueDate')}>
          {task.dueDate ? formatDay(task.dueDate) : <Empty>{t('tasks.noDueDate')}</Empty>}
        </Detail>
        <Detail label={t('taskForm.assignee')}>
          <AssigneeName assignee={task.assignee} isMe={assigneeUserId(task) === userId} />
        </Detail>
        <Detail label={t('taskForm.labels')} wide>
          {shownLabels.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {shownLabels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </span>
          ) : (
            <Empty>{t('tasks.noLabels')}</Empty>
          )}
        </Detail>
        <Detail label={t('taskForm.description')} wide>
          {task.description ? (
            <span className="whitespace-pre-line">{task.description}</span>
          ) : (
            <Empty>{t('tasks.noDescription')}</Empty>
          )}
        </Detail>
      </dl>
    </div>
  );
}

function Detail({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'flex flex-col gap-1 sm:col-span-2' : 'flex flex-col gap-1'}>
      <dt className="font-bold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-semibold">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

/** The assignee's one change: the status, saved with the button at the bottom of the modal. */
function StatusForm({
  task,
  onPendingChange,
}: {
  task: ShownTask;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslations();
  const feedback = useActionFeedback();
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const change = useAction(changeTaskStatus.bind(null, task.eventId, task.id), {
    onError: feedback.onError,
    onSuccess: () => {
      toast.success(t('tasks.saved'));
      feedback.onSuccess();
    },
  });

  useOutsideSave({ formId: STATUS_FORM_ID, onPendingChange }, change.isPending);

  return (
    <form
      id={STATUS_FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        if (status !== task.status) change.execute({ status });
      }}
    >
      <NativeSelect
        aria-label={t('taskForm.status')}
        value={status}
        onChange={(event) => setStatus(event.target.value as TaskStatus)}
      >
        {TASK_STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`taskStatus.${value}`)}
          </option>
        ))}
      </NativeSelect>
    </form>
  );
}

/**
 * The row at the bottom: save on the left (for whoever may change something), then giving the task
 * back, asking for it and deleting it on the right.
 */
function TaskActions({
  task,
  mine,
  saveForm,
  saving,
  onDeleted,
}: {
  task: ShownTask;
  mine: boolean;
  /** The form the save button submits; null when this user can't change anything. */
  saveForm: string | null;
  saving: boolean;
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
  const canRequest = !canManage && task.assignee === null && !myRequest;

  return (
    <ModalActions formId={saveForm} saving={saving}>
      {mine && (
        <>
          <Button variant="ghost" onClick={() => setConfirmingUnassign(true)}>
            <UserMinus data-icon="inline-start" aria-hidden />
            {t('tasks.unassignSelf')}
          </Button>
          <ConfirmUnassign
            task={task}
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
    </ModalActions>
  );
}

/** Taking yourself off a task means someone has to be found again, so it asks first. */
function ConfirmUnassign({
  task,
  open,
  onOpenChange,
}: {
  task: ShownTask;
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
          <AlertDialogTitle>{t('tasks.unassignSelfTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('tasks.unassignSelfWarning', { title: task.title })}
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
            {t('tasks.unassignSelfConfirm')}
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
      <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
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
