import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
// @ts-ignore
import postgres from 'postgres';
import * as schema from './schema';
import { ENV } from '$lib/server/env.server.js';

const connectionString = ENV.DATABASE_URL;

const client = postgres(connectionString);
export const sql = drizzleSql; // Export Drizzle's sql template tag, not the client
export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });

export * from './schema';

// Export connection string for verification
export const DB_CONNECTION_STRING = connectionString;

export default db;




