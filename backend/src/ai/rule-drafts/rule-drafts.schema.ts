import { z } from 'zod';
import { planningRuleKindEnum } from '../../db/schema/index.js';

/** The parts of a rule both outputs share. Every field required, nullable where optional. */
const ruleFields = {
  kind: z.enum(planningRuleKindEnum.enumValues),
  other: z.string().nullable().describe('For the pair rules: the other person as written'),
  otherRefs: z
    .array(z.string())
    .describe('Every volunteer the other name could be (V1, V2, …); empty when unknown'),
  team: z
    .string()
    .nullable()
    .describe('For team rules: the team reference (T1), or its name when it is not listed'),
  maxShifts: z.number().int().nullable().describe('For max_shifts'),
  time: z.string().nullable().describe('For not_before and not_after: HH:MM, 24h'),
  quote: z.string().describe('The words the rule was read from'),
};

/** "Vertel Mila iets over de planning": the organizer's text as rules. */
export const ruleTextOutputSchema = z.object({
  rules: z.array(
    z.object({
      ...ruleFields,
      person: z.string().describe('The person the rule is about, as written'),
      personRefs: z
        .array(z.string())
        .describe('Every volunteer this name could be (V1, V2, …); empty when unknown'),
      scope: z
        .enum(['organization', 'event'])
        .describe('organization: true of the person in general; event: only this time'),
    }),
  ),
});
export type RuleTextOutput = z.infer<typeof ruleTextOutputSchema>;

/** The volunteers' notes as rules about their authors. */
export const notesOutputSchema = z.object({
  rules: z.array(
    z.object({ note: z.string().describe('The note reference (N1, …)'), ...ruleFields }),
  ),
});
export type NotesOutput = z.infer<typeof notesOutputSchema>;
