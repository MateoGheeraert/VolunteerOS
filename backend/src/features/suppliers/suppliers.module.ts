import { Module } from '@nestjs/common';
import { EventSuppliersController, SuppliersController } from './suppliers.controller.js';
import { SuppliersRepository } from './suppliers.repository.js';
import { SuppliersService } from './suppliers.service.js';

@Module({
  controllers: [SuppliersController, EventSuppliersController],
  providers: [SuppliersService, SuppliersRepository],
  exports: [SuppliersService],
})
export class SuppliersModule {}
