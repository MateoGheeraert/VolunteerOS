/**
 * Writes the OpenAPI document to backend/openapi.json (`pnpm openapi:export`).
 * The frontend generates its typed client from that file, and CI fails when it is out of date.
 * It boots the app without connecting to a database: the connection pool is only opened on the
 * first query, so placeholder values are enough here.
 */
import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';

Object.assign(process.env, {
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://openapi:export@localhost:5432/openapi',
  APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'openapi-export-placeholder-secret-0000',
  INTERNAL_API_SECRET: 'openapi-export-placeholder-secret-0000',
});
delete process.env.RESEND_API_KEY;

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('./app.module.js');
const { createOpenApiDocument } = await import('./app.setup.js');

const app = await NestFactory.create<import('@nestjs/platform-express').NestExpressApplication>(
  AppModule,
  { bodyParser: false, logger: false },
);
app.setGlobalPrefix('api');
const document = createOpenApiDocument(app);
await app.close();

const output = new URL('../openapi.json', import.meta.url);
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${output.pathname}`);
