import 'server-only';
import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';
import { msg, type MessageKey } from '@/i18n/keys';
import { ApiError, isContractViolation } from './api-errors';

/**
 * What a failed action returns to its form (as `result.serverError`). `message` is a translation
 * key; `fields` are form fields to mark, when Nest rejected specific values.
 */
export interface ActionError {
  message: MessageKey;
  fields?: string[];
}

/**
 * The one way to build a server action. Input is validated against the action's schema (the same
 * schema the form uses), and every error is turned into an ActionError here, so actions only hold
 * the happy path:
 *
 *   export const createEvent = actionClient
 *     .metadata({ name: 'createEvent', apiFields: { startsAt: 'startTime' } })
 *     .inputSchema(eventFormSchema)
 *     .action(async ({ parsedInput }) => { … });
 */
export const actionClient = createSafeActionClient({
  defineMetadataSchema: () =>
    z.object({
      /** For logs. */
      name: z.string(),
      /** API field → form field, for marking fields Nest rejected (e.g. startsAt → startTime). */
      apiFields: z.record(z.string(), z.string()).optional(),
      /** What a 409 means for this action, when it's more specific than "changed meanwhile". */
      conflictMessage: z.custom<MessageKey>((value) => typeof value === 'string').optional(),
    }),
  handleServerError: (error, { metadata }) => toActionError(error, metadata),
});

/** Every failed action ends here: API errors become messages for the form, the rest is logged. */
export function toActionError(
  error: unknown,
  metadata: { name: string; apiFields?: Record<string, string>; conflictMessage?: MessageKey },
): ActionError {
  if (error instanceof ApiError) {
    if (error.status === 401) return { message: msg('common.sessionExpired') };
    if (error.needsOrganization) return { message: msg('common.noOrganization') };
    if (error.lostMembership) return { message: msg('members.removedNotice') };
    if (error.status === 403 || error.status === 404) {
      return { message: msg('errorPages.forbiddenBody') };
    }
    if (error.archivedEvent) return { message: msg('events.readOnly') };
    if (error.status === 429) return { message: msg('common.tooManyRequests') };
    if (error.status === 409) {
      return { message: metadata.conflictMessage ?? msg('common.conflict') };
    }
    if (error.status === 400) {
      const fields = error.invalidFields.map((field) => metadata.apiFields?.[field] ?? field);
      return { message: msg('common.checkFields'), fields };
    }
  }
  if (isContractViolation(error)) {
    console.error(`API contract violation in action ${metadata.name}`, error.issues);
  } else {
    console.error(`Action ${metadata.name} failed`, error);
  }
  return { message: msg('common.genericError') };
}
