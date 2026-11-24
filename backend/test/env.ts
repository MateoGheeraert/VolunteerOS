import { inject } from 'vitest';

// Loaded before every integration test file, so loadEnv() sees a complete test environment.
// The database is the throwaway Docker container that global-setup.ts started for this run.
export const TEST_APP_URL = 'http://localhost:3000';
export const TEST_INTERNAL_SECRET = 'test-internal-secret-test-internal-secret';

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: inject('databaseUrl'),
  APP_URL: TEST_APP_URL,
  BETTER_AUTH_SECRET: 'test-better-auth-secret-test-better-auth-secret',
  INTERNAL_API_SECRET: TEST_INTERNAL_SECRET,
  // Nothing processes jobs in tests; AI is off (no API key), so no test ever calls a model.
  JOB_WORKERS: 'off',
});
delete process.env.RESEND_API_KEY;
delete process.env.OPENAI_API_KEY;
for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
  delete process.env[key];
}
