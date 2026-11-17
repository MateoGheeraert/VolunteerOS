import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ConsoleEmailService, EmailService, ResendEmailService } from './email.service.js';

@Global()
@Module({
  providers: [
    {
      provide: EmailService,
      inject: [ENV],
      useFactory: (env: Env): EmailService => {
        if (env.RESEND_API_KEY) {
          return new ResendEmailService(env.RESEND_API_KEY, env.EMAIL_FROM);
        }
        if (env.NODE_ENV === 'production') {
          throw new Error('RESEND_API_KEY is required in production');
        }
        return new ConsoleEmailService();
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
