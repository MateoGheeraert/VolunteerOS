// Entry point for `pnpm auth:schema` (Better Auth CLI). Never imported by the app.
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConsoleEmailService } from '../email/email.service.js';
import { createAuth } from './auth.js';

export const auth = createAuth({
  db: drizzle.mock(),
  env: {
    APP_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'cli-only-secret-cli-only-secret-00',
  },
  email: new ConsoleEmailService(),
});
