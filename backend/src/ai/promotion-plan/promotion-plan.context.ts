import type { PromotionAudience } from '../../db/schema/index.js';
import { daysBetween, type SizeBand } from '../../features/promotion/promotion-rules.js';
import type { Citation } from '../ai.types.js';
import type { PromoCatalogItem } from './promotion-catalog.js';

/** How the prompt names each audience: the words the organizer picked them by. */
const AUDIENCE_NAMES: Record<PromotionAudience, string> = {
  children: 'kinderen (<12)',
  teens: 'tieners (12–16)',
  young_adults: 'jongeren 16–25',
  students: 'studenten',
  young_families: 'jonge gezinnen',
  families: 'gezinnen',
  adults: 'volwassenen',
  seniors: 'senioren',
  neighbours: 'buurtbewoners',
  associations: 'verenigingen/jeugdbewegingen',
  music_lovers: 'muziekliefhebbers',
  culture_lovers: 'cultuurliefhebbers',
  sporty: 'sportievelingen',
};

export interface PromotionBudgetLineInput {
  title: string;
  estimatedCents: number | null;
  actualCents: number | null;
  notes: string | null;
}

/** Everything a promotion-plan run may tell the model. Dates are Brussels calendar days. */
export interface PromotionPlanContextInput {
  language: string;
  today: string;
  event: {
    id: string;
    name: string;
    eventType: string;
    description: string | null;
    location: string | null;
    startDate: string;
    endDate: string;
    expectedAttendance: number | null;
  };
  audience: {
    audiences: PromotionAudience[];
    description: string | null;
    ageMin: number | null;
    ageMax: number | null;
    region: string | null;
    entryPriceCents: number | null;
    pitch: string | null;
  };
  sizeBand: SizeBand | null;
  lastMinute: boolean;
  budget: { budgetCents: number | null; spentCents: number; availableCents: number | null };
  /** The most one action may cost when there is no budget. */
  cheapMaxCents: number;
  /** The actions that fit this event (already filtered). */
  catalog: PromoCatalogItem[];
  previousEdition: {
    id: string;
    name: string;
    startDate: string;
    expectedAttendance: number | null;
    actualAttendance: number | null;
    retrospective: string | null;
    promotionTasks: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      dueDate: string | null;
      budgetLines: PromotionBudgetLineInput[];
    }[];
    /** Promotie budget lines not linked to one of those tasks. */
    otherBudgetLines: PromotionBudgetLineInput[];
  } | null;
  /** Promotie tasks the event already has. */
  currentPromotionTasks: { id: string; title: string; dueDate: string | null; status: string }[];
  /** Earlier promo suggestions, so the model doesn't repeat them. */
  earlierSuggestions: { title: string; status: string }[];
  /** What the organizer asked for this run. */
  instruction: string | null;
}

export interface PromotionPlanContext {
  prompt: string;
  /** Short reference used in the prompt → the record it stands for. */
  refs: Map<string, Citation>;
  /** Catalogue reference (C3) → its key, so the planner knows which action was adapted. */
  catalogRefs: Map<string, PromoCatalogItem>;
}

