import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import {
  MemberTasksController,
  MyTasksController,
  TaskLabelsController,
  TasksController,
} from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [UploadsModule],
  controllers: [TasksController, TaskLabelsController, MyTasksController, MemberTasksController],
  providers: [TasksService, TasksRepository],
  exports: [TasksService],
})
export class TasksModule {}
