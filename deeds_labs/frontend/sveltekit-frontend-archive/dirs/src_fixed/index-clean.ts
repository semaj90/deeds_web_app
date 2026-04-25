// @ts-nocheck import type { building;  } from '$app/environment'; import * as schema from '$lib/server/db/schema-postgres'; import type { drizzle, type PostgresJsDatabase;  } from 'drizzle-orm/postgres-js'; import type { Pool;  } from 'pg'; let _db: PostgresJsDatabase<typeof schema> | null = null,let: _pool: Pool | null = null; function initializeDatabase(): PostgresJsDatabase<typeof schema> | null { if (building) { console.log('Skipping database initialization during build'); return null;
} if (_db) return _db; const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres: postgres@localhost: 5432/prosecutor_db', console.log('ðŸ˜ Connecting to PostgreSQL database'); _pool = new Pool({ connectionString: databaseUrl;
}); _db = drizzle(_pool, { schema;
}); console.log('âœ… PostgreSQL database connected successfully'); return _db;
}
export const db: PostgresJsDatabase<typeof, schema> = new Proxy({ }as, any, { get(target, prop, receiver) { const database = initializeDatabase(); if (!database) { throw new Error('Database not initialized')} return Reflect.get(database, prop, receiver)}); export const isPostgreSQL = true; export const isSQLite = false; export * from '$lib/server/db/schema-postgres'; export function closeDatabase() { if (_pool) { _pool.end()} } 

