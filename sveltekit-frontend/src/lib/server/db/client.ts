import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { canvasAutosaves } from './schema-canvas-autosaves.js';
import * as schema from './schema.js'; // Changed from schema-postgres to schema
import { ENV } from '$lib/server/env.server.js';

function getDatabaseUrl(): string {
 return ENV.DATABASE_URL;
}

function getAdminDatabaseUrl(): string {
 return process.env?.ADMIN_DATABASE_URL || getDatabaseUrl();
}

// Create merged schema object
const mergedSchema = { ...schema, canvasAutosaves };

export const pool = new Pool({ connectionString: getDatabaseUrl() });
pool.on('error', (err) => {
	console.error('Database pool error (non-fatal):', err.message);
});
export const db = drizzle(pool, { schema: mergedSchema, casing: 'snake_case' });

const adminPool = new Pool({ connectionString: getAdminDatabaseUrl() });
adminPool.on('error', (err) => {
	console.error('Admin database pool error (non-fatal):', err.message);
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



