import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { dateTimeOutput } from '../../common/schemas.js';
import { normalizeWebsite } from '../../auth/organization-profile.js';
import {
  budgetEntryTypeEnum,
  eventStatusEnum,
  supplier,
  supplierCategoryEnum,
} from '../../db/schema/index.js';

/**
 * API contracts for the organization's suppliers and where they were used. A supplier is used in
 * an event when one of the event's budget entries references it.
 */

/** Free text: trimmed, and empty means "not filled in" (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

const fields = {
  name: z.string().trim().min(1).max(120),
  category: z.enum(supplierCategoryEnum.enumValues),
  contactName: optionalText(120),
  email: optionalText(320).transform((value, ctx) => {
    if (value === null) return null;
    if (!z.email().safeParse(value).success) {
      ctx.addIssue({ code: 'custom', message: 'must be an email address' });
    }
    return value.toLowerCase();
  }),
  phone: optionalText(40),
  website: optionalText(200).transform((value, ctx) => {
    if (value === null) return null;
    const url = normalizeWebsite(value);
    if (url === null) ctx.addIssue({ code: 'custom', message: 'must be a http(s) URL' });
    return url;
  }),
  notes: optionalText(2000),
};

/** A new supplier: a name and a category; the contact fields may follow later. */
export const createSupplierSchema = z
  .object({
    name: fields.name,
    category: fields.category,
    contactName: fields.contactName.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    website: fields.website.optional(),
    notes: fields.notes.optional(),
  })
  .meta({ id: 'CreateSupplier' });
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

/** A partial update; `null` (or an empty string) clears an optional field. */
export const updateSupplierSchema = z.object(fields).partial().meta({ id: 'UpdateSupplier' });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierSchema = createSelectSchema(supplier, {
  createdAt: dateTimeOutput,
  updatedAt: dateTimeOutput,
  archivedAt: dateTimeOutput.nullable(),
})
  .omit({ organizationId: true, createdByUserId: true, deletedAt: true })
  .meta({ id: 'Supplier' });
export type SupplierDto = z.infer<typeof supplierSchema>;

/** A row of the directory: the supplier and how often it was used. */
export const supplierListItemSchema = supplierSchema
  .extend({
    /** In how many events a live budget entry references it. */
    eventCount: z.number().int(),
    /** When the latest of those events starts; null when it was never used. */
    latestEventAt: dateTimeOutput.nullable(),
  })
  .meta({ id: 'SupplierListItem' });
export type SupplierListItemDto = z.infer<typeof supplierListItemSchema>;

/** A file of a budget entry: most likely the supplier's invoice. Downloaded through its event. */
export const supplierFileSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    createdAt: dateTimeOutput,
  })
  .meta({ id: 'SupplierFile' });
export type SupplierFileDto = z.infer<typeof supplierFileSchema>;

/** A budget entry that references the supplier, with its files. */
export const supplierEntrySchema = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    type: z.enum(budgetEntryTypeEnum.enumValues),
    title: z.string(),
    estimatedCents: z.number().int().nullable(),
    actualCents: z.number().int().nullable(),
    files: z.array(supplierFileSchema),
  })
  .meta({ id: 'SupplierEntry' });
export type SupplierEntryDto = z.infer<typeof supplierEntrySchema>;

/** One supplier's page: the supplier and the events it was used in, newest first. */
export const supplierDetailSchema = z
  .object({
    supplier: supplierSchema,
    events: z.array(
      z.object({
        event: z.object({
          id: z.uuid(),
          name: z.string(),
          startsAt: dateTimeOutput,
          status: z.enum(eventStatusEnum.enumValues),
        }),
        entries: z.array(supplierEntrySchema),
      }),
    ),
  })
  .meta({ id: 'SupplierDetail' });
export type SupplierDetailDto = z.infer<typeof supplierDetailSchema>;

/** The suppliers an event's budget references, by name, each with its entries. */
export const eventSupplierSchema = z
  .object({ supplier: supplierSchema, entries: z.array(supplierEntrySchema) })
  .meta({ id: 'EventSupplier' });
export type EventSupplierDto = z.infer<typeof eventSupplierSchema>;
