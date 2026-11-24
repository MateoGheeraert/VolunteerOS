import { ConflictException } from '@nestjs/common';

/** Turns a violation of the given unique index into a 409; rethrows anything else. */
export function rethrowUnique(error: unknown, constraint: string, message: string): never {
  // Drizzle wraps the driver error: the Postgres code and constraint are on its cause.
  const cause: unknown = error instanceof Error ? (error.cause ?? error) : error;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    cause.constraint === constraint
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
