import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, countDistinct, desc, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../../db/database.js';
import {
  budgetEntry,
  budgetEntryUpload,
  event,
  supplier,
  upload,
  type BudgetEntryRow,
  type EventRow,
  type SupplierRow,
  type UploadRow,
} from '../../db/schema/index.js';
import { notDeleted } from '../../db/soft-delete.js';

export type SupplierValues = Pick<
  SupplierRow,
  'name' | 'category' | 'contactName' | 'email' | 'phone' | 'website' | 'notes'
>;

/** A live budget entry that references a supplier, with its event and its listed files. */
export interface SupplierEntryView {
  entry: BudgetEntryRow;
  event: Pick<EventRow, 'id' | 'name' | 'startsAt' | 'status'>;
  supplier: SupplierRow;
  files: Pick<UploadRow, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'createdAt'>[];
}

/**
 * Data access for the organization's suppliers. Every read is scoped to the organization and
 * skips soft-deleted rows; archived suppliers are returned, flagged by `archivedAt`.
 */
@Injectable()
export class SuppliersRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** All suppliers by name, archived ones included, with how often they were used. */
  async list(organizationId: string) {
    const usage = this.db
      .select({
        supplierId: budgetEntry.supplierId,
        eventCount: countDistinct(budgetEntry.eventId).as('event_count'),
        latestEventAt: max(event.startsAt).as('latest_event_at'),
      })
      .from(budgetEntry)
      .innerJoin(event, and(eq(event.id, budgetEntry.eventId), notDeleted(event)))
      .where(
        and(
          eq(event.organizationId, organizationId),
          isNotNull(budgetEntry.supplierId),
          notDeleted(budgetEntry),
        ),
      )
      .groupBy(budgetEntry.supplierId)
      .as('usage');

    return this.db
      .select({ supplier, eventCount: usage.eventCount, latestEventAt: usage.latestEventAt })
      .from(supplier)
      .leftJoin(usage, eq(usage.supplierId, supplier.id))
      .where(and(eq(supplier.organizationId, organizationId), notDeleted(supplier)))
      .orderBy(asc(sql`lower(${supplier.name})`));
  }

  async find(organizationId: string, supplierId: string): Promise<SupplierRow | undefined> {
    const [row] = await this.db
      .select()
      .from(supplier)
      .where(
        and(
          eq(supplier.id, supplierId),
          eq(supplier.organizationId, organizationId),
          notDeleted(supplier),
        ),
      )
      .limit(1);
    return row;
  }

  /** The supplier with this name, ignoring case. */
  async findByName(organizationId: string, name: string): Promise<SupplierRow | undefined> {
    const [row] = await this.db
      .select()
      .from(supplier)
      .where(
        and(
          eq(supplier.organizationId, organizationId),
          // Lowercased by Postgres on both sides, like the unique index.
          sql`lower(${supplier.name}) = lower(${name})`,
          notDeleted(supplier),
        ),
      )
      .limit(1);
    return row;
  }

  async insert(
    tx: DbExecutor,
    organizationId: string,
    createdByUserId: string,
    values: SupplierValues,
  ): Promise<SupplierRow> {
    const [created] = await tx
      .insert(supplier)
      .values({ ...values, organizationId, createdByUserId })
      .returning();
    return created!;
  }

  async update(
    tx: DbExecutor,
    supplierId: string,
    patch: Partial<SupplierValues> & { archivedAt?: Date | null },
  ): Promise<SupplierRow> {
    const [updated] = await tx
      .update(supplier)
      .set(patch)
      .where(and(eq(supplier.id, supplierId), notDeleted(supplier)))
      .returning();
    return updated!;
  }

  /**
   * The live budget entries that reference a supplier: one supplier's (`supplierId`) or those of
   * one event (`eventId`). Newest event first, then by supplier name, then income first and
   * oldest entry first.
   */
  async entries(
    organizationId: string,
    filter: { supplierId: string } | { eventId: string },
  ): Promise<SupplierEntryView[]> {
    const rows = await this.db
      .select({
        entry: budgetEntry,
        event: { id: event.id, name: event.name, startsAt: event.startsAt, status: event.status },
        supplier,
      })
      .from(budgetEntry)
      .innerJoin(supplier, eq(supplier.id, budgetEntry.supplierId))
      .innerJoin(event, eq(event.id, budgetEntry.eventId))
      .where(
        and(
          eq(supplier.organizationId, organizationId),
          eq(event.organizationId, organizationId),
          notDeleted(budgetEntry),
          notDeleted(event),
          notDeleted(supplier),
          'supplierId' in filter
            ? eq(budgetEntry.supplierId, filter.supplierId)
            : eq(budgetEntry.eventId, filter.eventId),
        ),
      )
      .orderBy(
        desc(event.startsAt),
        asc(sql`lower(${supplier.name})`),
        asc(budgetEntry.type),
        asc(budgetEntry.createdAt),
        asc(budgetEntry.id),
      );

    const files = await this.filesOf(rows.map((row) => row.entry.id));
    return rows.map((row) => ({
      ...row,
      files: files
        .filter((f) => f.entryId === row.entry.id)
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          createdAt: f.createdAt,
        })),
    }));
  }

  /** Listed files (live and confirmed) of the entries, oldest first. */
  private filesOf(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        entryId: budgetEntryUpload.budgetEntryId,
        id: upload.id,
        name: upload.name,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        createdAt: upload.createdAt,
      })
      .from(budgetEntryUpload)
      .innerJoin(upload, eq(upload.id, budgetEntryUpload.uploadId))
      .where(
        and(
          inArray(budgetEntryUpload.budgetEntryId, entryIds),
          notDeleted(upload),
          eq(upload.status, 'ready'),
        ),
      )
      .orderBy(asc(upload.createdAt), asc(upload.id));
  }
}
