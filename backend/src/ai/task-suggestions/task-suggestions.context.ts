import type { Citation } from '../ai.types.js';
import { AI_EVENT_FIELDS } from '../ai.types.js';

/** Everything a task-suggestion run may tell the model. Dates are Brussels calendar days. */
export interface TaskSuggestionContextInput {
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
  previousEdition: {
    id: string;
    name: string;
    startDate: string;
    actualAttendance: number | null;
    retrospective: string | null;
    tasks: {
      id: string;
      title: string;
      description: string | null;
      priority: string;
      status: string;
      dueDate: string | null;
    }[];
  } | null;
  currentTasks: { id: string; title: string }[];
  memories: {
    id: string;
    content: string;
    scope: 'event' | 'organization';
    copiedFromPreviousEdition: boolean;
  }[];
  answeredQuestions: { question: string; answer: string }[];
  /** Earlier suggestions for this event, so the model doesn't repeat them. */
  earlierSuggestions: { title: string; status: string }[];
}

export interface TaskSuggestionContext {
  prompt: string;
  /** Short reference used in the prompt → the record it stands for. */
  refs: Map<string, Citation>;
}

/**
 * The run's prompt: the event and its history as numbered records. The model cites the
 * references (E, P1, T2, M3); ids stay on the server, so a cited reference can always be checked.
 */
export function buildTaskSuggestionContext(
  input: TaskSuggestionContextInput,
): TaskSuggestionContext {
  const refs = new Map<string, Citation>();
  const lines: string[] = [];
  const { event, previousEdition } = input;

  lines.push(`today: ${input.today}`, `output language: ${input.language}`, '');

  refs.set('E', { type: 'event', id: event.id, label: event.name });
  lines.push(`Event:`, `[E] ${event.name}`, `type: ${event.eventType}`);
  lines.push(
    `dates: ${event.startDate} to ${event.endDate} (${daysBetween(event.startDate, event.endDate) + 1} day${event.startDate === event.endDate ? '' : 's'})`,
  );
  if (event.description) lines.push(`description: ${event.description}`);
  if (event.location) lines.push(`location: ${event.location}`);
  if (event.expectedAttendance !== null)
    lines.push(`expected attendance: ${event.expectedAttendance}`);
  const empty = AI_EVENT_FIELDS.filter((field) => event[field] === null || event[field] === '');
  lines.push(`empty fields: ${empty.length > 0 ? empty.join(', ') : 'none'}`, '');

  if (previousEdition) {
    refs.set('P', { type: 'event', id: previousEdition.id, label: previousEdition.name });
    lines.push(
      `Previous edition:`,
      `[P] ${previousEdition.name}`,
      `starts: ${previousEdition.startDate}`,
    );
    if (previousEdition.actualAttendance !== null) {
      lines.push(`actual attendance: ${previousEdition.actualAttendance}`);
    }
    if (previousEdition.retrospective) {
      lines.push(`lessons learned: ${previousEdition.retrospective}`);
    }
    lines.push(`Its tasks:`);
    previousEdition.tasks.forEach((task, index) => {
      const ref = `P${index + 1}`;
      refs.set(ref, { type: 'task', id: task.id, label: task.title });
      const due = task.dueDate
        ? `due ${daysBetween(task.dueDate, previousEdition.startDate)} days before`
        : 'no due date';
      const parts = [`[${ref}] ${task.title}`, `priority ${task.priority}`, task.status, due];
      if (task.description) parts.push(task.description);
      lines.push(parts.join(' | '));
    });
    if (previousEdition.tasks.length === 0) lines.push('none');
  } else {
    lines.push('No previous edition.');
  }
  lines.push('');

  if (input.currentTasks.length === 0) {
    lines.push('Current tasks: none');
  } else {
    lines.push('Current tasks (already planned, do not suggest again):');
    input.currentTasks.forEach((task, index) => {
      const ref = `T${index + 1}`;
      refs.set(ref, { type: 'task', id: task.id, label: task.title });
      lines.push(`[${ref}] ${task.title}`);
    });
  }
  lines.push('');

  if (input.memories.length === 0) {
    lines.push('Memory: none');
  } else {
    lines.push('Memory (facts noted earlier):');
    input.memories.forEach((memory, index) => {
      const ref = `M${index + 1}`;
      refs.set(ref, { type: 'memory', id: memory.id, label: memory.content });
      const scope = memory.copiedFromPreviousEdition
        ? `${memory.scope}, from last year`
        : memory.scope;
      lines.push(`[${ref}] (${scope}) ${memory.content}`);
    });
  }
  lines.push('');

  if (input.answeredQuestions.length > 0) {
    lines.push('Answers the organizer gave:');
    for (const answered of input.answeredQuestions) {
      lines.push(`Q: ${answered.question} A: ${answered.answer}`);
    }
    lines.push('');
  }

  if (input.earlierSuggestions.length > 0) {
    lines.push('Suggested before (do not repeat):');
    for (const suggestion of input.earlierSuggestions) {
      lines.push(`- ${suggestion.title} (${suggestion.status})`);
    }
  }

  return { prompt: lines.join('\n').trim(), refs };
}

/** Whole days from `from` to `to` (calendar dates). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
