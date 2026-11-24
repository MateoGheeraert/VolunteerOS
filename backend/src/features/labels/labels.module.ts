import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller.js';
import { LabelsRepository } from './labels.repository.js';
import { LabelsService } from './labels.service.js';

@Module({
  controllers: [LabelsController],
  providers: [LabelsService, LabelsRepository],
  exports: [LabelsService],
})
export class LabelsModule {}
