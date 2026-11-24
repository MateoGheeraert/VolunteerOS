'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  CalendarClock,
  Check,
  CheckCheck,
  CircleCheck,
  CircleAlert,
  Link2,
  MailCheck,
  MapPin,
  MessageSquareText,
  Pencil,
  Plus,
  Send,
  Settings2,
  Star,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import type {
  Application,
  Assignment,
  Event,
  Planning,
  Shift,
  Team,
} from '@/api/generated/types.gen';
import { IconBlob } from '@/components/layout/icon-blob';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime, formatShiftTime, formatShortDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  assignVolunteer,
  confirmAllAssignments,
  confirmAssignment,
  moveAssignment,
  notifyVolunteer,
  unassign,
} from '@/server/planning/actions';
import { useConfirm } from './confirm-dialog';
import {
  checkPlacement,
  coverage,
  filterVolunteers,
  isAvailable,
  publishReadiness,
  shiftDay,
  shiftDays,
  shiftsNeeded,
  sortVolunteers,
  teamCoverage,
  type Coverage,
  type VolunteerFilters,
} from './planning-rules';
import { PublishPanel } from './publish-panel';
import { CopyLink, RegistrationForm } from './registration-form';
import { toShiftFormValues, type ShiftFormValues } from './schemas';
import { ShiftForm } from './shift-form';
import { AddTeam, TeamForm, TeamQuickAdd } from './team-forms';
import { VolunteerForm } from './volunteer-form';

type Pane =
  | { kind: 'team'; teamId: string }
  | { kind: 'shift'; shiftId: string }
  | { kind: 'newShift'; values: ShiftFormValues }
  | { kind: 'volunteer'; applicationId: string }
  | { kind: 'newVolunteer' }
  | { kind: 'registration' }
  | { kind: 'publish' }
  | null;

/** What is being dragged: a volunteer from the panel, or someone already on a shift. */
type Dragged =
  | { kind: 'volunteer'; application: Application }
  | { kind: 'assignment'; assignment: Assignment; application: Application };

const PANEL_DROP_ID = 'panel';

/**
 * The planning board: a lane per team with its shifts and their coverage, and on the right the
 * volunteers who signed up. Drag volunteers onto shifts (a proposal), confirm them, then publish.
 * The board checks overlaps and warnings before a drop; the backend checks everything again.
 */
