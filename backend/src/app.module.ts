import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { AuthzModule } from './authz/authz.module.js';
import { HealthController } from './common/health.controller.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { EmailModule } from './email/email.module.js';
import { EventsModule } from './features/events/events.module.js';

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
    EmailModule,
    AuthModule,
    AuthzModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
