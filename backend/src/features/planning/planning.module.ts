import { Module } from '@nestjs/common';
import { PlanningController, PublicRegistrationController } from './planning.controller.js';
import { PlanningRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import { PublicRegistrationService } from './public-registration.service.js';
import { ScheduleService } from './schedule.service.js';
import { VolunteersService } from './volunteers.service.js';

@Module({
  controllers: [PlanningController, PublicRegistrationController],
  providers: [
    PlanningRepository,
    PlanningService,
    VolunteersService,
    ScheduleService,
    PublicRegistrationService,
  ],
})
export class PlanningModule {}
