import { describe, expect, it } from 'vitest';
import type { SupplierListItem } from '@/api/generated/types.gen';
import {
  emptySupplier,
  filterSuppliers,
  NO_SUPPLIER_FILTERS,
  supplierFormSchema,
  supplierToForm,
  supplierTotals,
  toSupplierBody,
} from '@/features/suppliers/schemas';

const supplier = (overrides: Partial<SupplierListItem>): SupplierListItem => ({
  id: crypto.randomUUID(),
  name: 'Drankenhandel Peeters',
  category: 'drinks',
  contactName: null,
  email: null,
  phone: null,
  website: null,
  notes: null,
  createdAt: '2026-11-24T10:00:00.000Z',
  updatedAt: '2026-11-24T10:00:00.000Z',
  archivedAt: null,
  eventCount: 0,
  latestEventAt: null,
  ...overrides,
});

describe('supplierFormSchema', () => {
  const valid = { ...emptySupplier('Drankenhandel Peeters'), category: 'drinks' as const };

  it('needs a name and a category, nothing else', () => {
    expect(supplierFormSchema.safeParse(valid).success).toBe(true);
    expect(supplierFormSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
    expect(supplierFormSchema.safeParse(emptySupplier('X')).success).toBe(false);
  });

  it('checks an email and a website when one is filled in', () => {
    const ok = (fields: Partial<typeof valid>) =>
      supplierFormSchema.safeParse({ ...valid, ...fields }).success;
    expect(ok({ email: 'koen@peeters.be' })).toBe(true);
    expect(ok({ email: 'koen at peeters' })).toBe(false);
    expect(ok({ website: 'www.peeters.be' })).toBe(true);
    expect(ok({ website: 'https://peeters.be/contact' })).toBe(true);
    expect(ok({ website: 'peeters' })).toBe(false);
    expect(ok({ website: 'peeters be' })).toBe(false);
  });

  it('sends empty fields as null and round-trips a supplier', () => {
    const body = toSupplierBody(supplierFormSchema.parse({ ...valid, phone: ' 09 228 14 70 ' }));
    expect(body).toEqual({
      name: 'Drankenhandel Peeters',
      category: 'drinks',
      contactName: null,
      email: null,
      phone: '09 228 14 70',
      website: null,
      notes: null,
    });
    const existing = supplier({ email: 'koen@peeters.be', notes: 'Vrijdag' });
    expect(toSupplierBody(supplierFormSchema.parse(supplierToForm(existing)))).toMatchObject({
      email: 'koen@peeters.be',
      notes: 'Vrijdag',
    });
  });
});

describe('filterSuppliers', () => {
  const suppliers = [
    supplier({ name: 'Drankenhandel Peeters', contactName: 'Koen Peeters' }),
    supplier({ name: 'Café Sport', category: 'food', email: 'info@cafesport.be' }),
    supplier({
      name: 'Drukkerij De Kopie',
      category: 'printing',
      archivedAt: '2026-01-01T00:00:00Z',
    }),
  ];
  const names = (filters: Partial<typeof NO_SUPPLIER_FILTERS>) =>
    filterSuppliers(suppliers, { ...NO_SUPPLIER_FILTERS, ...filters }).map((s) => s.name);

  it('hides archived suppliers unless asked', () => {
    expect(names({})).toEqual(['Drankenhandel Peeters', 'Café Sport']);
    expect(names({ showArchived: true })).toHaveLength(3);
  });

  it('searches name, contact and email, ignoring case and accents', () => {
    expect(names({ search: 'koen' })).toEqual(['Drankenhandel Peeters']);
    expect(names({ search: 'cafe' })).toEqual(['Café Sport']);
    expect(names({ search: 'cafesport.be' })).toEqual(['Café Sport']);
    expect(names({ search: 'dr', showArchived: true })).toEqual([
      'Drankenhandel Peeters',
      'Drukkerij De Kopie',
    ]);
  });

  it('filters by category', () => {
    expect(names({ category: 'food' })).toEqual(['Café Sport']);
    expect(names({ category: 'printing' })).toEqual([]);
  });
});

describe('supplierTotals', () => {
  it('adds actual amounts, with the estimate for an entry that has none, apart per type', () => {
    expect(
      supplierTotals([
        { type: 'expense', estimatedCents: 100000, actualCents: 112500 },
        { type: 'expense', estimatedCents: 20000, actualCents: null },
        { type: 'income', estimatedCents: 25000, actualCents: 25000 },
      ]),
    ).toEqual({
      expense: { cents: 132500, estimated: true },
      income: { cents: 25000, estimated: false },
    });
  });

  it('leaves out a type without entries', () => {
    expect(supplierTotals([{ type: 'expense', estimatedCents: null, actualCents: 500 }])).toEqual({
      expense: { cents: 500, estimated: false },
      income: null,
    });
  });
});
