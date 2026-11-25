import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthzModule } from './authz/authz.module.js';
import { HealthController } from './common/health.controller.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { BudgetModule } from './features/budget/budget.module.js';
import { EmailModule } from './email/email.module.js';
import { EventsModule } from './features/events/events.module.js';
import { OverviewModule } from './features/overview/overview.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LabelsModule } from './features/labels/labels.module.js';
import { PlanningModule } from './features/planning/planning.module.js';
import { ProfileModule } from './features/profile/profile.module.js';
import { PromotionModule } from './features/promotion/promotion.module.js';
import { SuppliersModule } from './features/suppliers/suppliers.module.js';
import { TasksModule } from './features/tasks/tasks.module.js';
import { UploadsModule } from './features/uploads/uploads.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
          // Never log credentials or the internal secret.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-internal-secret"]',
            'res.headers["set-cookie"]',
          ],
        },
      }),
    }),
    DatabaseModule,
    JobsModule,
    StorageModule,
    EmailModule,
    AuthModule,
    AuthzModule,
    EventsModule,
    LabelsModule,
    TasksModule,
    UploadsModule,
    BudgetModule,
    SuppliersModule,
    PlanningModule,
    ProfileModule,
    AiModule,
    OverviewModule,
    PromotionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
