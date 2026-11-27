/**
 * Prompts for reading planning rules from language (docs/info.md §7.7.1 B): the organizer's own
 * text ("Vertel Mila iets over de planning"), and the volunteers' notes before an allocation.
 * The event's volunteers (V1…) and teams (T1…) are numbered records; ids stay on the server.
 */

export interface PersonRef {
  volunteerId: string;
  name: string;
}

interface BaseInput {
  language: string;
  event: { name: string };
  teams: { name: string }[];
  /** The event's volunteers. */
  volunteers: PersonRef[];
}

export interface RuleTextContextInput extends BaseInput {
  text: string;
}

export interface NotesContextInput extends BaseInput {
  notes: { applicationId: string; volunteerId: string; text: string }[];
}

export interface RuleContext {
  prompt: string;
  /** `V1` → the volunteer. */
  people: Map<string, PersonRef>;
  /** `T1` → the team's name. */
  teams: Map<string, string>;
}

export interface NotesContext extends RuleContext {
  /** `N1` → the note's application and author. */
  notes: Map<string, { applicationId: string; volunteerId: string; name: string; text: string }>;
}

function base(input: BaseInput, lines: string[]) {
  const people = new Map<string, PersonRef>();
  const teams = new Map<string, string>();
  lines.push(`output language: ${input.language}`, '', `Event: ${input.event.name}`, '');
  if (input.teams.length === 0) lines.push('Teams: none yet');
  else {
    lines.push('Teams:');
    input.teams.forEach((team, index) => {
      teams.set(`T${index + 1}`, team.name);
      lines.push(`[T${index + 1}] ${team.name}`);
    });
  }
  lines.push('');
  if (input.volunteers.length === 0) lines.push('Volunteers on this event: none');
  else {
    lines.push('Volunteers on this event:');
    input.volunteers.forEach((person, index) => {
      people.set(`V${index + 1}`, person);
      lines.push(`[V${index + 1}] ${person.name}`);
    });
  }
  lines.push('');
  return { people, teams };
}

export function buildRuleTextContext(input: RuleTextContextInput): RuleContext {
  const lines: string[] = [];
  const { people, teams } = base(input, lines);
  lines.push('The organizer wrote:', '"""', input.text.trim(), '"""');
  return { prompt: lines.join('\n'), people, teams };
}

export function buildNotesContext(input: NotesContextInput): NotesContext {
  const lines: string[] = [];
  const { people, teams } = base(input, lines);
  const refOf = new Map([...people].map(([ref, person]) => [person.volunteerId, ref]));
  const notes: NotesContext['notes'] = new Map();
  lines.push("The volunteers' notes on their sign-up:");
  input.notes.forEach((note, index) => {
    const ref = `N${index + 1}`;
    const author = [...people.values()].find((p) => p.volunteerId === note.volunteerId);
    notes.set(ref, { ...note, name: author?.name ?? '' });
    lines.push(
      `[${ref}] by ${author?.name ?? 'unknown'} (${refOf.get(note.volunteerId) ?? '?'}): "${note.text.trim().replaceAll('\n', ' ')}"`,
    );
  });
  return { prompt: lines.join('\n'), people, teams, notes };
}
