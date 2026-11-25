import type { EventType } from '../../db/schema/index.js';
import {
  addDays,
  brusselsClock,
  brusselsDay,
  daysBetween,
  fromBrussels,
} from '../../features/planning/brussels-time.js';
import type { Citation } from '../ai.types.js';
import { describeBasis, headcount, STAFFING_CATALOGUE } from './staffing-catalogue.js';

interface ShiftInput {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  /** People on it, proposed or confirmed. */
  assigned: number;
}

interface TeamInput {
  id: string;
  name: string;
  description: string | null;
  defaultMeetingPoint: string | null;
  shifts: ShiftInput[];
}

/** Everything a shift-suggestion run may tell the model. */
export interface ShiftSuggestionContextInput {
  language: string;
  today: string;
  event: {
    id: string;
    name: string;
    eventType: EventType;
    startsAt: Date;
    endsAt: Date;
    /** When shifts may happen: setup start (else the start) to teardown end (else the end). */
    windowStartsAt: Date;
    windowEndsAt: Date;
    expectedAttendance: number | null;
    volunteerCount: number;
    /** Null when volunteers come for the whole event. */
    shiftsPerVolunteer: number | null;
  };
  previousEdition: {
    id: string;
    name: string;
    startsAt: Date;
    expectedAttendance: number | null;
    actualAttendance: number | null;
    retrospective: string | null;
    teams: TeamInput[];
  } | null;
  currentTeams: TeamInput[];
  /** What the organizer asked for ("twee shiften afwas, twee aan de bar"); null: Mila decides. */
  instruction?: string | null;
  /** Earlier planning cards of this event, so the model doesn't repeat them. */
  earlierSuggestions: { title: string; status: string }[];
}

export interface TeamRef {
  id: string;
  name: string;
}

export interface ShiftRef {
  id: string;
  teamId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

export interface ShiftSuggestionContext {
  prompt: string;
  /** Every citable reference → the record it stands for. */
  refs: Map<string, Citation>;
  /** `T1` → this event's team; `S1` → this event's shift. */
  teamRefs: Map<string, TeamRef>;
  shiftRefs: Map<string, ShiftRef>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-12-19 (Sat) 14:00". */
function when(at: Date): string {
  const day = brusselsDay(at);
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  return `${day} (${weekday}) ${brusselsClock(at)}`;
}

/** "2026-12-19 (Sat) 14:00–18:00", with the end day when it differs. */
function span(startsAt: Date, endsAt: Date): string {
  const sameDay =
    brusselsDay(startsAt) === brusselsDay(endsAt) || brusselsClock(endsAt) === '00:00';
  return `${when(startsAt)}–${sameDay ? brusselsClock(endsAt) : when(endsAt)}`;
}

const hours = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 360_000) / 10;

/**
 * A previous edition's shift moved to this edition: the same day relative to the event's start
 * and the same Brussels clock time, keeping its length. Done in code so the model never does
 * date arithmetic.
 */
export function moveShift(
  previousEventStart: Date,
  eventStart: Date,
  shift: { startsAt: Date; endsAt: Date },
): { startsAt: Date; endsAt: Date } {
  const offset = daysBetween(brusselsDay(previousEventStart), brusselsDay(shift.startsAt));
  const day = addDays(brusselsDay(eventStart), offset);
  const startsAt = fromBrussels(day, brusselsClock(shift.startsAt));
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + (shift.endsAt.getTime() - shift.startsAt.getTime())),
  };
}

/**
 * The run's prompt: the event, its previous edition (moved to this year's dates), its current
 * teams and the staffing rules of thumb, as numbered records the model cites (E, P, PT1, PS1, T1,
 * S1, C1). Ids stay on the server.
 */
