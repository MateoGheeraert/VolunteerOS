import { Module } from '@nestjs/common';
import { LabelsModule } from '../labels/labels.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { MemberTasksController, MyTasksController, TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [LabelsModule, UploadsModule],
  controllers: [TasksController, MyTasksController, MemberTasksController],
  providers: [TasksService, TasksRepository],
  exports: [TasksService],
})
export class TasksModule {}
