import type {
  AiEventField,
  Citation,
  QuestionPayload,
  TaskSuggestionPayload,
  UpdateEventPayload,
} from '../ai.types.js';
import { normalizeEventFieldValue } from '../event-fields.js';
import type { TaskSuggestionOutput } from './task-suggestions.schema.js';

/** What the planner needs to know about the event right now. Dates are Brussels calendar days. */
export interface PlanState {
  eventStartDate: string;
  today: string;
  existingTaskTitles: string[];
  emptyEventFields: AiEventField[];
  openQuestionCount: number;
  existingMemoryContents: string[];
}

export interface PlannedSuggestion {
  kind: 'task_suggestion' | 'question' | 'update_event';
  dedupKey: string;
  title: string;
  explanation: string;
  payload: unknown;
  citations: Citation[];
}

/** An output item the planner left out, and why: logged as an evaluation signal. */
export interface DroppedItem {
  kind: PlannedSuggestion['kind'] | 'memory';
  title: string;
  reason: 'unbacked' | 'exists' | 'duplicate' | 'field_filled' | 'too_many' | 'invalid_value';
}

export interface PlannedMemory {
  content: string;
  scope: 'event' | 'organization';
  confidence: 'low' | 'medium' | 'high';
  citations: Citation[];
}

export interface Plan {
  suggestions: PlannedSuggestion[];
  memories: PlannedMemory[];
  dropped: DroppedItem[];
}

/** Turns a model's output into the suggestions to save, applying every rule the model may miss. */
export function planTaskSuggestions(
  output: TaskSuggestionOutput,
  refs: ReadonlyMap<string, Citation>,
  state: PlanState,
): Plan {
  const suggestions: PlannedSuggestion[] = [];
  const dropped: DroppedItem[] = [];
  const existingTasks = new Set(state.existingTaskTitles.map(normalize));
  const seen = new Set<string>();
  for (const task of output.tasks) {
    const key = `task:${normalize(task.title)}`;
    const citations = resolve(task.cites, refs);
    let reason: DroppedItem['reason'] | null = null;
    if (!citations) reason = 'unbacked';
    else if (existingTasks.has(normalize(task.title))) reason = 'exists';
    else if (seen.has(key)) reason = 'duplicate';
    if (reason || !citations) {
      dropped.push({ kind: 'task_suggestion', title: task.title, reason: reason ?? 'unbacked' });
      continue;
    }
    seen.add(key);
    const dueDate =
      task.daysBeforeEvent === null ? null : addDays(state.eventStartDate, -task.daysBeforeEvent);
    // Within the payload schema's limits: one over-long row would make every read fail.
    const payload: TaskSuggestionPayload = {
      title: task.title.trim().slice(0, 200),
      description: task.description?.trim().slice(0, 2000) || null,
      priority: task.priority,
      dueDate: dueDate !== null && dueDate >= state.today ? dueDate : null,
    };
    suggestions.push({
      kind: 'task_suggestion',
      dedupKey: key,
      title: payload.title,
      explanation: task.reason,
      payload,
      citations,
    });
  }

  const emptyFields = new Set(state.emptyEventFields);
  let openQuestions = state.openQuestionCount;
  for (const item of output.questions) {
    const title = item.question.trim();
    const key = item.eventField
      ? `question:field:${item.eventField}`
      : `question:${normalize(item.question)}`;
    let reason: DroppedItem['reason'] | null = null;
    if (item.eventField && !emptyFields.has(item.eventField)) reason = 'field_filled';
    else if (seen.has(key)) reason = 'duplicate';
    else if (openQuestions >= MAX_OPEN_QUESTIONS) reason = 'too_many';
    if (reason) {
      dropped.push({ kind: 'question', title, reason });
      continue;
    }
    seen.add(key);
    openQuestions++;
    const payload: QuestionPayload = {
      options: item.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0 && option.length <= 100)
        .slice(0, 6),
      eventField: item.eventField,
    };
    suggestions.push({
      kind: 'question',
      dedupKey: key,
      title,
      explanation: item.reason,
      payload,
      citations: [],
    });
  }

  for (const item of output.eventUpdates) {
    const key = `field:${item.field}`;
    const citations = resolve(item.cites, refs);
    const value = normalizeEventFieldValue(item.field, item.value);
    let reason: DroppedItem['reason'] | null = null;
    if (!emptyFields.has(item.field)) reason = 'field_filled';
    else if (!citations) reason = 'unbacked';
    else if (value === null) reason = 'invalid_value';
    else if (seen.has(key)) reason = 'duplicate';
    if (reason || !citations || value === null) {
      dropped.push({ kind: 'update_event', title: item.value, reason: reason ?? 'unbacked' });
      continue;
    }
    seen.add(key);
    const payload: UpdateEventPayload = { field: item.field, value };
    suggestions.push({
      kind: 'update_event',
      dedupKey: key,
      title: value,
      explanation: item.reason,
      payload,
      citations,
    });
  }

  const memories: PlannedMemory[] = [];
  const knownFacts = new Set(state.existingMemoryContents.map(normalize));
  for (const item of output.memories) {
    const fact = normalize(item.content);
    const citations = resolve(item.cites, refs);
    let reason: DroppedItem['reason'] | null = null;
    if (!citations) reason = 'unbacked';
    else if (knownFacts.has(fact)) reason = 'exists';
    else if (memories.length >= MAX_NEW_MEMORIES) reason = 'too_many';
    if (reason || !citations) {
      dropped.push({ kind: 'memory', title: item.content, reason: reason ?? 'unbacked' });
      continue;
    }
    knownFacts.add(fact);
    memories.push({
      content: item.content.trim(),
      scope: item.scope,
      confidence: item.confidence,
      citations,
    });
  }

  return { suggestions, memories, dropped };
}

/**
 * The pending cards whose cause went away: the task was created by hand, or the field they ask
 * about or fill in got a value. Questions without a field never go stale by themselves.
 */
export function staleSuggestionKeys(pendingKeys: string[], state: PlanState): string[] {
  const existingTasks = new Set(
    state.existingTaskTitles.map((title) => `task:${normalize(title)}`),
  );
  const emptyFields = new Set<string>(state.emptyEventFields);
  return pendingKeys.filter((key) => {
    if (key.startsWith('task:')) return existingTasks.has(key);
    const field = /^(?:field|question:field):(.+)$/.exec(key)?.[1];
    return field !== undefined && !emptyFields.has(field);
  });
}

/** New memories one run may write, so a chatty model can't flood them. */
export const MAX_NEW_MEMORIES = 5;

/** Questions are for filling gaps, not an interview: never more than this many open at once. */
export const MAX_OPEN_QUESTIONS = 3;

/** The cited records, or null when nothing is cited or any reference is unknown. */
function resolve(cites: string[], refs: ReadonlyMap<string, Citation>): Citation[] | null {
  const unique = [...new Set(cites)];
  if (unique.length === 0) return null;
  const citations = unique.map((ref) => refs.get(ref));
  return citations.every((citation) => citation !== undefined) ? citations : null;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** `YYYY-MM-DD` plus `days`, as a calendar date (no time zone involved). */
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
