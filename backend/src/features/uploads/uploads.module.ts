import { Module } from '@nestjs/common';
import { UploadsCleanupService } from './uploads-cleanup.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsRepository } from './uploads.repository.js';
import { UploadsService } from './uploads.service.js';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadsRepository, UploadsCleanupService],
  exports: [UploadsService],
})
export class UploadsModule {}
