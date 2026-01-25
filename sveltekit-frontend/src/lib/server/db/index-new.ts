import * as schema from '$lib/server/db/schema-postgres';
import dotenv from 'dotenv';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import pgClient, { poolShim, type PoolLike } from '$lib/server/db-shim';

// Load environment-specific variables
const envFile = `.env.${process.env?.NODE_ENV ?? 'development'}`;
dotenv.config({ path: envFile });

// Internal pool reference
let _pool: any = null;
let _database: PostgresJsDatabase<typeof schema> | null = null;

// Initialize database lazily
function initializeDatabase(): PostgresJsDatabase<typeof schema> | null {
    if (_database) return _database;

    try {
        // Import drizzle dynamically to avoid issues
        const { drizzle } = require('drizzle-orm/postgres-js');
        _database = drizzle(pgClient, { schema });
        _pool = pgClient;
        return _database;
    } catch (err) {
        console.error('Failed to initialize database:', err);
        return null;
    }
}

// Main database connection using Proxy for lazy initialization
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
    {} as PostgresJsDatabase<typeof schema>,
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

// Schema exports
export * from '$lib/server/db/schema-postgres';

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
    if (_pool) {
        console.log('Closing PostgreSQL connection pool...');
        try {
            // Prefer calling end() on the current pool
            if (typeof _pool.end === 'function') {
                await _pool.end();
            } else if (typeof (poolShim as PoolLike).end === 'function') {
                // fallback to the imported pool shim
                await (poolShim as PoolLike).end!();
            } else if (typeof _pool.close === 'function') {
                await _pool.close();
            } else {
                console.warn('No end/close method found on pool or poolShim, nothing to close.');
            }
        } catch (err) {
            console.warn('Error closing pool shim:', err);
        }
    }
}
