import 'server-only';
import { cache } from 'react';
import {
  eventSuppliersControllerList,
  suppliersControllerDetail,
  suppliersControllerList,
} from '@/api/generated';
import { query } from '../query';

/** Every supplier of the organization, archived ones included, by name. */
export const listSuppliers = () => query(suppliersControllerList());

/**
 * One supplier and the events whose budget references it, newest first. Deduplicated per request
 * (the page title and the page both need it).
 */
export const getSupplier = cache((supplierId: string) =>
  query(suppliersControllerDetail({ path: { supplierId } })),
);

/** The suppliers the event's budget references, by name. */
export const listEventSuppliers = (eventId: string) =>
  query(eventSuppliersControllerList({ path: { eventId } }));