const euros = (cents: number) => `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * The run's prompt: the event, its Publiek, the catalogue actions that fit, and last year's
 * promotion as numbered records. The model cites the references (C2, P1); ids stay on the server.
 */
export function buildPromotionPlanContext(input: PromotionPlanContextInput): PromotionPlanContext {
  const refs = new Map<string, Citation>();
  const catalogRefs = new Map<string, PromoCatalogItem>();
  const lines: string[] = [];
  const { event, audience, previousEdition } = input;
  const daysLeft = daysBetween(input.today, event.startDate);

  lines.push(`today: ${input.today}`, `output language: ${input.language}`, '');

  refs.set('E', { type: 'event', id: event.id, label: event.name });
  lines.push('Event:', `[E] ${event.name}`, `type: ${event.eventType}`);
  lines.push(
    `starts: ${event.startDate} (in ${daysLeft} days, ${Math.floor(daysLeft / 7)} weeks)`,
    `ends: ${event.endDate}`,
  );
  if (event.description) lines.push(`description: ${event.description}`);
  if (event.location) lines.push(`location: ${event.location}`);
  lines.push(
    event.expectedAttendance === null
      ? 'expected visitors: unknown'
      : `expected visitors: ${event.expectedAttendance}`,
    `size band: ${input.sizeBand ?? 'unknown'} (S <300, M 300–2000, L >2000)`,
  );
  if (input.lastMinute) {
    lines.push('LAST MINUTE: under 3 weeks to go, only actions that can still be done in time.');
  }
  lines.push('');

  lines.push('Audience (Publiek):');
  lines.push(`target groups: ${audience.audiences.map((a) => AUDIENCE_NAMES[a]).join(', ')}`);
  if (audience.description) lines.push(`described as: ${audience.description}`);
  if (audience.ageMin !== null || audience.ageMax !== null) {
    lines.push(`ages: ${audience.ageMin ?? '?'}–${audience.ageMax ?? '?'}`);
  }
  if (audience.region) lines.push(`region: ${audience.region}`);
  if (audience.entryPriceCents !== null) {
    lines.push(
      `entry: ${audience.entryPriceCents === 0 ? 'free' : euros(audience.entryPriceCents)}`,
    );
  }
  lines.push(audience.pitch ? `pitch: ${audience.pitch}` : 'pitch: not filled in');
  lines.push('');

  lines.push('Promotion budget:');
  if (input.budget.budgetCents === null || input.budget.availableCents === null) {
    lines.push(`none set: only free or cheap actions, at most ${euros(input.cheapMaxCents)} each.`);
  } else {
    lines.push(
      `budget ${euros(input.budget.budgetCents)}, already spent or planned ${euros(input.budget.spentCents)}, available ${euros(input.budget.availableCents)} for all actions together.`,
    );
  }
  lines.push('');

  lines.push('Catalogue (the only actions you may propose, besides repeating last year):');
  input.catalog.forEach((item, index) => {
    const ref = `C${index + 1}`;
    refs.set(ref, { type: 'catalog', id: item.key, label: item.title });
    catalogRefs.set(ref, item);
    const cost =
      item.costMaxCents === 0 ? 'free' : `${euros(item.costMinCents)}–${euros(item.costMaxCents)}`;
    const audiences = item.audiences.length
      ? item.audiences.map((a) => AUDIENCE_NAMES[a]).join(', ')
      : 'everyone';
    lines.push(
      `[${ref}] ${item.title} | ${item.type} | for: ${audiences} | usually ${item.leadWeeks} weeks before | ${cost} | effort ${item.effort}`,
      `  how-to: ${item.howTo.replace(/\n/g, ' ')}`,
    );
  });
  if (input.catalog.length === 0) lines.push('none fit');
  lines.push('');

  if (previousEdition) {
    refs.set('P', { type: 'event', id: previousEdition.id, label: previousEdition.name });
    lines.push(
      'Previous edition:',
      `[P] ${previousEdition.name}`,
      `starts: ${previousEdition.startDate}`,
    );
    lines.push(
      `visitors: expected ${previousEdition.expectedAttendance ?? 'unknown'}, actual ${previousEdition.actualAttendance ?? 'unknown'}`,
    );
    if (previousEdition.retrospective) {
      lines.push(`lessons learned: ${previousEdition.retrospective}`);
    }
    lines.push('Its promotion tasks:');
    previousEdition.promotionTasks.forEach((task, index) => {
      const ref = `P${index + 1}`;
      refs.set(ref, { type: 'task', id: task.id, label: task.title });
      const due = task.dueDate
        ? `due ${daysBetween(task.dueDate, previousEdition.startDate)} days before`
        : 'no due date';
      const parts = [
        `[${ref}] ${task.title}`,
        task.status === 'done' ? 'done' : `NOT done (${task.status})`,
        due,
      ];
      if (task.description) parts.push(task.description);
      lines.push(parts.join(' | '));
      for (const line of task.budgetLines) lines.push(`  cost: ${budgetLine(line)}`);
    });
    if (previousEdition.promotionTasks.length === 0) lines.push('none');
    if (previousEdition.otherBudgetLines.length > 0) {
      lines.push('Its other promotion costs:');
      for (const line of previousEdition.otherBudgetLines) lines.push(`- ${budgetLine(line)}`);
    }
  } else {
    lines.push('No previous edition.');
  }
  lines.push('');

  if (input.currentPromotionTasks.length === 0) {
    lines.push('Promotion tasks already planned: none');
  } else {
    lines.push('Promotion tasks already planned (do not propose again):');
    input.currentPromotionTasks.forEach((task, index) => {
      const ref = `T${index + 1}`;
      refs.set(ref, { type: 'task', id: task.id, label: task.title });
      lines.push(`[${ref}] ${task.title} | ${task.status} | due ${task.dueDate ?? 'no date'}`);
    });
  }
  lines.push('');

  if (input.earlierSuggestions.length > 0) {
    lines.push('Suggested before (do not repeat):');
    for (const suggestion of input.earlierSuggestions) {
      lines.push(`- ${suggestion.title} (${suggestion.status})`);
    }
    lines.push('');
  }

  if (input.instruction) {
    lines.push(`The organizer asks: "${input.instruction}"`);
  }

  return { prompt: lines.join('\n').trim(), refs, catalogRefs };
}

function budgetLine(line: PromotionBudgetLineInput): string {
  const amounts = [
    line.estimatedCents !== null ? `estimated ${euros(line.estimatedCents)}` : null,
    line.actualCents !== null ? `actual ${euros(line.actualCents)}` : null,
  ].filter(Boolean);
  const parts = [line.title, ...amounts];
  if (line.notes) parts.push(`note: ${line.notes}`);
  return parts.join(' | ');
}
