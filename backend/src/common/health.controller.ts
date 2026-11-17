import { Controller, Get } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/auth.decorators.js';
import type { Database } from '../db/database.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Public()
  @Get()
  async check() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok' };
  }
}
