import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from '@/server/api-errors';
import { toActionError } from '@/server/action-client';

const meta = { name: 'createEvent', apiFields: { startsAt: 'startTime', endsAt: 'endTime' } };
const apiError = (status: number, message: unknown) =>
  new ApiError(status, { statusCode: status, message }, 'POST /api/events');

describe('toActionError', () => {
  it('maps a Nest validation error onto the form fields', () => {
    const error = apiError(400, ['endsAt: must be after startsAt', 'name: Too big']);
    expect(toActionError(error, meta)).toEqual({
      message: 'common.checkFields',
      fields: ['endTime', 'name'],
    });
  });

  it('turns a 400 without field paths into a form error only', () => {
    expect(toActionError(apiError(400, 'endsAt must be after startsAt'), meta)).toEqual({
      message: 'common.checkFields',
      fields: [],
    });
  });

  it.each([
    [401, 'Unauthorized', 'common.sessionExpired'],
    [403, 'Select an organization first', 'common.noOrganization'],
    [403, 'Forbidden', 'errorPages.forbiddenBody'],
    [404, 'Not Found', 'errorPages.forbiddenBody'],
    [409, 'Cannot change status from archived to published', 'common.conflict'],
  ])('maps %i "%s" to %s', (status, message, key) => {
    expect(toActionError(apiError(status, message), meta).message).toBe(key);
  });

  it('logs a contract violation and shows a generic error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const violation = z.object({ id: z.uuid() }).safeParse({ id: 1 }).error;
    expect(toActionError(violation, meta)).toEqual({ message: 'common.genericError' });
    expect(log).toHaveBeenCalledWith(
      'API contract violation in action createEvent',
      expect.any(Array),
    );
    log.mockRestore();
  });

  it('hides unexpected errors behind a generic message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toActionError(new Error('boom'), meta)).toEqual({ message: 'common.genericError' });
    log.mockRestore();
  });
});
