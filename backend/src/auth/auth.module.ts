import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getDrizzleToken } from '@nestjs/drizzle';
import { ENV, type Env } from '../config/env.js';
import type { Database } from '../db/database.js';
import { EmailService } from '../email/email.service.js';
import { AUTH, createAuth } from './auth.js';
import { AuthGuard } from './auth.guard.js';

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [getDrizzleToken(), ENV, EmailService],
      useFactory: (db: Database, env: Env, email: EmailService) => createAuth({ db, env, email }),
    },
    // Every route requires a signed-in user unless it is marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
