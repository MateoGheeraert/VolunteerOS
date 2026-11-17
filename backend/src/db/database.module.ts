import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ENV, type Env } from '../config/env.js';
import * as schema from './schema/index.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        db: drizzle({
          connection: { connectionString: env.DATABASE_URL, max: 10 },
          schema,
          casing: 'snake_case',
        }),
      }),
    }),
  ],
})
export class DatabaseModule {}
