'use client';

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Columns3, List, ListChecks, Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { startTransition, useOptimistic, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { IconBlob } from '@/components/layout/icon-blob';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { changeTaskStatus } from '@/server/tasks/actions';
import { LabelManager } from '@/features/labels/label-manager';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from './schemas';
import { TaskCard } from './task-card';
import { TaskForm } from './task-form';
import { TaskPreview } from './task-preview';
import {
  assigneeOptions,
  assigneeUserId,
  eventOptions,
  filterTasks,
  NO_FILTERS,
  type TaskFilters,
} from './task-rules';
import {
  TasksProvider,
  useTasksContext,
  type ShownTask,
  type TasksContextValue,
} from './tasks-context';

type View = 'board' | 'list';
/** What the side pane shows: a task (edited in place), or the form for a new task. */
type Pane = { kind: 'task'; taskId: string } | { kind: 'create' } | null;

/** Tasks as a board (a column per status) or a list, with filters and a pane per task. */
export function TasksView({ tasks, ...context }: TasksContextValue & { tasks: ShownTask[] }) {
  return (
    <TasksProvider value={context}>
      <Tasks tasks={tasks} />
    </TasksProvider>
  );
}

function Tasks({ tasks }: { tasks: ShownTask[] }) {
  const t = useTranslations();
  const router = useRouter();
  const { userId, canManage, readOnly, mode, event, labels } = useTasksContext();
  const [view, setView] = useState<View>('board');
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [pane, setPane] = useState<Pane>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);

  // A dropped card moves at once; the server's answer replaces it (or puts it back on failure).
  const [shown, moveOptimistically] = useOptimistic(
    tasks,
    (current, move: { id: string; status: TaskStatus }) =>
      current.map((task) => (task.id === move.id ? { ...task, status: move.status } : task)),
  );
  const moveTask = (task: ShownTask, status: TaskStatus) =>
    startTransition(async () => {
      moveOptimistically({ id: task.id, status });
      const result = await changeTaskStatus(task.eventId, task.id, { status });
      if (result?.serverError) toast.error(t(result.serverError.message));
      router.refresh();
    });

  const visible = filterTasks(
    shown,
    view === 'board' ? { ...filters, status: 'all' } : filters,
    userId,
  );
  const set = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const open = (task: ShownTask) => setPane({ kind: 'task', taskId: task.id });
  // The modal reads the task from fresh page data, so it updates after every change.
  const paneTask = pane?.kind === 'task' ? shown.find((x) => x.id === pane.taskId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {mode === 'event' && (
            <Segmented
              label={t('tasks.scope')}
              value={filters.scope}
              onChange={(scope) => set('scope', scope)}
              options={[
                { value: 'all', label: canManage ? t('tasks.scopeAll') : t('tasks.scopeOpen') },
                { value: 'mine', label: t('tasks.scopeMine') },
              ]}
            />
          )}
          <Segmented
            label={t('tasks.view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: t('tasks.board'), icon: <Columns3 aria-hidden /> },
              { value: 'list', label: t('tasks.list'), icon: <List aria-hidden /> },
            ]}
          />
        </div>
        {event && canManage && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setLabelsOpen(true)}>
              <Tags data-icon="inline-start" aria-hidden />
              {t('labels.manage')}
            </Button>
            <Button onClick={() => setPane({ kind: 'create' })}>
              <Plus data-icon="inline-start" aria-hidden />
              {t('tasks.new')}
            </Button>
          </div>
        )}
      </div>

      <Filters tasks={shown} filters={filters} set={set} showStatus={view === 'list'} />

      {tasks.length === 0 ? (
        <EmptyState />
      ) : view === 'board' ? (
        <Board tasks={visible} onOpen={open} onMove={moveTask} />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} onOpen={() => open(task)} />
            </li>
          ))}
          {visible.length === 0 && (
            <li className="rounded-card bg-card p-6 text-center text-muted-foreground">
              {t('tasks.noMatches')}
            </li>
          )}
        </ul>
      )}

      {/* Creating opens a short modal; viewing and editing a task opens a wide one. */}
      <Dialog open={pane?.kind === 'create'} onOpenChange={(isOpen) => !isOpen && setPane(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('taskForm.createTitle')}</DialogTitle>
            <DialogDescription>{t('taskForm.subtitle')}</DialogDescription>
          </DialogHeader>
          {event && (
            <TaskForm event={event} onDone={() => setPane(null)} onCancel={() => setPane(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pane !== null && pane.kind !== 'create'}
        onOpenChange={(isOpen) => !isOpen && setPane(null)}
      >
        <DialogContent size={paneTask ? 'md' : 'default'}>
          {paneTask && <TaskPreview task={paneTask} onDeleted={() => setPane(null)} />}
          {pane?.kind === 'task' && !paneTask && (
            // Deleted, or no longer visible (e.g. given away).
            <DialogHeader>
              <DialogTitle>{t('tasks.gone')}</DialogTitle>
              <DialogDescription>{t('tasks.goneBody')}</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {event && canManage && (
        <LabelManager
          eventId={event.id}
          labels={labels}
          open={labelsOpen}
          onOpenChange={setLabelsOpen}
        />
      )}
    </div>
  );
}

function Segmented<V extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: string; icon?: ReactNode }[];
}) {
  return (
    <fieldset className="flex rounded-full bg-card p-1 shadow-soft">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function Filters({
  tasks,
  filters,
  set,
  showStatus,
}: {
  tasks: ShownTask[];
  filters: TaskFilters;
  set: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
  showStatus: boolean;
}) {
  const t = useTranslations();
  const { labels, canManage, mode } = useTasksContext();
  const people = assigneeOptions(tasks);
  const events = eventOptions(tasks);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode === 'mine' && events.length > 1 && (
        <FilterSelect
          label={t('tasks.event')}
          value={filters.eventId}
          onChange={(value) => set('eventId', value)}
        >
          <option value="all">{t('tasks.allEvents')}</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </FilterSelect>
      )}
      {showStatus && (
        <FilterSelect
          label={t('taskForm.status')}
          value={filters.status}
          onChange={(value) => set('status', value as TaskStatus | 'all')}
        >
          <option value="all">{t('tasks.allStatuses')}</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`taskStatus.${status}`)}
            </option>
          ))}
        </FilterSelect>
      )}
      {canManage && (
        <FilterSelect
          label={t('taskForm.assignee')}
          value={filters.assignee}
          onChange={(value) => set('assignee', value)}
        >
          <option value="all">{t('tasks.allAssignees')}</option>
          <option value="unassigned">{t('tasks.unassigned')}</option>
          {people.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name}
            </option>
          ))}
          <option value="external">{t('tasks.externalAssignees')}</option>
        </FilterSelect>
      )}
      <FilterSelect
        label={t('taskForm.priority')}
        value={filters.priority}
        onChange={(value) => set('priority', value as TaskPriority | 'all')}
      >
        <option value="all">{t('tasks.allPriorities')}</option>
        {TASK_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {t(`taskPriority.${priority}`)}
          </option>
        ))}
      </FilterSelect>
      {labels.length > 0 && (
        <FilterSelect
          label={t('taskForm.labels')}
          value={filters.labelId}
          onChange={(value) => set('labelId', value)}
        >
          <option value="all">{t('tasks.allLabels')}</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </FilterSelect>
      )}
      {canManage && (
        <Button
          size="sm"
          variant={filters.withRequests ? 'default' : 'secondary'}
          aria-pressed={filters.withRequests}
          onClick={() => set('withRequests', !filters.withRequests)}
        >
          {t('tasks.withRequests')}
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="w-44">
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-card"
      >
        {children}
      </NativeSelect>
    </div>
  );
}

