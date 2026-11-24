import { z } from 'zod';
import type {
  CreateSupplier,
  Supplier,
  SupplierEntry,
  SupplierListItem,
} from '@/api/generated/types.gen';
import { zCreateSupplier } from '@/api/generated/zod.gen';
import { msg } from '@/i18n/keys';

/**
 * The supplier form, shared by the form (instant feedback) and the server actions (validated
 * again). Empty optional fields are sent as null. The backend adds https:// to a bare domain.
 */
export const SUPPLIER_CATEGORIES = zCreateSupplier.shape.category.options;
export type SupplierCategory = Supplier['category'];

const NAME_MAX = 120;

/** "www.x.be", "x.be/contact" or a full http(s) URL; the backend adds the scheme. */
const looksLikeWebsite = (value: string) =>
  /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(value);

export const supplierFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, msg('suppliers.validation.nameRequired'))
    .max(NAME_MAX, msg('suppliers.validation.nameTooLong')),
  category: z.enum(SUPPLIER_CATEGORIES, msg('suppliers.validation.categoryRequired')),
  contactName: z.string().trim().max(120, msg('suppliers.validation.tooLong')),
  email: z
    .string()
    .trim()
    .max(320, msg('suppliers.validation.tooLong'))
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: msg('suppliers.validation.emailInvalid'),
    }),
  phone: z.string().trim().max(40, msg('suppliers.validation.tooLong')),
  website: z
    .string()
    .trim()
    .max(200, msg('suppliers.validation.tooLong'))
    .refine((value) => value === '' || looksLikeWebsite(value), {
      message: msg('suppliers.validation.websiteInvalid'),
    }),
  notes: z.string().trim().max(2000, msg('suppliers.validation.notesTooLong')),
});
export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const emptySupplier = (name = ''): SupplierFormValues => ({
  name,
  // The form shows a placeholder until one is picked; the schema refuses ''.
  category: '' as SupplierCategory,
  contactName: '',
  email: '',
  phone: '',
  website: '',
  notes: '',
});

export const supplierToForm = (supplier: Supplier): SupplierFormValues => ({
  name: supplier.name,
  category: supplier.category,
  contactName: supplier.contactName ?? '',
  email: supplier.email ?? '',
  phone: supplier.phone ?? '',
  website: supplier.website ?? '',
  notes: supplier.notes ?? '',
});

/** Validated form values → the API body (for creating, and as a full update). */
export function toSupplierBody(values: SupplierFormValues): Required<CreateSupplier> {
  return {
    name: values.name,
    category: values.category,
    contactName: values.contactName || null,
    email: values.email || null,
    phone: values.phone || null,
    website: values.website || null,
    notes: values.notes || null,
  };
}

/** A phone number as a link: "09 228 14 70" → "tel:092281470". */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export interface SupplierFilters {
  search: string;
  /** 'all', or one category. */
  category: 'all' | SupplierCategory;
  showArchived: boolean;
}

export const NO_SUPPLIER_FILTERS: SupplierFilters = {
  search: '',
  category: 'all',
  showArchived: false,
};

/** Lowercase, without accents: "Café" matches "cafe". */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** The directory's search (name, contact, email), category filter and archived toggle. */
export function filterSuppliers<S extends SupplierListItem>(
  suppliers: S[],
  filters: SupplierFilters,
): S[] {
  const words = fold(filters.search).split(/\s+/).filter(Boolean);
  return suppliers.filter((supplier) => {
    if (!filters.showArchived && supplier.archivedAt) return false;
    if (filters.category !== 'all' && supplier.category !== filters.category) return false;
    const haystack = fold(
      [supplier.name, supplier.contactName, supplier.email].filter(Boolean).join(' '),
    );
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * What a supplier cost (or brought in) over some entries: the actual amounts, with the estimate
 * standing in for an entry that has no actual amount yet. `estimated` says whether one did.
 */
export interface SupplierTotal {
  cents: number;
  estimated: boolean;
}

export function supplierTotals(
  entries: Pick<SupplierEntry, 'type' | 'estimatedCents' | 'actualCents'>[],
): { expense: SupplierTotal | null; income: SupplierTotal | null } {
  const total = (type: SupplierEntry['type']): SupplierTotal | null => {
    const ofType = entries.filter((entry) => entry.type === type);
    if (ofType.length === 0) return null;
    return {
      cents: ofType.reduce((sum, e) => sum + (e.actualCents ?? e.estimatedCents ?? 0), 0),
      estimated: ofType.some((e) => e.actualCents === null),
    };
  };
  return { expense: total('expense'), income: total('income') };
}
