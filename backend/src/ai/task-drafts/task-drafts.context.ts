/** What a drafting run tells the model. Dates are Brussels calendar days. */
export interface TaskDraftContextInput {
  language: string;
  today: string;
  event: { name: string; startDate: string; endDate: string };
  /** The organization's members, so "Jan doet de kassa" can become an assignment. */
  members: { userId: string; name: string }[];
  currentTasks: { title: string }[];
  /** The organizer's own list, as typed or pasted. */
  text: string;
}

export interface TaskDraftContext {
  prompt: string;
  /** Short member reference used in the prompt (U1) → user id. */
  memberRefs: Map<string, string>;
}

export function buildTaskDraftContext(input: TaskDraftContextInput): TaskDraftContext {
  const memberRefs = new Map<string, string>();
  const lines = [
    `today: ${input.today}`,
    `output language: ${input.language}`,
    `event: ${input.event.name}, ${input.event.startDate} to ${input.event.endDate}`,
    '',
    'Members (assign by reference):',
  ];
  input.members.forEach((member, index) => {
    const ref = `U${index + 1}`;
    memberRefs.set(ref, member.userId);
    lines.push(`[${ref}] ${member.name}`);
  });
  if (input.members.length === 0) lines.push('none');

  lines.push('', 'Tasks the event already has:');
  for (const task of input.currentTasks) lines.push(`- ${task.title}`);
  if (input.currentTasks.length === 0) lines.push('none');

  lines.push('', "The organizer's list:", '"""', input.text.trim(), '"""');
  return { prompt: lines.join('\n'), memberRefs };
}
