import { describe, expect, it } from 'vitest';
import { MAX_BUDGET_CENTS } from '../../db/schema/index.js';
import { createBudgetEntrySchema, hasAmount, updateBudgetEntrySchema } from './budget.schemas.js';

const valid = { type: 'expense', title: 'Tent huren', estimatedCents: 45000 } as const;

describe('createBudgetEntrySchema', () => {
  it('accepts an entry with an estimate, an actual amount, or both', () => {
    expect(createBudgetEntrySchema.safeParse(valid).success).toBe(true);
    expect(
      createBudgetEntrySchema.safeParse({ ...valid, estimatedCents: null, actualCents: 0 }).success,
    ).toBe(true);
    expect(createBudgetEntrySchema.safeParse({ ...valid, actualCents: 44950 }).success).toBe(true);
  });

  it('needs at least one amount', () => {
    const result = createBudgetEntrySchema.safeParse({ type: 'income', title: 'Tickets' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['estimatedCents']);
    expect(
      createBudgetEntrySchema.safeParse({ ...valid, estimatedCents: null, actualCents: null })
        .success,
    ).toBe(false);
  });

  it('takes whole cents from 0 to € 9.999.999,99 only', () => {
    const amount = (estimatedCents: number) =>
      createBudgetEntrySchema.safeParse({ ...valid, estimatedCents }).success;
    expect(amount(0)).toBe(true);
    expect(amount(MAX_BUDGET_CENTS)).toBe(true);
    expect(amount(MAX_BUDGET_CENTS + 1)).toBe(false);
    expect(amount(-1)).toBe(false);
    expect(amount(12.5)).toBe(false);
  });

  it('needs a title and a type', () => {
    expect(createBudgetEntrySchema.safeParse({ ...valid, title: '  ' }).success).toBe(false);
    expect(createBudgetEntrySchema.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(
      false,
    );
    expect(createBudgetEntrySchema.safeParse({ ...valid, type: 'vat' }).success).toBe(false);
  });

  it('limits notes to 2000 characters', () => {
    expect(createBudgetEntrySchema.safeParse({ ...valid, notes: 'x'.repeat(2000) }).success).toBe(
      true,
    );
    expect(createBudgetEntrySchema.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe('updateBudgetEntrySchema', () => {
  it('takes any subset, and null clears an amount (the service checks one is left)', () => {
    expect(updateBudgetEntrySchema.safeParse({}).success).toBe(true);
    expect(updateBudgetEntrySchema.safeParse({ actualCents: null }).success).toBe(true);
    expect(updateBudgetEntrySchema.safeParse({ actualCents: 1.5 }).success).toBe(false);
  });
});

describe('hasAmount', () => {
  it('counts zero as an amount', () => {
    expect(hasAmount({ estimatedCents: 0, actualCents: null })).toBe(true);
    expect(hasAmount({ estimatedCents: null, actualCents: null })).toBe(false);
    expect(hasAmount({})).toBe(false);
  });
});
