import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

/** The `tx` a `db.transaction(async (tx) => ...)` callback receives. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Either the database or an open transaction: what repository write methods accept. */
export type DbExecutor = Database | Transaction;
