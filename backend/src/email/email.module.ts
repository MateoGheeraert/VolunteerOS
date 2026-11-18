import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ConsoleEmailProvider, EmailProvider, ResendEmailProvider } from './email-provider.js';
import { DEFAULT_RETRY_DELAYS_MS, EMAIL_RETRY_DELAYS_MS, EmailService } from './email.service.js';

export function createEmailProvider(
  env: Pick<Env, 'NODE_ENV' | 'EMAIL_PROVIDER' | 'RESEND_API_KEY'>,
): EmailProvider {
  const provider = env.EMAIL_PROVIDER ?? (env.NODE_ENV === 'production' ? 'resend' : 'console');
  if (env.NODE_ENV === 'production' && provider !== 'resend') {
    throw new Error('EMAIL_PROVIDER must be resend in production');
  }
  if (provider === 'console') return new ConsoleEmailProvider();
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER is resend');
  }
  return new ResendEmailProvider(env.RESEND_API_KEY);
}

@Global()
@Module({
  providers: [
    { provide: EmailProvider, inject: [ENV], useFactory: createEmailProvider },
    { provide: EMAIL_RETRY_DELAYS_MS, useValue: DEFAULT_RETRY_DELAYS_MS },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
