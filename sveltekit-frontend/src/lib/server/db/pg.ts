// @ts-nocheck
import { building } from '$app/environment';
import * as schema from '$lib/server/db/schema-postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import pgClient from '$lib/server/db-shim';

let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getPostgreSQLDatabase(): PostgresJsDatabase<typeof schema> | null {
	// Skip database initialization during SvelteKit build
	if (building) {
		console.log('Skipping database initialization during build');
		return null;
	}
	if (_db) return _db;

	const databaseUrl = process.env?.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
	const nodeEnv = process.env?.NODE_ENV ?? 'development';
	console.log('[PostgreSQL] Connecting via postgres-js client:', databaseUrl);

	// Create drizzle instance using postgres-js client (pgClient)
	_db = drizzle(pgClient as any, { schema });
	return _db;
}

// Cleanup function: attempt to close postgres-js client if supported
export async function closeDatabase(): Promise<void> {
	try {
		if (typeof (pgClient as any).end === 'function') {
			await (pgClient as any).end();
		}
	} catch (e) {
		console.warn('[PostgreSQL] Error closing postgres-js client:', e);
	} finally {
		_db = null;
	}
}