function Board({
  tasks,
  onOpen,
  onMove,
}: {
  tasks: ShownTask[];
  onOpen: (task: ShownTask) => void;
  onMove: (task: ShownTask, status: TaskStatus) => void;
}) {
  // Dragging needs a few pixels of movement (or a long press on touch), so a click still opens
  // the task. The modal's status picker is the keyboard and screen reader way to move a task.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  // The click that ends a drag must not open the task.
  const dragging = useRef(false);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setTimeout(() => (dragging.current = false), 0);
    const status = over?.id as TaskStatus | undefined;
    const task = tasks.find((x) => x.id === active.id);
    if (task && status && task.status !== status) onMove(task, status);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => (dragging.current = true)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setTimeout(() => (dragging.current = false), 0)}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            onOpen={(task) => !dragging.current && onOpen(task)}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  onOpen,
}: {
  status: TaskStatus;
  tasks: ShownTask[];
  onOpen: (task: ShownTask) => void;
}) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`taskStatus.${status}`)}
      className={cn(
        'flex min-h-40 flex-col gap-3 rounded-card bg-muted/60 p-3 transition-colors',
        isOver && 'bg-brand-tint ring-2 ring-brand-secondary',
      )}
    >
      <h2 className="flex items-center justify-between px-1 text-base">
        {t(`taskStatus.${status}`)}
        <span className="rounded-full bg-card px-2 text-sm text-muted-foreground">
          {tasks.length}
        </span>
      </h2>
      {tasks.map((task) => (
        <DraggableCard key={task.id} task={task} onOpen={() => onOpen(task)} />
      ))}
    </section>
  );
}

/** The whole card is the drag target. Only tasks the viewer may move can be dragged. */
function DraggableCard({ task, onOpen }: { task: ShownTask; onOpen: () => void }) {
  const { userId, canManage, readOnly } = useTasksContext();
  const canMove = !readOnly && (canManage || assigneeUserId(task) === userId);
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canMove,
  });
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      onOpen={onOpen}
      showStatus={false}
      {...(canMove ? listeners : {})}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        canMove && 'touch-manipulation active:cursor-grabbing',
        isDragging && 'relative z-10 cursor-grabbing opacity-90 shadow-lg',
      )}
    />
  );
}

function EmptyState() {
  const t = useTranslations();
  const { canManage, mode } = useTasksContext();
  const body =
    mode === 'mine'
      ? t('tasks.emptyBodyMine')
      : canManage
        ? t('tasks.emptyBodyManager')
        : t('tasks.emptyBodyMember');
  return (
    <section className="flex flex-col items-start gap-3 rounded-card bg-brand-tint p-6">
      <IconBlob icon={ListChecks} tone="accent" className="bg-card" />
      <h2 className="text-lg">{t('tasks.emptyTitle')}</h2>
      <p className="text-muted-foreground">{body}</p>
    </section>
  );
}
