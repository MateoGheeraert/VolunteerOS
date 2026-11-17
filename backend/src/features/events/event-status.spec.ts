import { describe, expect, it } from 'vitest';
import { canArchive, canTransition, isReadOnly } from './event-status.js';

describe('event status transitions', () => {
  it.each([
    ['draft', 'published'],
    ['published', 'draft'],
    ['published', 'completed'],
    ['completed', 'published'],
    ['draft', 'draft'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['draft', 'completed'],
    ['completed', 'draft'],
    ['archived', 'draft'],
    ['archived', 'published'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('archives anything that is not archived yet', () => {
    expect(canArchive('draft')).toBe(true);
    expect(canArchive('completed')).toBe(true);
    expect(canArchive('archived')).toBe(false);
  });

  it('treats archived events as read-only', () => {
    expect(isReadOnly('archived')).toBe(true);
    expect(isReadOnly('published')).toBe(false);
  });
});
