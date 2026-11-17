import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * Starts a throwaway Postgres in Docker for this test run, applies the committed migrations,
 * and removes the container afterwards. Same major version as Neon (Postgres 17).
 */
export async function setup(project: TestProject) {
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  } catch (error) {
    throw new Error('Could not start the test Postgres container. Is Docker running?', {
      cause: error,
    });
  }

  const databaseUrl = container.getConnectionUri();
  const db = drizzle({ connection: databaseUrl });
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
  } finally {
    await db.$client.end();
  }

  project.provide('databaseUrl', databaseUrl);
}

export async function teardown() {
  await container?.stop();
}