export function PlanningBoard({
  event,
  planning,
  canManage,
  readOnly,
}: {
  event: Event;
  planning: Planning;
  canManage: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const editable = canManage && !readOnly;
  const [pane, setPane] = useState<Pane>(null);
  const [day, setDay] = useState<string>('all');
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDialog, confirm] = useConfirm();
  // A stable id: dnd-kit's own counter differs between server and client render (hydration).
  const dndId = useId();
  const close = () => setPane(null);
  // The click that ends a drag must not open the volunteer.
  const dragging = useRef(false);
  const openVolunteer = (application: Application) => {
    if (!dragging.current) setPane({ kind: 'volunteer', applicationId: application.id });
  };

  const days = shiftDays(planning.shifts);
  const visibleShifts =
    day === 'all' ? planning.shifts : planning.shifts.filter((s) => shiftDay(s) === day);
  const applicationById = new Map(planning.applications.map((a) => [a.id, a]));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const run = (work: () => Promise<{ serverError?: { message: string } } | undefined>) =>
    startTransition(async () => {
      const result = await work();
      if (result?.serverError) toast.error(t(result.serverError.message as never));
    });

  /** Checks a placement, asks about warnings, then places or moves. */
  const place = async (application: Application, target: Shift, assignment?: Assignment) => {
    const { clash, warnings } = checkPlacement(planning, application, target, assignment?.id);
    if (clash) {
      toast.error(
        t('planning.board.overlap', {
          name: application.name,
          time: `${formatShortDay(shiftDay(clash))} ${formatShiftTime(clash.startsAt, clash.endsAt)}`,
        }),
      );
      return;
    }
    if (warnings.length > 0) {
      const ok = await confirm({
        title: t('planning.board.warningTitle'),
        body: warnings.map((warning) => (
          <span key={warning}>
            {t(`planning.board.warnings.${warning}`, {
              name: application.name,
              capacity: target.capacity,
            })}
          </span>
        )),
        confirmLabel: t('planning.board.placeAnyway'),
      });
      if (!ok) return;
    }
    const acknowledgeWarnings = warnings.length > 0;
    run(() =>
      assignment
        ? moveAssignment(event.id, assignment.id, { shiftId: target.id, acknowledgeWarnings })
        : assignVolunteer(event.id, {
            applicationId: application.id,
            shiftId: target.id,
            acknowledgeWarnings,
          }),
    );
  };

  const remove = async (assignment: Assignment, application: Application) => {
    if (assignment.status === 'confirmed') {
      const ok = await confirm({
        title: t('planning.board.unassignTitle', { name: application.name }),
        body: <span>{t('planning.board.unassignConfirmed')}</span>,
        confirmLabel: t('planning.board.unassign'),
        destructive: true,
      });
      if (!ok) return;
    }
    run(() => unassign(event.id, assignment.id));
  };

  /** After the schedule was sent: tell one volunteer what changed (or record that you told them). */
  const notify = async (application: Application) => {
    const kind = application.pendingNotice;
    if (!kind) return;
    const ok = await confirm({
      title: t('planning.notify.title', { name: application.name }),
      body: (
        <>
          <span>{t(`planning.notify.what.${kind}`, { name: application.name })}</span>
          <span>
            {application.email
              ? t('planning.notify.byEmail', { email: application.email })
              : t('planning.notify.byYou', { phone: application.phone ?? '' })}
          </span>
        </>
      ),
      confirmLabel: application.email ? t('planning.notify.send') : t('planning.notify.done'),
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await notifyVolunteer(event.id, application.id);
      if (result?.serverError) toast.error(t(result.serverError.message as never));
      else toast.success(t('planning.notify.notified', { name: application.name }));
    });
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    dragging.current = true;
    setDragged(active.data.current as Dragged);
  };
  const endDrag = () => {
    setDragged(null);
    setTimeout(() => (dragging.current = false), 0);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    const item = active.data.current as Dragged | undefined;
    if (!item || !over) return;
    if (over.id === PANEL_DROP_ID) {
      if (item.kind === 'assignment') void remove(item.assignment, item.application);
      return;
    }
    const target = planning.shifts.find((s) => s.id === over.id);
    if (!target) return;
    if (item.kind === 'assignment') {
      if (item.assignment.shiftId !== target.id)
        void place(item.application, target, item.assignment);
      return;
    }
    if (item.application.assignments.some((a) => a.shiftId === target.id)) return;
    void place(item.application, target);
  };

  const creating = pane?.kind === 'newShift' || pane?.kind === 'newVolunteer';
  const paneTeam = pane?.kind === 'team' ? planning.teams.find((x) => x.id === pane.teamId) : null;
  const paneShift =
    pane?.kind === 'shift' ? planning.shifts.find((x) => x.id === pane.shiftId) : null;
  const paneApplication =
    pane?.kind === 'volunteer' ? applicationById.get(pane.applicationId) : null;

  const newShiftValues = (team: Team): ShiftFormValues => {
    const last = planning.shifts.filter((s) => s.teamId === team.id).at(-1);
    if (last) {
      // Continue where the team's last shift ends, same length and size.
      const length = Date.parse(last.endsAt) - Date.parse(last.startsAt);
      return toShiftFormValues({
        teamId: team.id,
        startsAt: last.endsAt,
        endsAt: new Date(Date.parse(last.endsAt) + length).toISOString(),
        capacity: last.capacity,
        meetingPoint: '',
      });
    }
    return toShiftFormValues({
      teamId: team.id,
      startsAt: event.startsAt,
      endsAt: new Date(
        Math.min(Date.parse(event.startsAt) + 3 * 3600_000, Date.parse(event.endsAt)),
      ).toISOString(),
      capacity: 2,
      meetingPoint: '',
    });
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      {confirmDialog}
      <div className="flex flex-col gap-4">
        <Toolbar
          event={event}
          planning={planning}
          editable={editable}
          onRegistration={() => setPane({ kind: 'registration' })}
        />

        {editable && planning.teams.length > 0 && (
          <PublishStep
            event={event}
            planning={planning}
            pending={pending}
            onPublish={() => setPane({ kind: 'publish' })}
            onConfirmAll={() => run(() => confirmAllAssignments(event.id))}
          />
        )}

        {days.length > 1 && (
          <div
            className="flex flex-wrap gap-1.5"
            role="tablist"
            aria-label={t('planning.board.days')}
          >
            {['all', ...days].map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={day === option}
                onClick={() => setDay(option)}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  day === option
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
                )}
              >
                {option === 'all' ? t('planning.board.allDays') : formatShortDay(option)}
              </button>
            ))}
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-6">
            {planning.teams.length === 0 ? (
              <EmptyTeams eventId={event.id} editable={editable} />
            ) : (
              planning.teams.map((team) => (
                <TeamLane
                  key={team.id}
                  team={team}
                  shifts={visibleShifts.filter((s) => s.teamId === team.id)}
                  allTeamShifts={planning.shifts.filter((s) => s.teamId === team.id)}
                  applications={planning.applications}
                  dragged={dragged}
                  editable={editable}
                  pending={pending}
                  onEditTeam={() => setPane({ kind: 'team', teamId: team.id })}
                  onAddShift={() => setPane({ kind: 'newShift', values: newShiftValues(team) })}
                  onEditShift={(shift) => setPane({ kind: 'shift', shiftId: shift.id })}
                  onConfirm={(assignment) => run(() => confirmAssignment(event.id, assignment.id))}
                  onRemove={(assignment, application) => void remove(assignment, application)}
                  onOpenVolunteer={openVolunteer}
                />
              ))
            )}
            {editable && planning.teams.length > 0 && (
              <AddTeam eventId={event.id} teams={planning.teams} />
            )}
          </div>
          <VolunteerPanel
            event={event}
            planning={planning}
            editable={editable}
            pending={pending}
            onAdd={() => setPane({ kind: 'newVolunteer' })}
            onOpen={openVolunteer}
            onNotify={(application) => void notify(application)}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <VolunteerChip
            application={dragged.application}
            status={dragged.kind === 'assignment' ? dragged.assignment.status : 'proposed'}
            overlay
          />
        )}
      </DragOverlay>

      {/* Creating opens a modal; the side sheet is for viewing and editing what exists. */}
      <Dialog open={creating} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {pane?.kind === 'newShift' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('planning.shifts.newTitle')}</DialogTitle>
                <DialogDescription>{t('planning.shifts.newDescription')}</DialogDescription>
              </DialogHeader>
              <ShiftForm
                key={JSON.stringify(pane.values)}
                eventId={event.id}
                teams={planning.teams}
                window={planning.window}
                defaultValues={pane.values}
                onDone={close}
              />
            </>
          )}
          {pane?.kind === 'newVolunteer' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('planning.volunteers.newTitle')}</DialogTitle>
                <DialogDescription>{t('planning.volunteers.newDescription')}</DialogDescription>
              </DialogHeader>
              <VolunteerForm
                key="new"
                eventId={event.id}
                teams={planning.teams}
                shifts={planning.shifts}
                onDone={close}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={pane !== null && !creating} onOpenChange={(open) => !open && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {paneTeam && (
            <PaneBody title={t('planning.teams.editTitle')} description={paneTeam.name}>
              <TeamForm
                eventId={event.id}
                team={paneTeam}
                shiftCount={planning.shifts.filter((s) => s.teamId === paneTeam.id).length}
                confirmedCount={planning.shifts
                  .filter((s) => s.teamId === paneTeam.id)
                  .reduce((sum, s) => sum + s.confirmedCount, 0)}
                onDone={close}
              />
            </PaneBody>
          )}
          {paneShift && (
            <PaneBody
              title={t('planning.shifts.editTitle')}
              description={formatShiftTime(paneShift.startsAt, paneShift.endsAt)}
            >
              <ShiftForm
                key={paneShift.id}
                eventId={event.id}
                teams={planning.teams}
                window={planning.window}
                shift={paneShift}
                defaultValues={toShiftFormValues(paneShift)}
                onDone={close}
                onDuplicate={(values) => setPane({ kind: 'newShift', values })}
              />
            </PaneBody>
          )}
          {paneApplication && (
            <PaneBody
              title={paneApplication.name}
              description={t('planning.volunteers.editDescription')}
            >
              {editable ? (
                <VolunteerForm
                  key={paneApplication.id}
                  eventId={event.id}
                  teams={planning.teams}
                  shifts={planning.shifts}
                  application={paneApplication}
                  onDone={close}
                />
              ) : (
                <VolunteerDetails application={paneApplication} planning={planning} />
              )}
            </PaneBody>
          )}
          {pane?.kind === 'registration' && (
            <PaneBody
              title={t('planning.registration.title')}
              description={t('planning.registration.description')}
            >
              <RegistrationForm event={event} onDone={close} />
            </PaneBody>
          )}
          {pane?.kind === 'publish' && (
            <PaneBody
              title={t('planning.publish.title')}
              description={t('planning.publish.description')}
            >
              <PublishPanel eventId={event.id} planning={planning} onDone={close} />
            </PaneBody>
          )}
        </SheetContent>
      </Sheet>
    </DndContext>
  );
}

