import { drizzle } from 'drizzle-orm/postgres-js';
// @ts-ignore
import postgres from 'postgres';
import * as schema from './schema.js';

// Use legal_ai_db as the default database
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

// Re-export schema for convenience
export * from './schema.js';

// Export connection string for verification
export const DB_CONNECTION_STRING = connectionString;

