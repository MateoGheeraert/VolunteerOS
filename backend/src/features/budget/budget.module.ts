import { Module } from '@nestjs/common';
import { LabelsModule } from '../labels/labels.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetRepository } from './budget.repository.js';
import { BudgetService } from './budget.service.js';

@Module({
  imports: [LabelsModule, SuppliersModule, UploadsModule],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetRepository],
  exports: [BudgetService],
})
export class BudgetModule {}
