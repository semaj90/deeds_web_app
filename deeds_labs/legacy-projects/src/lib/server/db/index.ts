/**
 * Database connection for Legal AI Platform
 * Using Drizzle ORM with PostgreSQL
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export schema for easy access
export * from './schema';

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    await pool.end();
    console.log('Database pool closed');
  });
}
