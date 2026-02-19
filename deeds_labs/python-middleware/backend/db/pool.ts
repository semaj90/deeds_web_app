import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// ─────────────────────────────────────────────────────────
// PostgreSQL Connection Pool Configuration
// ─────────────────────────────────────────────────────────

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

const DEFAULT_POOL_CONFIG = {
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout for acquiring a connection
};

/**
 * Initialize the database connection pool
 * Should be called once at application startup
 */
export function initializePool(config?: {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}): ReturnType<typeof drizzle> {
  if (db) {
    console.log('[DB] Connection pool already initialized');
    return db;
  }

  const poolConfig = {
    host: config?.host || process.env.DB_HOST || 'localhost',
    port: config?.port || parseInt(process.env.DB_PORT || '5432'),
    database: config?.database || process.env.DB_NAME || 'legal_ai',
    user: config?.user || process.env.DB_USER || 'postgres',
    password: config?.password || process.env.DB_PASSWORD || 'postgres',
    max: config?.max ?? DEFAULT_POOL_CONFIG.max,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? DEFAULT_POOL_CONFIG.connectionTimeoutMillis,
  };

  try {
    pool = new Pool(poolConfig);

    // Log pool events
    pool.on('error', (err) => {
      console.error('[DB Pool] Unexpected error on idle client:', err);
    });

    pool.on('connect', () => {
      console.log('[DB Pool] New client connected');
    });

    pool.on('remove', () => {
      console.log('[DB Pool] Client removed from pool');
    });

    // Initialize Drizzle ORM with the pool
    db = drizzle(pool, { schema });

    console.log('[DB] Connection pool initialized successfully');
    console.log(`[DB] Pool config: ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);

    return db;
  } catch (error) {
    console.error('[DB] Failed to initialize connection pool:', error);
    throw error;
  }
}

/**
 * Get the database instance
 * Throws error if pool not initialized
 */
export function getDb(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('[DB] Connection pool not initialized. Call initializePool() first.');
  }
  return db;
}

/**
 * Get the raw PostgreSQL pool
 * Useful for advanced operations or migrations
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('[DB] Connection pool not initialized. Call initializePool() first.');
  }
  return pool;
}

/**
 * Close the database connection pool
 * Should be called on application shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      console.log('[DB] Connection pool closed');
      pool = null;
      db = null;
    } catch (error) {
      console.error('[DB] Error closing connection pool:', error);
      throw error;
    }
  }
}

/**
 * Test the database connection
 * Useful for health checks
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await getDb().execute('SELECT 1');
    console.log('[DB] Connection test successful');
    return true;
  } catch (error) {
    console.error('[DB] Connection test failed:', error);
    return false;
  }
}

/**
 * Get pool statistics
 * Useful for monitoring
 */
export function getPoolStats() {
  if (!pool) {
    return null;
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}