function PaneBody({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-8 text-lg">{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="px-6 pb-6">{children}</div>
    </>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────────────────────────────

function Toolbar({
  event,
  planning,
  editable,
  onRegistration,
}: {
  event: Event;
  planning: Planning;
  editable: boolean;
  onRegistration: () => void;
}) {
  const t = useTranslations();
  const totals = teamCoverage(planning.shifts);

  const isOpen = planning.registrationClosedReason === null;

  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <IconBlob icon={UsersRound} />
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">{t('planning.board.coverage')}</span>
            <span className="text-lg font-extrabold">
              {t('planning.board.coverageValue', {
                filled: totals.filled,
                capacity: totals.capacity,
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm">
            <Badge variant={isOpen ? 'ok' : 'secondary'}>
              {isOpen
                ? t('planning.registration.statusOpen')
                : t('planning.registration.statusClosed')}
            </Badge>
            <span className="text-muted-foreground">
              {t('planning.board.applications', { count: planning.applications.length })}
            </span>
          </span>
          {event.registrationDeadline && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              {t('planning.registration.until', {
                date: formatDateTime(event.registrationDeadline),
              })}
            </span>
          )}
        </div>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          {event.publicSlug && <CopyLink slug={event.publicSlug} />}
          <Button variant="secondary" size="sm" onClick={onRegistration}>
            {event.publicSlug ? (
              <Settings2 data-icon="inline-start" aria-hidden />
            ) : (
              <Link2 data-icon="inline-start" aria-hidden />
            )}
            {event.publicSlug
              ? t('planning.registration.settings')
              : t('planning.registration.openButton')}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The last step, kept apart from the everyday tools: sending is meant to happen once, when the
 * planning is complete. Until then it is a quiet checklist; once every shift is full and
 * confirmed it becomes the main call to action. After that it only speaks up for changes.
 */
function PublishStep({
  event,
  planning,
  pending,
  onPublish,
  onConfirmAll,
}: {
  event: Event;
  planning: Planning;
  pending: boolean;
  onPublish: () => void;
  onConfirmAll: () => void;
}) {
  const t = useTranslations();
  const { openSpots, proposed, ready } = publishReadiness(planning);

  if (event.schedulePublishedAt) {
    const changes = planning.unpublishedChanges;
    return (
      <section
        className={cn(
          'flex flex-col gap-3 rounded-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5',
          changes > 0 ? 'bg-status-warn-bg text-status-warn' : 'bg-status-ok-bg text-status-ok',
        )}
      >
        <span className="flex items-start gap-2 text-sm font-semibold">
          {changes > 0 ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {changes > 0
            ? t('planning.publish.updateTitle', { count: changes })
            : t('planning.publish.sentOn', { date: formatDateTime(event.schedulePublishedAt) })}
        </span>
        {changes > 0 && (
          <span className="flex items-center gap-1.5 text-sm">
            <MailCheck className="size-4 shrink-0" aria-hidden />
            {t('planning.publish.notifyHint')}
          </span>
        )}
      </section>
    );
  }

  if (ready) {
    return (
      <section className="flex flex-col gap-4 rounded-card bg-primary p-5 text-primary-foreground shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg text-primary-foreground">{t('planning.publish.readyTitle')}</h2>
            <p className="text-sm opacity-90">{t('planning.publish.readyBody')}</p>
          </div>
        </div>
        <Button size="lg" variant="secondary" onClick={onPublish} className="w-fit shrink-0">
          <Send data-icon="inline-start" aria-hidden />
          {t('planning.publish.sendNow')}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border-2 border-dashed border-border px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base">{t('planning.publish.stepTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('planning.publish.stepIntro')}</p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {planning.shifts.length === 0 && (
          <ChecklistItem>{t('planning.publish.checkShifts')}</ChecklistItem>
        )}
        {openSpots > 0 && (
          <ChecklistItem>
            {t('planning.publish.checkOpenSpots', { count: openSpots })}
          </ChecklistItem>
        )}
        {proposed > 0 && (
          <ChecklistItem
            action={
              <Button variant="secondary" size="sm" onClick={onConfirmAll} disabled={pending}>
                <CheckCheck data-icon="inline-start" aria-hidden />
                {t('planning.board.confirmAll')}
              </Button>
            }
          >
            {t('planning.publish.checkProposed', { count: proposed })}
          </ChecklistItem>
        )}
      </ul>
      {planning.shifts.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onPublish}
          className="w-fit text-muted-foreground"
        >
          <Send data-icon="inline-start" aria-hidden />
          {t('planning.publish.sendAnyway')}
        </Button>
      )}
    </section>
  );
}

function ChecklistItem({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full bg-status-bad" aria-hidden />
        {children}
      </span>
      {action}
    </li>
  );
}

function EmptyTeams({ eventId, editable }: { eventId: string; editable: boolean }) {
  const t = useTranslations();
  return (
    <section className="flex flex-col items-start gap-3 rounded-card bg-brand-tint p-6">
      <IconBlob icon={UsersRound} tone="accent" className="bg-card" />
      <h2 className="text-lg">{t('planning.teams.emptyTitle')}</h2>
      <p className="text-muted-foreground">
        {editable ? t('planning.teams.emptyBody') : t('planning.teams.emptyBodyReadOnly')}
      </p>
      {editable && (
        <div className="w-full">
          <TeamQuickAdd eventId={eventId} teams={[]} />
        </div>
      )}
    </section>
  );
}

// ── Team lanes and shifts ──────────────────────────────────────────────────────────────────────

const COVERAGE_STYLES: Record<Coverage, string> = {
  empty: 'bg-status-bad-bg text-status-bad',
  partial: 'bg-status-bad-bg text-status-bad',
  full: 'bg-status-ok-bg text-status-ok',
  over: 'bg-status-warn-bg text-status-warn',
};

function TeamLane({
  team,
  shifts,
  allTeamShifts,
  applications,
  dragged,
  editable,
  pending,
  onEditTeam,
  onAddShift,
  onEditShift,
  onConfirm,
  onRemove,
  onOpenVolunteer,
}: {
  team: Team;
  shifts: Shift[];
  allTeamShifts: Shift[];
  applications: Application[];
  dragged: Dragged | null;
  editable: boolean;
  pending: boolean;
  onEditTeam: () => void;
  onAddShift: () => void;
  onEditShift: (shift: Shift) => void;
  onConfirm: (assignment: Assignment) => void;
  onRemove: (assignment: Assignment, application: Application) => void;
  onOpenVolunteer: (application: Application) => void;
}) {
  const t = useTranslations();
  const totals = teamCoverage(allTeamShifts);
  const state = coverage(totals.filled, totals.capacity);
  const preferred = dragged?.application.preferredTeamId === team.id;

  return (
    <section
      aria-label={team.name}
      className={cn(
        'flex flex-col gap-3 rounded-card transition-colors',
        preferred && '-m-3 bg-brand-tint/70 p-3',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex flex-wrap items-center gap-2 text-base">
            {team.name}
            {allTeamShifts.length > 0 && (
              <span
                className={cn(
                  'rounded-full px-2 text-sm',
                  COVERAGE_STYLES[state === 'partial' ? 'empty' : state],
                )}
              >
                {t('planning.board.coverageValue', {
                  filled: totals.filled,
                  capacity: totals.capacity,
                })}
              </span>
            )}
            {preferred && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                <Star className="size-3.5" aria-hidden />
                {t('planning.board.preferredTeam')}
              </span>
            )}
          </h2>
          {team.description && <p className="text-sm text-muted-foreground">{team.description}</p>}
        </div>
        {editable && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEditTeam}
              aria-label={t('planning.teams.editTitle')}
            >
              <Pencil aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" onClick={onAddShift}>
              <Plus data-icon="inline-start" aria-hidden />
              {t('planning.shifts.add')}
            </Button>
          </div>
        )}
      </header>
      {shifts.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">
          {allTeamShifts.length === 0
            ? t('planning.shifts.none')
            : t('planning.shifts.noneThisDay')}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
          {shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              applications={applications}
              dragged={dragged}
              editable={editable}
              pending={pending}
              onEdit={() => onEditShift(shift)}
              onConfirm={onConfirm}
              onRemove={onRemove}
              onOpenVolunteer={onOpenVolunteer}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ShiftCard({
  shift,
  applications,
  dragged,
  editable,
  pending,
  onEdit,
  onConfirm,
  onRemove,
  onOpenVolunteer,
}: {
  shift: Shift;
  applications: Application[];
  dragged: Dragged | null;
  editable: boolean;
  pending: boolean;
  onEdit: () => void;
  onConfirm: (assignment: Assignment) => void;
  onRemove: (assignment: Assignment, application: Application) => void;
  onOpenVolunteer: (application: Application) => void;
}) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: shift.id, disabled: !editable });
  const state = coverage(shift.assignedCount, shift.capacity);
  const people = applications.flatMap((application) =>
    application.assignments
      .filter((a) => a.shiftId === shift.id)
      .map((assignment) => ({ assignment, application })),
  );
  // While dragging: the shifts the volunteer marked light up green, the others fade a little.
  const marked = dragged ? isAvailable(dragged.application, shift.id) : false;

  return (
    <article
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 transition-all',
        dragged && (marked ? 'border-status-ok ring-2 ring-status-ok/30' : 'opacity-70'),
        isOver && 'scale-[1.01] ring-2 ring-brand-secondary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-extrabold">
            {formatShortDay(shiftDay(shift))} · {formatShiftTime(shift.startsAt, shift.endsAt)}
          </span>
          {shift.meetingPoint && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{shift.meetingPoint}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-sm font-bold whitespace-nowrap',
              COVERAGE_STYLES[state],
            )}
            title={t('planning.board.confirmedOf', { count: shift.confirmedCount })}
          >
            {t('planning.board.coverageValue', {
              filled: shift.assignedCount,
              capacity: shift.capacity,
            })}
          </span>
          {editable && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onEdit}
              aria-label={t('planning.shifts.editTitle')}
            >
              <Pencil aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {shift.confirmedCount > 0 && shift.confirmedCount < shift.assignedCount && (
        <span className="text-xs text-muted-foreground">
          {t('planning.board.confirmedOf', { count: shift.confirmedCount })}
        </span>
      )}
      <ul className="flex min-h-9 flex-wrap gap-1.5">
        {people.length === 0 && (
          <li className="text-sm text-muted-foreground/80">
            {editable ? t('planning.board.dropHere') : t('planning.board.nobody')}
          </li>
        )}
        {people.map(({ assignment, application }) => (
          <li key={assignment.id}>
            <AssignedChip
              assignment={assignment}
              application={application}
              editable={editable}
              pending={pending}
              onConfirm={() => onConfirm(assignment)}
              onRemove={() => onRemove(assignment, application)}
              onOpen={() => onOpenVolunteer(application)}
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

function AssignedChip({
  assignment,
  application,
  editable,
  pending,
  onConfirm,
  onRemove,
  onOpen,
}: {
  assignment: Assignment;
  application: Application;
  editable: boolean;
  pending: boolean;
  onConfirm: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assignment:${assignment.id}`,
    data: { kind: 'assignment', assignment, application } satisfies Dragged,
    disabled: !editable,
  });
  const issues = assignment.issues;
  const confirmed = assignment.status === 'confirmed';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border-2 py-0.5 pr-0.5 pl-2.5 text-sm font-bold',
        confirmed
          ? 'border-primary bg-brand-tint text-primary'
          : 'border-dashed border-brand-tint-strong bg-card',
        issues.length > 0 && 'border-status-warn bg-status-warn-bg text-status-warn',
        isDragging && 'opacity-40',
      )}
      title={
        issues.length > 0
          ? issues.map((issue) => t(`planning.board.issues.${issue}`)).join(' · ')
          : confirmed
            ? t('planning.board.confirmed')
            : t('planning.board.proposed')
      }
    >
      <button
        ref={setNodeRef}
        type="button"
        onClick={onOpen}
        className={cn(
          'inline-flex items-center gap-1 outline-none',
          editable && 'cursor-grab touch-manipulation active:cursor-grabbing',
        )}
        {...attributes}
        {...listeners}
      >
        {issues.length > 0 && <CircleAlert className="size-3.5" aria-hidden />}
        {application.name}
        <span className="sr-only">
          {confirmed ? t('planning.board.confirmed') : t('planning.board.proposed')}
        </span>
      </button>
      {editable && !confirmed && (
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          aria-label={t('planning.board.confirmName', { name: application.name })}
          className="grid size-6 place-items-center rounded-full text-status-ok hover:bg-status-ok-bg"
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      )}
      {editable && (
        <button
          type="button"
          disabled={pending}
          onClick={onRemove}
          aria-label={t('planning.board.unassignName', { name: application.name })}
          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {!editable && <span className="w-2" />}
    </span>
  );
}

function VolunteerChip({
  application,
  status,
  overlay = false,
}: {
  application: Application;
  status: Assignment['status'];
  overlay?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border-2 px-3 py-1 text-sm font-bold shadow-lg',
        status === 'confirmed'
          ? 'border-primary bg-brand-tint text-primary'
          : 'border-dashed border-brand-tint-strong bg-card',
        overlay && 'cursor-grabbing',
      )}
    >
      {application.name}
    </span>
  );
}

// ── Volunteer panel ────────────────────────────────────────────────────────────────────────────

function VolunteerPanel({
  event,
  planning,
  editable,
  pending,
  onAdd,
  onOpen,
  onNotify,
}: {
  event: Event;
  planning: Planning;
  editable: boolean;
  pending: boolean;
  onAdd: () => void;
  onOpen: (application: Application) => void;
  onNotify: (application: Application) => void;
}) {
  const t = useTranslations();
  const [filters, setFilters] = useState<VolunteerFilters>({ search: '', teamId: 'all' });
  const { setNodeRef, isOver } = useDroppable({ id: PANEL_DROP_ID, disabled: !editable });
  // Volunteers who still have to be told about a change come first.
  const shown = filterVolunteers(sortVolunteers(planning.applications, event), filters).sort(
    (a, b) => Number(b.pendingNotice !== null) - Number(a.pendingNotice !== null),
  );
  const teamName = new Map(planning.teams.map((team) => [team.id, team.name]));

  return (
    <aside
      ref={setNodeRef}
      aria-label={t('planning.volunteers.title')}
      className={cn(
        // Below lg it sits above the board and stays in view while scrolling, to drag from.
        'sticky top-2 z-20 order-first flex max-h-[42vh] min-h-0 flex-col gap-3 rounded-card bg-card p-4 shadow-soft transition-colors lg:top-4 lg:order-none lg:max-h-[calc(100vh-2rem)]',
        isOver && 'ring-2 ring-brand-secondary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base">
          {t('planning.volunteers.title')}{' '}
          <span className="text-muted-foreground">({planning.applications.length})</span>
        </h2>
        {editable && (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <UserPlus data-icon="inline-start" aria-hidden />
            {t('planning.volunteers.add')}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          placeholder={t('planning.volunteers.search')}
          aria-label={t('planning.volunteers.search')}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="h-9"
        />
        {planning.teams.length > 0 && (
          <NativeSelect
            aria-label={t('planning.volunteers.preferredTeam')}
            value={filters.teamId}
            onChange={(e) => setFilters((f) => ({ ...f, teamId: e.target.value }))}
            className="h-9"
          >
            <option value="all">{t('planning.volunteers.allTeams')}</option>
            {planning.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {t('planning.volunteers.prefers', { team: team.name })}
              </option>
            ))}
            <option value="none">{t('planning.volunteers.noPreference')}</option>
          </NativeSelect>
        )}
      </div>
      {editable && planning.applications.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('planning.volunteers.dragHint')}</p>
      )}
      <ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1 pb-1">
        {planning.applications.length === 0 && (
          <li className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
            {t('planning.volunteers.empty')}
          </li>
        )}
        {planning.applications.length > 0 && shown.length === 0 && (
          <li className="p-2 text-sm text-muted-foreground">
            {t('planning.volunteers.noMatches')}
          </li>
        )}
        {shown.map((application) => (
          <li key={application.id}>
            <VolunteerCard
              application={application}
              event={event}
              teamName={
                application.preferredTeamId ? teamName.get(application.preferredTeamId) : undefined
              }
              editable={editable}
              pending={pending}
              onOpen={() => onOpen(application)}
              onNotify={() => onNotify(application)}
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function VolunteerCard({
  application,
  event,
  teamName,
  editable,
  pending,
  onOpen,
  onNotify,
}: {
  application: Application;
  event: Event;
  teamName?: string;
  editable: boolean;
  pending: boolean;
  onOpen: () => void;
  onNotify: () => void;
}) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `volunteer:${application.id}`,
    data: { kind: 'volunteer', application } satisfies Dragged,
    disabled: !editable,
  });
  const needed = shiftsNeeded(application, event);
  const assigned = application.assignments.length;
  const done = needed === null ? assigned > 0 : needed === 0;
  const hasIssues = application.assignments.some((a) => a.issues.length > 0);

  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-2 rounded-2xl border-2 border-transparent bg-muted/50 p-2.5 transition-opacity',
        done && !application.pendingNotice && 'opacity-60',
        application.pendingNotice && 'border-status-warn-bg bg-status-warn-bg/40',
        isDragging && 'opacity-30',
      )}
    >
      <button
        ref={setNodeRef}
        type="button"
        onClick={onOpen}
        className={cn(
          'flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          editable && 'cursor-grab touch-manipulation active:cursor-grabbing',
        )}
        {...attributes}
        {...listeners}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="truncate font-bold">{application.name}</span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 text-xs font-bold',
              done ? 'bg-status-ok-bg text-status-ok' : 'bg-status-bad-bg text-status-bad',
            )}
          >
            {needed === null
              ? t('planning.volunteers.assignedCount', { count: assigned })
              : t('planning.board.coverageValue', {
                  filled: assigned,
                  capacity: event.shiftsPerVolunteer,
                })}
          </span>
        </span>
        <span className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {teamName && (
            <span className="inline-flex items-center gap-0.5 font-bold text-primary">
              <Star className="size-3" aria-hidden />
              {teamName}
            </span>
          )}
          <span>
            {application.wholeEvent
              ? t('planning.volunteers.wholeEventShort')
              : t('planning.volunteers.markedCount', {
                  count: application.availableShiftIds.length,
                })}
          </span>
          {hasIssues && (
            <span className="inline-flex items-center gap-0.5 font-bold text-status-warn">
              <CircleAlert className="size-3" aria-hidden />
              {t('planning.volunteers.hasIssues')}
            </span>
          )}
        </span>
      </button>
      {(application.notes || application.phone || application.email) && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('planning.volunteers.details', { name: application.name })}
              className={cn(application.notes && 'text-primary')}
            >
              <MessageSquareText aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-sm">
            <ContactDetails application={application} />
          </PopoverContent>
        </Popover>
      )}
      {application.pendingNotice && (
        <div className="flex w-full items-center justify-between gap-2 border-t border-status-warn-bg pt-2">
          <span className="text-xs font-bold text-status-warn">
            {t(`planning.notify.pending.${application.pendingNotice}`)}
          </span>
          {editable && (
            <Button size="xs" variant="secondary" disabled={pending} onClick={onNotify}>
              <MailCheck data-icon="inline-start" aria-hidden />
              {t('planning.notify.button')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ContactDetails({ application }: { application: Application }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      {application.notes && (
        <p className="whitespace-pre-wrap">
          <span className="block text-xs font-bold text-muted-foreground">
            {t('planning.volunteers.notes')}
          </span>
          {application.notes}
        </p>
      )}
      {application.email && (
        <a href={`mailto:${application.email}`} className="truncate font-semibold text-primary">
          {application.email}
        </a>
      )}
      {application.phone && (
        <a href={`tel:${application.phone}`} className="font-semibold text-primary">
          {application.phone}
        </a>
      )}
    </div>
  );
}

/** For members who may look but not change: the volunteer's choices and notes. */
function VolunteerDetails({
  application,
  planning,
}: {
  application: Application;
  planning: Planning;
}) {
  const t = useTranslations();
  const team = planning.teams.find((x) => x.id === application.preferredTeamId);
  const marked = planning.shifts.filter((s) => application.availableShiftIds.includes(s.id));
  return (
    <div className="flex flex-col gap-4 text-sm">
      {team && <p>{t('planning.volunteers.prefers', { team: team.name })}</p>}
      <p>
        {application.wholeEvent
          ? t('planning.volunteers.wholeEvent')
          : marked
              .map((s) => `${formatShortDay(shiftDay(s))} ${formatShiftTime(s.startsAt, s.endsAt)}`)
              .join(', ')}
      </p>
      <ContactDetails application={application} />
    </div>
  );
}
