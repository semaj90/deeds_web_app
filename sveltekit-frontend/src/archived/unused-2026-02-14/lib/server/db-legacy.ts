/**
 * Database Connection Module
 * Provides a singleton PostgreSQL connection using the postgres library
 */

import postgres from 'postgres';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Create a single connection instance
const databaseUrl = process.env.DATABASE_URL ||
                   process.env.PG_CONN_STRING ||
                   'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

console.log(`📡 Initializing database connection to: ${databaseUrl.replace(/:[^:]*@/, ':***@')}`);
console.log(`📡 process.env.DATABASE_URL env var: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);

export const sql = postgres(databaseUrl, {
 max: 20,
 idle_timeout: 30,
 connect_timeout: 10,
});

sql`SELECT 1`
 .then(() => {
 console.log('✅ Database connection established');
 })
 .catch((err) => {
 console.error('❌ Database connection failed:', err.message);
 });

export default sql;



