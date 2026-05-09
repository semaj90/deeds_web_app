// @ts-nocheck
import { building } from '$app/environment';
import * as schema from '$lib/server/db/schema-postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { ENV } from '$lib/server/env.server.js';

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function initializeDatabase(): PostgresJsDatabase<typeof schema> | null {
	if (building) {
		console.log('Skipping database initialization during build');
		return null;
	}
	if (_db) return _db;

	const databaseUrl = ENV.DATABASE_URL;
	console.log('🏗️ Connecting to PostgreSQL database');

    _client = postgres(databaseUrl);
	_db = drizzle(_client, { schema });
	console.log('✅ PostgreSQL database connected successfully');
	return _db;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy(
	{} as any,
	{
		get(target, prop, receiver) {
			const database = initializeDatabase();
			if (!database) {
				throw new Error('Database not initialized');
			}
			return Reflect.get(database, prop, receiver);
		}
	}
);

export const isPostgreSQL = true;
export const isSQLite = false;
export * from '$lib/server/db/schema-postgres';

export function closeDatabase() {
    // postgres-js uses .end() typically but here we have the client
	if (_client) {
        // @ts-ignore
		_client.end();
	}
}

