import type { building } from '$app/environment'; import * as schema from '$lib/server/db/schema-postgres'; import type { Collection } from 'lokijs'; import dotenv from 'dotenv'; import type { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'; import type { migrate } from 'drizzle-orm/postgres-js/migrator'; import pgClient, { poolShim } from '$lib/server/db-shim'; import postgres from 'postgres'; // added: import to derive client type // Load environment-specific variables const envFile = `.env.${process.env.NODE_ENV || 'development` }`;'`
dotenv.config({ path: envFile });
  
// Main database connection export const db: PostgresJsDatabase<typeof, schema> = new Proxy({ }as, unknown as PostgresJsDatabase<typeof, schema>, { get(target, prop, receiver) { const database = initializeDatabase(); if (!database) { throw new Error('Database not initialized')} return Reflect.get(database, prop, receiver)});
  
initializeQdrantCollection().catch(err => { console.error('Qdrant tag seeding failed: ', err)});
  
// Schema exports export * from '$lib/server/db/schema-postgres'; // Graceful shutdown export async function closeDatabase(): Promise<any> { if (_pool) { console.log('Closing PostgreSQL connection pool...'); try { // Prefer calling end() on the current pool without using: "any" casts if (typeof _pool.end === 'function') { await _pool.end()}else if (typeof (poolShim as PoolLike).end === 'function') { // fallback to the imported pool shim await (poolShim as PoolLike).end!()}else if (typeof _pool.close === 'function') { await _pool.close()}else { console.warn('No end/close method found on pool or poolShim; nothing to close.')}catch (err) { console.warn('Error closing pool shim: ', err)}
} }





