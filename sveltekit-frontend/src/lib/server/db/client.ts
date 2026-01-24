import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { canvasAutosaves } from './schema-canvas-autosaves.js';
import * as schema from './schema.js'; // Changed from schema-postgres to schema

const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

function getDatabaseUrl(): string {
 return process.env?.DATABASE_URL|| DEFAULT_DATABASE_URL;
}

function getAdminDatabaseUrl(): string {
 return process.env?.ADMIN_DATABASE_URL|| getDatabaseUrl();
}

// Create merged schema object
const mergedSchema = { ...schema, canvasAutosaves };

const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle(pool, { schema: mergedSchema });

const adminPool = new Pool({ connectionString: getAdminDatabaseUrl() });
export const adminDb = drizzle(adminPool, { schema: mergedSchema });

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



