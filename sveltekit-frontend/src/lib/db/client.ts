// Auto-matching PostgreSQL client for YoRHa Legal AI Platform
// Automatically detects and uses available database environment variables

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Environment variable picker - tries multiple common patterns
function pickEnv(...names: string[]) {
 for (const name of names) {
 if (process.env[name]) return process.env[name];
 }
 return undefined;
}

// Build PostgreSQL connection string with auto-matching
function buildConnectionString() {
 // Prefer full URL if available
 let url = pickEnv('DATABASE_URL', 'DB_URL', 'PG_URL');

 if (!url) {
 // Build from individual components
 const host = pickEnv('DB_HOST', 'POSTGRES_HOST', 'PGHOST') ?? 'localhost';
 const port = pickEnv('DB_PORT', 'POSTGRES_PORT', 'PGPORT') ?? '5434';
 const user = pickEnv('DB_USER', 'POSTGRES_USER', 'PGUSER') ?? 'legal_admin';
 const pass = pickEnv('DB_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD') ?? '123456';
 const name = pickEnv('DB_NAME', 'POSTGRES_DB', 'PGDATABASE') ?? 'legal_ai_db';

 url = `postgres://${user}:${pass}@${host}:${port}/${name}`;
 }

 return url;
}

// Create PostgreSQL connection pool
const pool = new Pool({
 connectionString: buildConnectionString(max: 20, // Connection pool size
 idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000
});
  
export const db = drizzle(pool);

// Health check function
export async function testConnection(): Promise<boolean> {
 try {
 const result = await pool.query('SELECT version(), now() as current_time');
 console.log('✅ PostgreSQL Connection Successful:', result.rows[0]);
 return true;
 } catch (error) {
 console.error('❌ Database Connection Failed:', error);
 return false;
 }
}

// Cleanup function
export async function closeConnection(): Promise<void> {
 try {
 await pool.end();
 console.log('✅ Database connection closed');
 } catch (error) {
 console.error('❌ Error closing database connection:', error);
 }
}

// Default export for convenience
export default db;


