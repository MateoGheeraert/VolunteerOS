import type { PlanningRuleKind } from '../../db/schema/index.js';
import type { SolverRule } from '../../features/planning/allocation.js';
import { normalizeClock } from '../../features/planning/brussels-time.js';
import {
  MAX_RULE_SHIFTS,
  PAIR_RULE_KINDS,
  TEAM_RULE_KINDS,
  TIME_RULE_KINDS,
} from '../../features/planning/planning-rule.schemas.js';
import type { Citation } from '../ai.types.js';
import type { PersonPick, PlanningRulePayload, RuleDraft } from '../planning/planning-payloads.js';
import type { NotesContext, PersonRef, RuleContext } from './rule-drafts.context.js';
import type { NotesOutput, RuleTextOutput } from './rule-drafts.schema.js';

/**
 * Server-side rules for what Mila reads from language (docs/info.md §7.7.1 B). Names are matched
 * here too, not only by the model: when a written name fits more than one volunteer, the chip
 * asks which one, whatever the model picked.
 */

/** Lowercase words without accents: "Zoë De Wit" → ["zoe", "de", "wit"]. */
function words(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The volunteers whose name contains every word of the written name ("Jan" fits "Jan Peeters"). */
export function matchNames(written: string, people: Iterable<PersonRef>): PersonRef[] {
  const wanted = words(written);
  if (wanted.length === 0) return [];
  return [...people].filter((person) => {
    const have = words(person.name);
    return wanted.every((word) => have.includes(word));
  });
}

/**
 * Who a written name is: the model's references and the names that fit, together. One person:
 * resolved. Several: ambiguous, the organizer picks. None: null (unknown).
 */
export function resolvePerson(
  written: string,
  refs: string[],
  people: ReadonlyMap<string, PersonRef>,
): PersonPick | null {
  const byModel = refs
    .map((ref) => people.get(ref.replace(/[[\]]/g, '').trim()))
    .filter((p) => p !== undefined);
  const byName = matchNames(written, people.values());
  const all = new Map<string, PersonRef>();
  for (const person of byName.length > 0 ? [...byName, ...byModel] : byModel) {
    all.set(person.volunteerId, person);
  }
  // The model's pick outside the names that fit only counts when no name fits (a nickname).
  if (byName.length > 0) {
    for (const person of byModel) {
      if (!byName.some((p) => p.volunteerId === person.volunteerId)) all.delete(person.volunteerId);
    }
  }
  const candidates = [...all.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  if (candidates.length === 0) return null;
  return {
    name: written.trim() || candidates[0]!.name,
    volunteerId: candidates.length === 1 ? candidates[0]!.volunteerId : null,
    candidates: candidates.map((p) => ({ volunteerId: p.volunteerId, name: p.name })),
  };
}

interface RuleFields {
  kind: PlanningRuleKind;
  other: string | null;
  otherRefs: string[];
  team: string | null;
  maxShifts: number | null;
  time: string | null;
  quote: string;
}

type Fields = Pick<RuleDraft, 'other' | 'teamName' | 'maxShifts' | 'time'>;

/** The kind's own field, checked; null when the rule is incomplete or invalid. */
function fieldsOf(
  item: RuleFields,
  context: RuleContext,
): { fields: Fields; unknownOther: string | null } | null {
  const fields: Fields = { other: null, teamName: null, maxShifts: null, time: null };
  if (TEAM_RULE_KINDS.includes(item.kind)) {
    const team = item.team?.replace(/[[\]]/g, '').trim();
    if (!team) return null;
    if (/^T\d+$/.test(team)) {
      const name = context.teams.get(team);
      if (!name) return null;
      fields.teamName = name;
    } else fields.teamName = team.slice(0, 100);
  } else if (PAIR_RULE_KINDS.includes(item.kind)) {
    const other = resolvePerson(item.other ?? '', item.otherRefs, context.people);
    if (!other) return { fields, unknownOther: item.other?.trim() || null };
    fields.other = other;
  } else if (item.kind === 'max_shifts') {
    if (item.maxShifts === null || item.maxShifts < 0 || item.maxShifts > MAX_RULE_SHIFTS)
      return null;
    fields.maxShifts = item.maxShifts;
  } else if (TIME_RULE_KINDS.includes(item.kind)) {
    const time = item.time ? normalizeClock(item.time) : null;
    if (!time) return null;
    fields.time = time;
  }
  return { fields, unknownOther: null };
}

/** One key per rule's meaning, for doubles and decided cards. Pair rules ignore the order. */
export function ruleKey(rule: {
  kind: PlanningRuleKind;
  volunteerId: string;
  otherVolunteerId: string | null;
  teamName: string | null;
  maxShifts: number | null;
  time: string | null;
}): string {
  if (rule.otherVolunteerId) {
    const [a, b] = [rule.volunteerId, rule.otherVolunteerId].sort();
    return `rule:${rule.kind}:${a}:${b}`;
  }
  const value = rule.teamName?.trim().toLowerCase() ?? rule.maxShifts ?? rule.time ?? '';
  return `rule:${rule.kind}:${rule.volunteerId}:${value}`;
}

const draftKey = (draft: RuleDraft) =>
  [
    draft.kind,
    draft.person.volunteerId ?? draft.person.candidates.map((c) => c.volunteerId).join('|'),
    draft.other
      ? (draft.other.volunteerId ?? draft.other.candidates.map((c) => c.volunteerId).join('|'))
      : '',
    draft.teamName?.toLowerCase() ?? '',
    draft.maxShifts ?? '',
    draft.time ?? '',
  ].join('/');

export interface RuleTextPlan {
  rules: RuleDraft[];
  /** Names Mila couldn't match to anyone on the event: reported, never guessed. */
  unknownNames: string[];
}

/** The organizer's text as rule chips, for them to check before anything is saved. */
export function planRuleText(output: RuleTextOutput, context: RuleContext): RuleTextPlan {
  const rules: RuleDraft[] = [];
  const unknown = new Set<string>();
  const seen = new Set<string>();
  for (const item of output.rules) {
    const person = resolvePerson(item.person, item.personRefs, context.people);
    if (!person) {
      if (item.person.trim()) unknown.add(item.person.trim());
      continue;
    }
    const checked = fieldsOf(item, context);
    if (!checked) continue;
    if (checked.unknownOther) {
      unknown.add(checked.unknownOther);
      continue;
    }
    const draft: RuleDraft = {
      kind: item.kind,
      scope: item.scope,
      person,
      ...checked.fields,
      quote: item.quote.trim().slice(0, 300),
    };
    // A pair rule needs two different people.
    if (draft.other?.volunteerId && draft.other.volunteerId === person.volunteerId) continue;
    const key = draftKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(draft);
  }
  return { rules, unknownNames: [...unknown] };
}

export interface NoteRuleCard {
  kind: 'planning_rule';
  dedupKey: string;
  title: string;
  explanation: string;
  payload: PlanningRulePayload;
  citations: Citation[];
}

export interface NotesPlanState {
  /** Keys (see `ruleKey`) of the live rules: nothing to suggest, they already apply. */
  existingRuleKeys: ReadonlySet<string>;
  /** The status of every earlier rule card, by its key. */
  decidedCards: ReadonlyMap<string, string>;
}

export interface NotesPlan {
  /** New cards for the organizer to confirm. */
  cards: NoteRuleCard[];
  /** What the solver applies this run: resolved note rules that weren't rejected. */
  solverRules: SolverRule[];
  dropped: { note: string; reason: 'unbacked' | 'invalid' | 'known' | 'rejected' | 'duplicate' }[];
}

/**
 * The notes' rules. Each is about its note's author; it becomes a card unless the rule already
 * exists or a card for it was decided before. Until the organizer decides, the solver already
 * respects it; a rejected one is never applied or suggested again.
 */
export function planNoteRules(
  output: NotesOutput,
  context: NotesContext,
  state: NotesPlanState,
): NotesPlan {
  const cards: NoteRuleCard[] = [];
  const solverRules: SolverRule[] = [];
  const dropped: NotesPlan['dropped'] = [];
  const seen = new Set<string>();
  for (const item of output.rules) {
    const noteRef = item.note.replace(/[[\]]/g, '').trim();
    const note = context.notes.get(noteRef);
    if (!note) {
      dropped.push({ note: noteRef, reason: 'unbacked' });
      continue;
    }
    const checked = fieldsOf(item, context);
    if (!checked || checked.unknownOther) {
      dropped.push({ note: noteRef, reason: 'invalid' });
      continue;
    }
    const draft: RuleDraft = {
      kind: item.kind,
      scope: 'event',
      person: {
        name: note.name,
        volunteerId: note.volunteerId,
        candidates: [{ volunteerId: note.volunteerId, name: note.name }],
      },
      ...checked.fields,
      quote: item.quote.trim().slice(0, 300),
    };
    if (draft.other?.volunteerId === note.volunteerId) {
      dropped.push({ note: noteRef, reason: 'invalid' });
      continue;
    }
    const resolved = draft.other === null || draft.other.volunteerId !== null;
    const key = resolved
      ? ruleKey({
          kind: draft.kind,
          volunteerId: note.volunteerId,
          otherVolunteerId: draft.other?.volunteerId ?? null,
          teamName: draft.teamName,
          maxShifts: draft.maxShifts,
          time: draft.time,
        })
      : `rule:${draft.kind}:${note.volunteerId}:ask:${draft.other!.name.toLowerCase()}`;
    if (seen.has(key)) {
      dropped.push({ note: noteRef, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    if (state.existingRuleKeys.has(key)) {
      dropped.push({ note: noteRef, reason: 'known' });
      continue;
    }
    const decided = state.decidedCards.get(key);
    if (decided === 'rejected' || decided === 'accepted') {
      dropped.push({ note: noteRef, reason: decided === 'rejected' ? 'rejected' : 'known' });
      continue;
    }
    if (resolved) solverRules.push(toSolverRule(draft, note.volunteerId));
    cards.push({
      kind: 'planning_rule',
      dedupKey: key,
      title: `${note.name}: ${describeRule(draft)}`,
      explanation: `Uit de notitie van ${note.name}: "${draft.quote}"`,
      payload: { ...draft, applicationId: note.applicationId },
      citations: [{ type: 'note', id: note.applicationId, label: `Notitie van ${note.name}` }],
    });
  }
  return { cards, solverRules, dropped };
}

/** A resolved rule as the solver takes it. */
export function toSolverRule(
  rule: Pick<RuleDraft, 'kind' | 'teamName' | 'maxShifts' | 'time'> & {
    other: { volunteerId: string | null } | null;
  },
  volunteerId: string,
): SolverRule {
  switch (rule.kind) {
    case 'not_team':
    case 'only_team':
    case 'prefers_team':
      return { kind: rule.kind, volunteerId, teamName: rule.teamName ?? '' };
    case 'never_together':
    case 'prefer_together':
      return { kind: rule.kind, volunteerId, otherVolunteerId: rule.other?.volunteerId ?? '' };
    case 'max_shifts':
      return { kind: 'max_shifts', volunteerId, maxShifts: rule.maxShifts ?? 0 };
    case 'not_before':
    case 'not_after':
      return { kind: rule.kind, volunteerId, time: rule.time ?? '00:00' };
  }
}

/** The rule in Dutch, for card titles: "niet vóór 18:00", "nooit samen met Jan Peeters". */
export function describeRule(
  rule: Pick<RuleDraft, 'kind' | 'teamName' | 'maxShifts' | 'time'> & {
    other: { name: string } | null;
  },
): string {
  switch (rule.kind) {
    case 'not_team':
      return `niet in ${rule.teamName}`;
    case 'only_team':
      return `enkel in ${rule.teamName}`;
    case 'prefers_team':
      return `liefst in ${rule.teamName}`;
    case 'never_together':
      return `nooit samen met ${rule.other?.name}`;
    case 'prefer_together':
      return `liefst samen met ${rule.other?.name}`;
    case 'max_shifts':
      return `hoogstens ${rule.maxShifts} ${rule.maxShifts === 1 ? 'shift' : 'shiften'}`;
    case 'not_before':
      return `niet vóór ${rule.time}`;
    case 'not_after':
      return `niet na ${rule.time}`;
  }
}
