import { defineConfig, devices } from '@playwright/test';

/**
 * Local smoke tests against both apps running (`pnpm dev` at the repository root).
 * Not in CI yet: they need a database and both servers.
 */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'nl-BE',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
