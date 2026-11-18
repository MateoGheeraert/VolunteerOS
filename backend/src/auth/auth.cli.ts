// Entry point for `pnpm auth:schema` (Better Auth CLI). Never imported by the app.
import { drizzle } from 'drizzle-orm/node-postgres';
import { createAuth } from './auth.js';

export const auth = createAuth({
  db: drizzle.mock(),
  env: {
    APP_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'cli-only-secret-cli-only-secret-00',
  },
  // The CLI only reads the schema; it never sends email.
  email: { send: () => Promise.reject(new Error('The Better Auth CLI does not send email')) },
});
