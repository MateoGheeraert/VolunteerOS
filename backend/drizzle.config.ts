import { defineConfig } from 'drizzle-kit';

// Migrations need a direct (unpooled) connection: Neon's pooler runs in transaction mode.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('Set DATABASE_URL_UNPOOLED (or DATABASE_URL) to run drizzle-kit');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
