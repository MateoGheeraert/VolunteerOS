import { Module } from '@nestjs/common';
import { PlanningRuleController } from './planning-rule.controller.js';
import { PlanningRuleService } from './planning-rule.service.js';
import { PlanningController, PublicRegistrationController } from './planning.controller.js';
import { PlanningRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import { PublicRegistrationService } from './public-registration.service.js';
import { ScheduleService } from './schedule.service.js';
import { VolunteersService } from './volunteers.service.js';

@Module({
  controllers: [PlanningController, PublicRegistrationController, PlanningRuleController],
  providers: [
    PlanningRepository,
    PlanningService,
    VolunteersService,
    ScheduleService,
    PublicRegistrationService,
    PlanningRuleService,
  ],
  // Mila's planning suggestions are accepted through these (src/ai/planning).
  exports: [PlanningRepository, PlanningService, VolunteersService, PlanningRuleService],
})
export class PlanningModule {}
