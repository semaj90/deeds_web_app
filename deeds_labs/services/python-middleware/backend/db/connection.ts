/**
 * Database Connection Export
 *
 * Provides a singleton database connection for use throughout the application.
 * Automatically initializes the connection pool on first import.
 *
 * @module db/connection
 */

import { initializePool, getDb } from './pool.js';

// Initialize pool on module load
let db: ReturnType<typeof getDb>;

try {
	db = initializePool();
} catch (error) {
	console.error('[DB Connection] Failed to initialize database connection:', error);
	throw error;
}

// Export the database instance
export { db };

// Re-export pool utilities for convenience
export { getPool, closePool, testConnection, getPoolStats } from './pool.js';
