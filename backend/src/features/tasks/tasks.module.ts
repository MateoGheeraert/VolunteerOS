import { Module } from '@nestjs/common';
import {
  MemberTasksController,
  MyTasksController,
  TaskLabelsController,
  TasksController,
} from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  controllers: [TasksController, TaskLabelsController, MyTasksController, MemberTasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
