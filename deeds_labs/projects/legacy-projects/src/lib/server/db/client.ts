/**
 * Drizzle ORM client setup.
 * Uses the DATABASE_URL environment variable for connection.
 */

// Replace node-postgres + pg pool with postgres-js + drizzle-postgres-js
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
// Import env helper as default (could be a function or a string)
import getDatabaseUrl from '$lib/server/utils/env';
import * as schema from './schema'; // Import all schema definitions

// Resolve the database URL from helper (function or string) with safe fallbacks
const resolvedFromHelper =
  typeof getDatabaseUrl === 'function' ? getDatabaseUrl() : (getDatabaseUrl as string | undefined);

const DATABASE_URL =
  resolvedFromHelper ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';

// Create a postgres-js client (handles pooling internally)
const sql = postgres(DATABASE_URL, {
  // optional small defaults; adjust for your environment
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_MAX_CLIENTS ?? 10),
});

// Initialize Drizzle with postgres-js adapter and schema
export const db = drizzle(sql, { schema });

// Export default for compatibility with existing imports
export { db as default };

// Export connection string for debugging/health checks if needed
export const DB_CONNECTION_STRING = DATABASE_URL;