export function buildShiftSuggestionContext(
  input: ShiftSuggestionContextInput,
): ShiftSuggestionContext {
  const refs = new Map<string, Citation>();
  const teamRefs = new Map<string, TeamRef>();
  const shiftRefs = new Map<string, ShiftRef>();
  const lines: string[] = [];
  const { event, previousEdition } = input;
  const openHours = hours(event.startsAt, event.endsAt);

  lines.push(`today: ${input.today}`, `output language: ${input.language}`, '');

  refs.set('E', { type: 'event', id: event.id, label: event.name });
  lines.push('Event:', `[E] ${event.name} | type ${event.eventType}`);
  lines.push(`opens ${when(event.startsAt)}, closes ${when(event.endsAt)} (${openHours} hours)`);
  lines.push(
    `shifts must fall between ${when(event.windowStartsAt)} and ${when(event.windowEndsAt)}` +
      (event.windowStartsAt < event.startsAt || event.windowEndsAt > event.endsAt
        ? ' (setup and teardown included)'
        : ' (no setup or teardown time set)'),
  );
  lines.push(
    `expected attendance: ${event.expectedAttendance ?? 'unknown'}`,
    `volunteers signed up so far: ${event.volunteerCount}` +
      (event.shiftsPerVolunteer === null
        ? ', each for the whole event'
        : `, each asked for ${event.shiftsPerVolunteer} shift(s)`),
    '',
  );

  if (previousEdition) {
    refs.set('P', { type: 'event', id: previousEdition.id, label: previousEdition.name });
    lines.push(
      'Previous edition:',
      `[P] ${previousEdition.name} | expected attendance ${previousEdition.expectedAttendance ?? 'unknown'}, actual ${previousEdition.actualAttendance ?? 'unknown'}`,
    );
    if (previousEdition.retrospective) {
      lines.push(`lessons learned: ${previousEdition.retrospective}`);
    }
    if (previousEdition.teams.length === 0) {
      lines.push('It had no teams in the app.');
    } else {
      lines.push("Its teams, with their shifts moved to this edition's dates:");
      let shiftIndex = 0;
      previousEdition.teams.forEach((team, index) => {
        const ref = `PT${index + 1}`;
        refs.set(ref, {
          type: 'team',
          id: team.id,
          label: `${team.name} (${previousEdition.name})`,
        });
        const extra = [
          team.defaultMeetingPoint && `meeting point ${team.defaultMeetingPoint}`,
          team.description,
        ]
          .filter(Boolean)
          .join(' | ');
        lines.push(`[${ref}] ${team.name}${extra ? ` | ${extra}` : ''}`);
        for (const shift of team.shifts) {
          const shiftRef = `PS${++shiftIndex}`;
          const moved = moveShift(previousEdition.startsAt, event.startsAt, shift);
          refs.set(shiftRef, {
            type: 'shift',
            id: shift.id,
            label: `${team.name} ${brusselsClock(shift.startsAt)}–${brusselsClock(shift.endsAt)} (${previousEdition.name})`,
          });
          lines.push(
            `  [${shiftRef}] ${span(moved.startsAt, moved.endsAt)}, capacity ${shift.capacity} (${shift.assigned} placed)`,
          );
        }
        if (team.shifts.length === 0) lines.push('  no shifts');
      });
    }
  } else {
    lines.push('No previous edition.');
  }
  lines.push('');

  if (input.currentTeams.length === 0) {
    lines.push('Current teams: none yet');
  } else {
    lines.push('Current teams and shifts (already planned; change them only with a shift change):');
    let shiftIndex = 0;
    input.currentTeams.forEach((team, index) => {
      const ref = `T${index + 1}`;
      refs.set(ref, { type: 'team', id: team.id, label: team.name });
      teamRefs.set(ref, { id: team.id, name: team.name });
      lines.push(`[${ref}] ${team.name}`);
      for (const shift of team.shifts) {
        const shiftRef = `S${++shiftIndex}`;
        refs.set(shiftRef, {
          type: 'shift',
          id: shift.id,
          label: `${team.name} ${brusselsClock(shift.startsAt)}–${brusselsClock(shift.endsAt)}`,
        });
        shiftRefs.set(shiftRef, {
          id: shift.id,
          teamId: team.id,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          capacity: shift.capacity,
        });
        lines.push(
          `  [${shiftRef}] ${span(shift.startsAt, shift.endsAt)}, capacity ${shift.capacity} (${shift.assigned} placed)`,
        );
      }
      if (team.shifts.length === 0) lines.push('  no shifts');
    });
  }
  lines.push('');

  const catalogue = STAFFING_CATALOGUE[event.eventType];
  lines.push(
    `Staffing rules of thumb for a ${event.eventType} (use them where the history says nothing):`,
  );
  catalogue.forEach((rule, index) => {
    const ref = `C${index + 1}`;
    refs.set(ref, { type: 'catalogue', id: `${event.eventType}:${rule.team}`, label: rule.team });
    const people = headcount(rule, event.expectedAttendance, openHours);
    const parts = [
      `[${ref}] ${rule.team} (${rule.phase})`,
      `${describeBasis(rule.basis)} → ${people} per shift${rule.basis.kind === 'fixed' || event.expectedAttendance === null ? '' : ` at ${event.expectedAttendance} visitors`}`,
      `shifts of ${rule.shiftHours[0]}–${rule.shiftHours[1]} h`,
      rule.description,
    ];
    if (rule.note) parts.push(rule.note);
    lines.push(parts.join(' | '));
  });
  lines.push('');

  if (input.earlierSuggestions.length > 0) {
    lines.push('Suggested before (do not repeat):');
    for (const suggestion of input.earlierSuggestions) {
      lines.push(`- ${suggestion.title} (${suggestion.status})`);
    }
    lines.push('');
  }

  if (input.instruction) {
    refs.set('R', { type: 'request', id: event.id, label: input.instruction.slice(0, 80) });
    lines.push(`[R] The organizer asks: "${input.instruction}"`);
  }

  return { prompt: lines.join('\n').trim(), refs, teamRefs, shiftRefs };
}
