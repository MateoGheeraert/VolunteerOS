/**
 * Sends every email template, with its preview props, to a real inbox:
 *
 *   pnpm email:test --to you@example.com [--template organization-invitation] [--console]
 *
 * Goes through the real pipeline (EmailService → email_delivery → provider), with Resend unless
 * --console is given, so it needs RESEND_API_KEY and a migrated DATABASE_URL in .env.
 * Each run uses fresh idempotency keys (`test:<template>:<timestamp>`).
 */
import 'reflect-metadata';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    to: { type: 'string' },
    template: { type: 'string' },
    console: { type: 'boolean', default: false },
  },
});
if (!values.to) {
  console.error('Usage: pnpm email:test --to you@example.com [--template <name>] [--console]');
  process.exit(1);
}
process.env.EMAIL_PROVIDER = values.console ? 'console' : 'resend';

const { Module } = await import('@nestjs/common');
const { NestFactory } = await import('@nestjs/core');
const { ConfigModule } = await import('../config/config.module.js');
const { DatabaseModule } = await import('../db/database.module.js');
const { EmailModule } = await import('./email.module.js');
const { EmailService } = await import('./email.service.js');
const { emailTemplates } = await import('./email-templates.js');
type EmailTemplateName = import('./email-templates.js').EmailTemplateName;

const names = Object.keys(emailTemplates) as EmailTemplateName[];
const selected = values.template ? [values.template] : names;
const unknown = selected.filter((name) => !names.includes(name as EmailTemplateName));
if (unknown.length > 0) {
  console.error(`Unknown template ${unknown.join(', ')}. Templates: ${names.join(', ')}`);
  process.exit(1);
}

@Module({ imports: [ConfigModule, DatabaseModule, EmailModule] })
class SendTestEmailsModule {}

const app = await NestFactory.createApplicationContext(SendTestEmailsModule, {
  logger: ['error', 'warn', 'log'],
});
let failed = false;
try {
  const emails = app.get(EmailService);
  for (const name of selected as EmailTemplateName[]) {
    try {
      const result = await emails.send({
        template: name,
        to: values.to,
        props: emailTemplates[name].previewProps as never,
        idempotencyKey: `test:${name}:${Date.now()}`,
      });
      console.log(`✓ ${name} → ${values.to} (${result.outcome}, delivery ${result.deliveryId})`);
    } catch (error) {
      failed = true;
      console.error(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.cause instanceof Error) {
        console.error(`  cause: ${error.cause.message}`);
      }
    }
  }
} finally {
  await app.close();
}
process.exit(failed ? 1 : 0);
