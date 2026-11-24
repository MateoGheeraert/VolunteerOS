import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentEventAccess,
  OrgScoped,
  RequireEventAccess,
  RequireOrgAdmin,
} from '../../authz/authz.decorators.js';
import type { EventAccess } from '../../authz/event-access.service.js';
import { CurrentOrg, type OrgContext } from '../../authz/org-context.js';
import {
  createSupplierSchema,
  eventSupplierSchema,
  supplierDetailSchema,
  supplierListItemSchema,
  supplierSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from './suppliers.schemas.js';
import { SuppliersService } from './suppliers.service.js';

/** A malformed id can't match anything: answer like an unknown one. */
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * The organization's suppliers: every member reads, adds and edits them; owners and admins
 * archive them. There is no delete.
 */
@ApiTags('suppliers')
@OrgScoped()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  /** Every supplier, archived ones included (the client filters). */
  @Get()
  @ApiResponse({ status: 200, standardSchema: z.array(supplierListItemSchema) })
  list(@CurrentOrg() org: OrgContext) {
    return this.suppliers.list(org);
  }

  @Post()
  @ApiResponse({ status: 201, standardSchema: supplierSchema })
  create(
    @CurrentOrg() org: OrgContext,
    @Body({ schema: createSupplierSchema }) body: CreateSupplierInput,
  ) {
    return this.suppliers.create(org, body);
  }

  /** The supplier and the events whose budget references it, with the entries and their files. */
  @Get(':supplierId')
  @ApiResponse({ status: 200, standardSchema: supplierDetailSchema })
  detail(@CurrentOrg() org: OrgContext, @Param('supplierId', uuid) supplierId: string) {
    return this.suppliers.detail(org, supplierId);
  }

  @Patch(':supplierId')
  @ApiResponse({ status: 200, standardSchema: supplierSchema })
  update(
    @CurrentOrg() org: OrgContext,
    @Param('supplierId', uuid) supplierId: string,
    @Body({ schema: updateSupplierSchema }) body: UpdateSupplierInput,
  ) {
    return this.suppliers.update(org, supplierId, body);
  }

  @Post(':supplierId/archive')
  @HttpCode(200)
  @RequireOrgAdmin()
  @ApiResponse({ status: 200, standardSchema: supplierSchema })
  archive(@CurrentOrg() org: OrgContext, @Param('supplierId', uuid) supplierId: string) {
    return this.suppliers.archive(org, supplierId);
  }

  @Post(':supplierId/unarchive')
  @HttpCode(200)
  @RequireOrgAdmin()
  @ApiResponse({ status: 200, standardSchema: supplierSchema })
  unarchive(@CurrentOrg() org: OrgContext, @Param('supplierId', uuid) supplierId: string) {
    return this.suppliers.unarchive(org, supplierId);
  }
}

/** The suppliers an event's budget references: read-only, derived from the budget. */
@ApiTags('suppliers')
@OrgScoped()
@Controller('events/:eventId/suppliers')
export class EventSuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequireEventAccess('read')
  @ApiResponse({ status: 200, standardSchema: z.array(eventSupplierSchema) })
  list(@CurrentOrg() org: OrgContext, @CurrentEventAccess() access: EventAccess) {
    return this.suppliers.forEvent(org, access);
  }
}
