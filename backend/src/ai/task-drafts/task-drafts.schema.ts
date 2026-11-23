import { z } from 'zod';

/**
 * What the model returns when turning an organizer's list into tasks. Every field is required
 * (nullable where optional), as strict structured output needs.
 */
export const taskDraftOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('Short task title, in the output language'),
      description: z.string().nullable().describe('Details from the list, or null'),
      priority: z.enum(['low', 'medium', 'high']),
      dueDate: z.string().nullable().describe('YYYY-MM-DD when the list gives a date, else null'),
      assigneeRef: z
        .string()
        .nullable()
        .describe('The member reference (U1, U2…) when the list names a member, else null'),
      assigneeName: z
        .string()
        .nullable()
        .describe('Someone named in the list who is not a member, else null'),
    }),
  ),
});

export type TaskDraftOutput = z.infer<typeof taskDraftOutputSchema>;
