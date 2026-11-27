import {
  brusselsClock,
  clockToMinutes,
  fromBrussels,
  addDays,
} from '../../features/planning/brussels-time.js';
import type { Citation } from '../ai.types.js';
import type { ShiftChangePayload, TeamSuggestionPayload } from '../planning/planning-payloads.js';
import type { ShiftRef, TeamRef } from './shift-suggestions.context.js';
import type { ShiftSuggestionOutput } from './shift-suggestions.schema.js';

/** A team never gets more suggested shifts than this; a run never more cards. */
export const MAX_SHIFTS_PER_TEAM = 8;
export const MAX_CARDS_PER_RUN = 10;
const MAX_CAPACITY = 500;

export interface ShiftPlanState {
  /** When shifts may happen. */
  window: { startsAt: Date; endsAt: Date };
  /** The event's team names now (any case). */
  existingTeamNames: string[];
  teamRefs: ReadonlyMap<string, TeamRef>;
  shiftRefs: ReadonlyMap<string, ShiftRef>;
}

export interface PlannedPlanningCard {
  kind: 'team_suggestion' | 'shift_change';
  dedupKey: string;
  title: string;
  explanation: string;
  payload: TeamSuggestionPayload | ShiftChangePayload;
  citations: Citation[];
}

export interface DroppedCard {
  kind: PlannedPlanningCard['kind'];
  title: string;
  reason: 'unbacked' | 'exists' | 'duplicate' | 'invalid' | 'no_change' | 'too_many';
}

export interface ShiftPlan {
  cards: PlannedPlanningCard[];
  dropped: DroppedCard[];
}

/**
 * Turns the model's output into cards, applying every rule it may miss: cited records only,
 * shifts inside the event's window and ending after they start, sane capacities, no team that
 * exists, no change that changes nothing.
 */
export function planShiftSuggestions(
  output: ShiftSuggestionOutput,
  refs: ReadonlyMap<string, Citation>,
  state: ShiftPlanState,
): ShiftPlan {
  const cards: PlannedPlanningCard[] = [];
  const dropped: DroppedCard[] = [];
  const existing = new Set(state.existingTeamNames.map(normalize));
  const seen = new Set<string>();
  const full = () => cards.length >= MAX_CARDS_PER_RUN;

  for (const item of output.newTeams) {
    const name = item.name.trim().slice(0, 100);
    const citations = resolve(item.cites, refs);
    const key = `team:${normalize(name)}`;
    const drop = (reason: DroppedCard['reason']) =>
      dropped.push({ kind: 'team_suggestion', title: name, reason });
    if (!citations) {
      drop('unbacked');
      continue;
    }
    if (!name || existing.has(normalize(name))) {
      drop('exists');
      continue;
    }
    if (seen.has(key)) {
      drop('duplicate');
      continue;
    }
    const shifts: TeamSuggestionPayload['shifts'] = [];
    const starts = new Set<number>();
    for (const shift of item.shifts) {
      const slot = toSlot(shift.day, shift.start, shift.end, state.window, { trim: true });
      const capacity = Math.round(shift.capacity);
      if (!slot || capacity < 1 || capacity > MAX_CAPACITY) continue;
      if (starts.has(slot.startsAt.getTime())) continue;
      starts.add(slot.startsAt.getTime());
      shifts.push({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        capacity,
        requested: requestedOf(slot),
      });
    }
    if (shifts.length === 0) {
      drop('invalid');
      continue;
    }
    if (full()) {
      drop('too_many');
      continue;
    }
    seen.add(key);
    shifts.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    cards.push({
      kind: 'team_suggestion',
      dedupKey: key,
      title: name,
      explanation: item.reason.trim(),
      payload: {
        name,
        description: item.description?.trim().slice(0, 2000) || null,
        defaultMeetingPoint: item.meetingPoint?.trim().slice(0, 200) || null,
        shifts: shifts.slice(0, MAX_SHIFTS_PER_TEAM),
      },
      citations,
    });
  }

  for (const item of output.changes) {
    const team = state.teamRefs.get(item.team);
    const citations = resolve(item.cites, refs);
    const title = team ? team.name : item.team;
    const drop = (reason: DroppedCard['reason']) =>
      dropped.push({ kind: 'shift_change', title, reason });
    if (!team || !citations) {
      drop('unbacked');
      continue;
    }
    const capacity = Math.round(item.capacity);
    if (capacity < 1 || capacity > MAX_CAPACITY) {
      drop('invalid');
      continue;
    }

    let card: PlannedPlanningCard;
    if (item.type === 'capacity') {
      const shift = item.shift ? state.shiftRefs.get(item.shift) : undefined;
      if (!shift || shift.teamId !== team.id) {
        drop('unbacked');
        continue;
      }
      if (shift.capacity === capacity) {
        drop('no_change');
        continue;
      }
      card = {
        kind: 'shift_change',
        dedupKey: `shift:capacity:${shift.id}:${capacity}`,
        title: `${team.name} ${brusselsClock(shift.startsAt)}–${brusselsClock(shift.endsAt)}: ${shift.capacity} → ${capacity}`,
        explanation: item.reason.trim(),
        payload: {
          type: 'capacity',
          teamId: team.id,
          teamName: team.name,
          shiftId: shift.id,
          startsAt: shift.startsAt.toISOString(),
          endsAt: shift.endsAt.toISOString(),
          fromCapacity: shift.capacity,
          capacity,
        },
        citations,
      };
    } else {
      const slot =
        item.day && item.start && item.end
          ? toSlot(item.day, item.start, item.end, state.window, { trim: true })
          : null;
      if (!slot) {
        drop('invalid');
        continue;
      }
      const taken = [...state.shiftRefs.values()].some(
        (shift) => shift.teamId === team.id && shift.startsAt.getTime() === slot.startsAt.getTime(),
      );
      if (taken) {
        drop('exists');
        continue;
      }
      card = {
        kind: 'shift_change',
        dedupKey: `shift:add:${team.id}:${slot.startsAt.toISOString()}`,
        title: `${team.name}: extra shift ${brusselsClock(slot.startsAt)}–${brusselsClock(slot.endsAt)}`,
        explanation: item.reason.trim(),
        payload: {
          type: 'add_shift',
          teamId: team.id,
          teamName: team.name,
          shiftId: null,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          fromCapacity: null,
          capacity,
          requested: requestedOf(slot),
        },
        citations,
      };
    }
    if (seen.has(card.dedupKey)) {
      drop('duplicate');
      continue;
    }
    if (full()) {
      drop('too_many');
      continue;
    }
    seen.add(card.dedupKey);
    cards.push(card);
  }

  return { cards, dropped };
}

