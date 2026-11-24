import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { recordActivity } from '../../activity/activity-log.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import type { OrgContext } from '../../authz/org-context.js';
import type { Database } from '../../db/database.js';
import type { SupplierRow } from '../../db/schema/index.js';
import { rethrowUnique } from '../../db/unique-violation.js';
import {
  SuppliersRepository,
  type SupplierEntryView,
  type SupplierValues,
} from './suppliers.repository.js';
import type {
  CreateSupplierInput,
  EventSupplierDto,
  SupplierDetailDto,
  SupplierDto,
  SupplierEntryDto,
  SupplierListItemDto,
  UpdateSupplierInput,
} from './suppliers.schemas.js';

/**
 * Supplier fields whose values the activity log keeps. The name, the contact details and the
 * notes are stored by name only: they can hold personal data.
 */
const LOGGED_VALUES = ['category', 'archivedAt', 'createdByUserId'] as const;

const NAME_INDEX = 'supplier_organization_name_uidx';

/**
 * The organization's suppliers. Every member reads, creates and edits them; owners and admins
 * archive them (the routes check that). A supplier is never deleted. Every write runs in a
 * transaction and records its activity log entry in that same transaction.
 */
@Injectable()
export class SuppliersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly suppliers: SuppliersRepository,
  ) {}

  async list(org: OrgContext): Promise<SupplierListItemDto[]> {
    const rows = await this.suppliers.list(org.organizationId);
    return rows.map((row) => ({
      ...toSupplierDto(row.supplier),
      eventCount: row.eventCount ?? 0,
      latestEventAt: row.latestEventAt ? new Date(row.latestEventAt).toISOString() : null,
    }));
  }

  async detail(org: OrgContext, supplierId: string): Promise<SupplierDetailDto> {
    const row = await this.find(org, supplierId);
    const views = await this.suppliers.entries(org.organizationId, { supplierId });
    const events: SupplierDetailDto['events'] = [];
    for (const view of views) {
      let group = events.at(-1);
      if (group?.event.id !== view.event.id) {
        group = {
          event: { ...view.event, startsAt: view.event.startsAt.toISOString() },
          entries: [],
        };
        events.push(group);
      }
      group.entries.push(toEntryDto(view));
    }
    return { supplier: toSupplierDto(row), events };
  }

  /** The suppliers the event's budget references, by name. */
  async forEvent(org: OrgContext, access: EventAccess): Promise<EventSupplierDto[]> {
    const views = await this.suppliers.entries(org.organizationId, { eventId: access.event.id });
    const groups = new Map<string, EventSupplierDto>();
    for (const view of views) {
      let group = groups.get(view.supplier.id);
      if (!group) {
        group = { supplier: toSupplierDto(view.supplier), entries: [] };
        groups.set(view.supplier.id, group);
      }
      group.entries.push(toEntryDto(view));
    }
    return [...groups.values()];
  }

  async create(org: OrgContext, input: CreateSupplierInput): Promise<SupplierDto> {
    await this.assertNameFree(org, input.name);
    const values: SupplierValues = {
      name: input.name,
      category: input.category,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      notes: input.notes ?? null,
    };
    const created = await this.db
      .transaction(async (tx) => {
        const row = await this.suppliers.insert(tx, org.organizationId, org.userId, values);
        await recordActivity(tx, org, {
          action: 'created',
          entityType: 'supplier',
          entity: row,
          before: null,
          values: LOGGED_VALUES,
        });
        return row;
      })
      .catch((error: unknown) => rethrowUnique(error, NAME_INDEX, nameTaken(false)));
    return toSupplierDto(created);
  }

  async update(
    org: OrgContext,
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierDto> {
    const current = await this.find(org, supplierId);
    if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
      await this.assertNameFree(org, input.name);
    }
    if (Object.keys(input).length === 0) return toSupplierDto(current);
    const updated = await this.db
      .transaction(async (tx) => {
        const row = await this.suppliers.update(tx, supplierId, input);
        await recordActivity(tx, org, {
          action: 'updated',
          entityType: 'supplier',
          entity: row,
          before: current,
          values: LOGGED_VALUES,
        });
        return row;
      })
      .catch((error: unknown) => rethrowUnique(error, NAME_INDEX, nameTaken(false)));
    return toSupplierDto(updated);
  }

  /** Hides the supplier from the directory and the pickers. Archiving twice changes nothing. */
  archive(org: OrgContext, supplierId: string): Promise<SupplierDto> {
    return this.setArchived(org, supplierId, true);
  }

  unarchive(org: OrgContext, supplierId: string): Promise<SupplierDto> {
    return this.setArchived(org, supplierId, false);
  }

  /**
   * Checks a supplier may be picked on a budget entry of the organization: it exists and is not
   * archived. (An entry keeps an archived supplier it already has: callers only check a change.)
   */
  async assertPickable(organizationId: string, supplierId: string): Promise<void> {
    const row = await this.suppliers.find(organizationId, supplierId);
    if (!row) throw new BadRequestException('supplierId: not a supplier of this organization');
    if (row.archivedAt) throw new BadRequestException('supplierId: this supplier is archived');
  }

  private async setArchived(
    org: OrgContext,
    supplierId: string,
    archived: boolean,
  ): Promise<SupplierDto> {
    const current = await this.find(org, supplierId);
    if ((current.archivedAt !== null) === archived) return toSupplierDto(current);
    const updated = await this.db.transaction(async (tx) => {
      const row = await this.suppliers.update(tx, supplierId, {
        archivedAt: archived ? new Date() : null,
      });
      await recordActivity(tx, org, {
        action: archived ? 'archived' : 'unarchived',
        entityType: 'supplier',
        entity: row,
        before: current,
        values: LOGGED_VALUES,
      });
      return row;
    });
    return toSupplierDto(updated);
  }

  private async find(org: OrgContext, supplierId: string): Promise<SupplierRow> {
    const row = await this.suppliers.find(org.organizationId, supplierId);
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  /** A name is unique per organization, ignoring case: archived suppliers count too. */
  private async assertNameFree(org: OrgContext, name: string): Promise<void> {
    const existing = await this.suppliers.findByName(org.organizationId, name);
    if (existing) throw new ConflictException(nameTaken(existing.archivedAt !== null));
  }
}

/**
 * The 409 message. The frontend tells the two cases apart by their start, so keep "name: an
 * archived supplier" as is. (A race caught by the unique index always reports the first case.)
 */
function nameTaken(archived: boolean): string {
  return archived
    ? 'name: an archived supplier has this name, unarchive it instead'
    : 'name: a supplier with this name already exists';
}

export function toSupplierDto(row: SupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toEntryDto(view: SupplierEntryView): SupplierEntryDto {
  return {
    id: view.entry.id,
    eventId: view.entry.eventId,
    type: view.entry.type,
    title: view.entry.title,
    estimatedCents: view.entry.estimatedCents,
    actualCents: view.entry.actualCents,
    files: view.files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
  };
}
