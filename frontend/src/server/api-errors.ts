import { ZodError } from 'zod';

/**
 * Errors from calls to Nest. The API client (src/server/api.ts) throws these; queries turn them
 * into navigations and the action client (src/server/action-client.ts) into form errors.
 */

/** Nest answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly endpoint: string,
  ) {
    super(`${endpoint} → ${status}${messageOf(body) ? `: ${messageOf(body)}` : ''}`);
    this.name = 'ApiError';
  }

  /** Top-level fields that a 400 validation answer points at (`endsAt: must be after startsAt`). */
  get invalidFields(): string[] {
    if (this.status !== 400) return [];
    const messages = [messageOf(this.body) ?? [], messagesOf(this.body)].flat();
    const fields = new Set<string>();
    for (const message of messages) {
      const field = /^([\w.]+): /.exec(message)?.[1]?.split('.')[0];
      if (field) fields.add(field);
    }
    return [...fields];
  }

  /** Nest's 403 when the caller was removed from their active organization (backend OrgGuard). */
  get lostMembership(): boolean {
    return (
      this.status === 403 && messageOf(this.body) === 'Not a member of the active organization'
    );
  }

  /** Nest's 409 for a write to an archived (read-only) event. */
  get archivedEvent(): boolean {
    return this.status === 409 && messageOf(this.body) === 'An archived event cannot be changed';
  }

  /** Nest's 403 when the session has no active organization (backend OrgGuard). */
  get needsOrganization(): boolean {
    return this.status === 403 && messageOf(this.body) === 'Select an organization first';
  }
}

function messageOf(body: unknown): string | undefined {
  const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
  return typeof message === 'string' ? message : undefined;
}

function messagesOf(body: unknown): string[] {
  const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
  return Array.isArray(message) ? message.filter((m): m is string => typeof m === 'string') : [];
}

/**
 * The SDK validates every request body and response against backend/openapi.json and throws a
 * ZodError on a mismatch. That is always a bug (the frontend sent something the API doesn't accept,
 * or the API returned something it doesn't promise), never a user mistake.
 */
export function isContractViolation(error: unknown): error is ZodError {
  return error instanceof ZodError;
}