/** A shift cut to the event's hours keeps at least this much; shorter is dropped. */
const MIN_TRIMMED_MS = 60 * 60 * 1000;

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** The times asked for, when they ran past the event's hours and were cut to them. */
  requested: { startsAt: Date; endsAt: Date } | null;
}

/**
 * A Brussels day and clock times as a shift, or null when the times are invalid or it falls
 * outside the window. An end at or before the start runs past midnight. With `trim`, a shift
 * that only partly falls outside the window (21:00–01:00 at an event that closes at 23:00) is
 * cut to it, keeping the times asked for, as long as at least an hour is left.
 */
export function toSlot(
  day: string,
  start: string,
  end: string,
  window: { startsAt: Date; endsAt: Date },
  { trim = false }: { trim?: boolean } = {},
): Slot | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from === null || to === null) return null;
  const startsAt = fromBrussels(day, start);
  const endsAt = fromBrussels(to > from ? day : addDays(day, 1), end);
  if (Number.isNaN(startsAt.getTime()) || endsAt <= startsAt) return null;
  if (startsAt >= window.startsAt && endsAt <= window.endsAt) {
    return { startsAt, endsAt, requested: null };
  }
  if (!trim) return null;
  const trimmedStart = startsAt < window.startsAt ? window.startsAt : startsAt;
  const trimmedEnd = endsAt > window.endsAt ? window.endsAt : endsAt;
  if (trimmedEnd.getTime() - trimmedStart.getTime() < MIN_TRIMMED_MS) return null;
  return { startsAt: trimmedStart, endsAt: trimmedEnd, requested: { startsAt, endsAt } };
}

const requestedOf = (slot: Slot) =>
  slot.requested
    ? {
        startsAt: slot.requested.startsAt.toISOString(),
        endsAt: slot.requested.endsAt.toISOString(),
      }
    : null;

/** The cited records, or null when nothing is cited or any reference is unknown. */
function resolve(cites: string[], refs: ReadonlyMap<string, Citation>): Citation[] | null {
  const unique = [...new Set(cites.map((cite) => cite.replace(/[[\]]/g, '').trim()))];
  if (unique.length === 0) return null;
  const citations = unique.map((ref) => refs.get(ref));
  return citations.every((citation) => citation !== undefined) ? citations : null;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
