/**
 * Database Connection Pool
 *
 * Provides a centralized Drizzle ORM connection pool for the NES Command Center
 * and other database operations. Handles connection management, retries, and
 * graceful error handling.
 *
 * @module db/pool
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';

// Import from server schema which has proper definitions
// Use dynamic import to handle schema errors gracefully
let schema: Record<string, unknown> = {};
try {
  // @ts-expect-error - dynamic import for error resilience
  schema = await import('$lib/server/db/schema-postgres.js');
} catch (e) {
  console.warn('[db/pool] Schema import failed, using empty schema:', e);
}

/**
 * PostgreSQL connection configuration
 */
const connectionString =
  DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

/**
 * Connection pool configuration
 *
 * - max: Maximum number of connections in the pool
 * - idle_timeout: Close idle connections after 20 seconds
 * - connect_timeout: Timeout for establishing new connections
 * - max_lifetime: Maximum lifetime of a connection (60 minutes)
 */
const poolConfig = {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 60, // 60 minutes
};

/**
 * PostgreSQL client with connection pooling
 */
const client = postgres(connectionString, poolConfig);

/**
 * Drizzle ORM instance with full schema
 *
 * This instance includes all table definitions and relations,
 * enabling type-safe queries across the entire database.
 */
export const db = drizzle(client, { schema });

/**
 * Get database connection
 *
 * Returns the Drizzle ORM instance for use in API handlers and services.
 * The connection pool is managed automatically.
 *
 * @returns Drizzle ORM instance
 *
 * @example
 * ```typescript
 * import { getDb } from '$lib/db/pool';
 *
 * const db = getDb();
 * const routes = await db.select().from(routeMetadata);
 * ```
 */
export function getDb() {
  return db;
}

/**
 * Test database connection
 *
 * Attempts to execute a simple query to verify the database is accessible.
 * Useful for health checks and startup validation.
 *
 * @returns Promise that resolves to true if connection is successful
 *
 * @example
 * ```typescript
 * import { testConnection } from '$lib/db/pool';
 *
 * const isHealthy = await testConnection();
 * if (!isHealthy) {
 *   console.error('Database connection failed');
 * }
 * ```
 */
export async function testConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Close database connection pool
 *
 * Gracefully closes all connections in the pool. Should be called
 * during application shutdown to prevent connection leaks.
 *
 * @example
 * ```typescript
 * import { closePool } from '$lib/db/pool';
 *
 * // During shutdown
 * await closePool();
 * ```
 */
export async function closePool(): Promise<void> {
  try {
    await client.end();
    console.log('Database connection pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
}

/**
 * Execute a query with automatic retry logic
 *
 * Retries failed queries up to 3 times with exponential backoff.
 * Useful for handling transient connection errors.
 *
 * @param queryFn - Function that executes the database query
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise with query result
 *
 * @example
 * ```typescript
 * import { withRetry } from '$lib/db/pool';
 *
 * const result = await withRetry(async () => {
 *   return await db.select().from(routeMetadata);
 * });
 * ```
 */
export async function withRetry<T>(queryFn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = 100 * Math.pow(2, attempt);
      console.warn(
        `Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Health check for database connection
 *
 * Returns detailed health information including connection status,
 * pool statistics, and response time.
 *
 * @returns Promise with health check result
 *
 * @example
 * ```typescript
 * import { healthCheck } from '$lib/db/pool';
 *
 * const health = await healthCheck();
 * console.log('Database health:', health);
 * ```
 */
export async function healthCheck(): Promise<{, healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await client`SELECT 1`;
    const responseTime = Date.now() - startTime;

    return {
      healthy: true,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      healthy: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export the client for advanced use cases
export { client };
