import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { canvasAutosaves } from './schema-canvas-autosaves.js';
import * as schema from './schema.js'; // Changed from schema-postgres to schema
import { ENV } from '$lib/server/env.server.js';
import { createDrizzleCache } from './drizzle-cache.js';
import { traceDB } from '$lib/server/observability/langfuse.js';

function getDatabaseUrl(): string {
 return ENV.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
}

function getAdminDatabaseUrl(): string {
 return process.env?.ADMIN_DATABASE_URL || getDatabaseUrl();
}

// Create merged schema object
const mergedSchema = { ...schema, canvasAutosaves };

// Query-level cache: ioredis-backed, 5min default TTL
// Use .$withCache() on any query, or .$withCache({ config: { ex: 3600 } }) for custom TTL
const cache = createDrizzleCache(300);

// Pool health tracking (Sprint 3.6)
let poolHealthy = true;
let adminPoolHealthy = true;
let lastPoolError: string | null = null;
let lastPoolErrorAt: Date | null = null;

export function isPoolHealthy(): boolean { return poolHealthy; }
export function isAdminPoolHealthy(): boolean { return adminPoolHealthy; }
export function getPoolStatus() {
	return { poolHealthy, adminPoolHealthy, lastPoolError, lastPoolErrorAt };
}
/** Reset pool health flag after successful connectivity check */
export function resetPoolHealth(): void {
	poolHealthy = true;
	adminPoolHealthy = true;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });
pool.on('error', (err) => {
	poolHealthy = false;
  lastPoolError = err.message;
  lastPoolErrorAt = new Date();
  console.error('Database pool error:', err.message);
});
// Enable pgvector iterative scanning for filtered HNSW queries (9x faster)
pool.on('connect', (client) => {
  client.query('SET hnsw.iterative_scan = relaxed_order').catch(() => {});
});
export const db = drizzle(pool, { schema: mergedSchema, cache });

const adminPool = new Pool({ connectionString: getAdminDatabaseUrl() });
adminPool.on('error', (err) => {
	adminPoolHealthy = false;
  lastPoolError = err.message;
  lastPoolErrorAt = new Date();
  console.error('Admin database pool error:', err.message);
});
// NOTE: Do NOT use casing: 'snake_case' — our schema uses explicit column names
// (e.g. passwordHash: varchar('hashed_password')) and casing would override them
// to password_hash, which doesn't exist in the DB.
export const adminDb = drizzle(adminPool, { schema: mergedSchema });

/**
 * Traced pool query — wraps pool.query with Langfuse tracing.
 * Use for raw SQL queries that need observability.
 */
export async function tracedQuery<T = any>(
	operation: string,
	queryText: string,
	params?: any[]
): Promise<T> {
	return traceDB(operation, { table: queryText.slice(0, 100) }, async () => {
		const result = await pool.query(queryText, params);
		return result as T;
	});
}

export async function closeConnections(): Promise<void> {
 await pool.end();
 await adminPool.end();
}

/**
 * Extract rows from a db.execute() result without `as any`.
 * Drizzle with node-postgres returns { rows: T[] }; this helper handles that
 * shape plus the fallback where the result is already an array.
 *
 * Usage: `const rows = pgRows<{ id: string }>(await db.execute(sql`...`));`
 */
export function pgRows<T extends Record<string, unknown> = Record<string, unknown>>(
	result: unknown
): T[] {
	if (Array.isArray(result)) return result as T[];
	const r = result as { rows?: T[] };
	return r.rows ?? [];
}

export { canvasAutosaves } from './schema-canvas-autosaves.js';
export * from './schema.js'; // Changed from schema-postgres

export default {
 db,
 adminDb,
 closeConnections,
};



