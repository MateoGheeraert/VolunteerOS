import type { TaskDraftContextInput } from '../task-drafts/task-drafts.context.js';
import type { DraftTask } from '../task-drafts/task-drafts.plan.js';

/** Live evaluation cases for "Help me taken maken" (see run-evals.ts). */
export interface DraftEvalCase {
  name: string;
  input: TaskDraftContextInput;
  checks: { name: string; pass: (tasks: DraftTask[]) => boolean }[];
}

const base = (text: string): TaskDraftContextInput => ({
  language: 'nl-BE',
  today: '2026-11-19',
  event: { name: 'Kerstmarkt 2026', startDate: '2026-12-12', endDate: '2026-12-12' },
  members: [
    { userId: 'user-jan', name: 'Jan Peeters' },
    { userId: 'user-lotte', name: 'Lotte Claes' },
  ],
  currentTasks: [{ title: 'Standhouders mailen' }],
  text,
});

const titled = (tasks: DraftTask[], pattern: RegExp) =>
  tasks.find((task) => pattern.test(task.title.toLowerCase()));

export const TASK_DRAFT_CASES: DraftEvalCase[] = [
  {
    name: 'A quick comma list with a date and a member',
    input: base('tent huren tegen 1 dec, glühwein bestellen, jan doet de kassa'),
    checks: [
      { name: 'three tasks', pass: (tasks) => tasks.length === 3 },
      {
        name: 'tent due on 2026-12-01',
        pass: (tasks) => titled(tasks, /tent/)?.dueDate === '2026-12-01',
      },
      {
        name: 'kassa assigned to Jan (a member)',
        pass: (tasks) => titled(tasks, /kassa/)?.assigneeUserId === 'user-jan',
      },
      {
        name: 'no invented due dates',
        pass: (tasks) => titled(tasks, /glühwein|gluhwein/)?.dueDate === null,
      },
    ],
  },
  {
    name: 'A pasted message with someone outside the organization',
    input: base(
      'Hey! Voor de markt nog regelen: de brouwerij (Piet van De Plukker) moet de tap leveren de dag ervoor. ' +
        'Lotte maakt de affiches, liefst snel. En iemand moet de standhouders mailen.',
    ),
    checks: [
      { name: 'at least two tasks', pass: (tasks) => tasks.length >= 2 },
      {
        name: 'tap delivery due the day before the event',
        pass: (tasks) => titled(tasks, /tap/)?.dueDate === '2026-12-11',
      },
      {
        name: 'Piet kept as a typed-in name',
        pass: (tasks) => /piet/i.test(titled(tasks, /tap/)?.assigneeName ?? ''),
      },
      {
        name: 'affiches assigned to Lotte, high priority',
        pass: (tasks) => {
          const posters = titled(tasks, /affiche/);
          return posters?.assigneeUserId === 'user-lotte' && posters.priority === 'high';
        },
      },
      {
        name: 'mailing the stallholders flagged as existing',
        pass: (tasks) => titled(tasks, /standhouder/)?.duplicateOf === 'Standhouders mailen',
      },
    ],
  },
];
