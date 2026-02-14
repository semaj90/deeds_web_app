/* CONSOLIDATED DATABASE EXPORT Re-exports the canonical database connection from db/drizzle.ts (node-postgres adapter) This file exists for backward compatibility with legacy imports. MIGRATION GUIDE: -, OLD: import { db } from '$lib/server/database' - NEW: import db from '$lib/server/db/index' (preferred) This ensures all code uses the same connection pool (pg.Pool with node-postgres adapter) */ // Re-export canonical database connection (node-postgres with pg.Pool) export { db, sql, pool } from './db/drizzle.js'; export type DB = typeof import('./db/drizzle.js').db; // Re-export schema tables export * from './db/schema.js'; // Legacy compatibility: Re-export commonly used tables import { text, jsonb } from 'drizzle-orm/pg-core';



