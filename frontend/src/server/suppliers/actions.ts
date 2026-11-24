'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  suppliersControllerArchive,
  suppliersControllerCreate,
  suppliersControllerUnarchive,
  suppliersControllerUpdate,
} from '@/api/generated';
import { supplierFormSchema, toSupplierBody } from '@/features/suppliers/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();

/**
 * Suppliers show in the directory, on their own page, and by name on budget entries and the
 * event suppliers tabs.
 */
function revalidateSuppliers(supplierId?: string) {
  revalidatePath('/suppliers');
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath('/events/[eventId]/budget', 'page');
  revalidatePath('/events/[eventId]/suppliers', 'page');
}

/** A 409 is a name in use: by an active supplier, or by an archived one an admin can restore. */
const conflictMessage = msg('suppliers.validation.nameTaken');
const conflictMessages = [
  { prefix: 'name: an archived supplier', message: msg('suppliers.validation.nameTakenArchived') },
];

export const createSupplier = actionClient
  .metadata({ name: 'createSupplier', conflictMessage, conflictMessages })
  .inputSchema(supplierFormSchema)
  .action(async ({ parsedInput }) => {
    const { data } = await suppliersControllerCreate({ body: toSupplierBody(parsedInput) });
    revalidateSuppliers();
    return { id: data.id, name: data.name };
  });

/** Saves the whole form over the supplier (bind the supplier). */
export const updateSupplier = actionClient
  .metadata({ name: 'updateSupplier', conflictMessage, conflictMessages })
  .bindArgsSchemas([id])
  .inputSchema(supplierFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [supplierId] }) => {
    const { data } = await suppliersControllerUpdate({
      path: { supplierId },
      body: toSupplierBody(parsedInput),
    });
    revalidateSuppliers(supplierId);
    return { id: data.id, name: data.name };
  });

export const archiveSupplier = actionClient
  .metadata({ name: 'archiveSupplier' })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [supplierId] }) => {
    await suppliersControllerArchive({ path: { supplierId } });
    revalidateSuppliers(supplierId);
  });

export const unarchiveSupplier = actionClient
  .metadata({ name: 'unarchiveSupplier' })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [supplierId] }) => {
    await suppliersControllerUnarchive({ path: { supplierId } });
    revalidateSuppliers(supplierId);
  });
