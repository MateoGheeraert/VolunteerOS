import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import { AUTH, type Auth } from './auth/auth.js';
import { internalSecretMiddleware } from './common/internal-secret.middleware.js';
import { ENV, type Env } from './config/env.js';

/**
 * Everything main.ts and the integration tests share, so tests run the real middleware order.
 * The app must be created with `bodyParser: false`: Better Auth reads the raw request body.
 */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  const auth = app.get<Auth>(AUTH);

  app.setGlobalPrefix('api');
  app.set('trust proxy', 'loopback, uniquelocal');

  // 1. Only the Next.js server (which knows the secret) gets past this point.
  app.use(internalSecretMiddleware(env.INTERNAL_API_SECRET));

  // 2. Better Auth handles /api/auth/* itself, before any body parsing.
  app.getHttpAdapter().getInstance().all('/api/auth/*splat', toNodeHandler(auth));

  // 3. Body parsing for everything else.
  app.useBodyParser('json', { limit: '1mb' });

  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app), {
      jsonDocumentUrl: 'api/openapi.json',
    });
  }
}

/** The OpenAPI document, generated from the controllers and their Zod schemas. */
export function createOpenApiDocument(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('VolunteerOS API')
    .setDescription('Internal API, reached only through the Next.js server.')
    .setVersion('0.1')
    .addCookieAuth('better-auth.session_token')
    .build();
  return SwaggerModule.createDocument(app, config);
}
