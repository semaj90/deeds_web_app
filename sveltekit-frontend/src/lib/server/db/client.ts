import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { canvasAutosaves } from './schema-canvas-autosaves.js';
import * as schema from './schema.js'; // Changed from schema-postgres to schema
import { ENV } from '$lib/server/env.server.js';
import { createDrizzleCache } from './drizzle-cache.js';

function getDatabaseUrl(): string {
 return ENV.DATABASE_URL;
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
export const db = drizzle(pool, { schema: mergedSchema, casing: 'snake_case', cache });

const adminPool = new Pool({ connectionString: getAdminDatabaseUrl() });
adminPool.on('error', (err) => {
	adminPoolHealthy = false;
  lastPoolError = err.message;
  lastPoolErrorAt = new Date();
  console.error('Admin database pool error:', err.message);
});
export const adminDb = drizzle(adminPool, { schema: mergedSchema, casing: 'snake_case' });

export async function closeConnections(): Promise<void> {
 await pool.end();
 await adminPool.end();
}

export { canvasAutosaves } from './schema-canvas-autosaves.js';
export * from './schema.js'; // Changed from schema-postgres

export default {
 db,
 adminDb,
 closeConnections,
};



