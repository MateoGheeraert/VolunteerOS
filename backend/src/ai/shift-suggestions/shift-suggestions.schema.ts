import { z } from 'zod';

/**
 * What the model returns for a shift-suggestion run. Every field is required (nullable where
 * optional) for strict structured output. Times are Brussels calendar days and clock times; an
 * end before its start runs past midnight.
 */
const shiftTime = {
  day: z.string().describe('Calendar day, YYYY-MM-DD'),
  start: z.string().describe('Start, HH:MM (24h)'),
  end: z.string().describe('End, HH:MM (24h); earlier than start means past midnight'),
};

export const shiftSuggestionOutputSchema = z.object({
  newTeams: z.array(
    z.object({
      name: z.string().describe('Short team name in the output language, e.g. "Bar"'),
      description: z.string().nullable(),
      meetingPoint: z.string().nullable(),
      shifts: z.array(
        z.object({ ...shiftTime, capacity: z.number().int().describe('Volunteers needed') }),
      ),
      reason: z.string().describe('Why this team with these shifts, in one or two sentences'),
      cites: z.array(z.string()).describe('References of the records this is based on'),
    }),
  ),
  changes: z.array(
    z.object({
      team: z.string().describe('Reference of the current team (T1, T2, …)'),
      type: z.enum(['add_shift', 'capacity']),
      shift: z
        .string()
        .nullable()
        .describe('For capacity: reference of the current shift (S1, …); null for add_shift'),
      day: z.string().nullable().describe('For add_shift: YYYY-MM-DD; null for capacity'),
      start: z.string().nullable(),
      end: z.string().nullable(),
      capacity: z.number().int().describe('The new or proposed capacity'),
      reason: z.string(),
      cites: z.array(z.string()),
    }),
  ),
});

export type ShiftSuggestionOutput = z.infer<typeof shiftSuggestionOutputSchema>;
