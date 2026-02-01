import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
// @ts-ignore
import postgres from 'postgres';
import * as schema from './schema';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Use legal_ai_db as the default database
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const connectionString = process.env?.DATABASE_URL|| DEFAULT_DATABASE_URL;

const client = postgres(connectionString);
export const sql = drizzleSql; // Export Drizzle's sql template tag, not the client
export const db = drizzle(client, { schema });

export * from './schema';

// Export connection string for verification
export const DB_CONNECTION_STRING = connectionString;

export default db;




