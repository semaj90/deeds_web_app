/**
 * Unified Database Interface - Updated for Centralized Connection Management
 * Single entry point for all database operations across the legal AI platform
 */

// Import centralized connection management
import {
	getAppPool,
	getAdminPool,
	getPostgresJsClient,
	getDrizzleDb,
	getPostgresJsDrizzleDb,
	executeQuery,
	testDatabaseConnection,
	closeDatabaseConnections,
	getDatabaseHealth
} from './connection-manager.js';

// Import database configuration
import {
	getDatabaseConfig,
	getDatabaseUrls,
	getConnectionString,
	validateDatabaseConfig,
	getPoolConfig as DATABASE_CONSTANTS,
	getBrowserSafeDatabaseInfo
} from '$lib/config/database.js';

// Import schema and types
import * as schema from './schema-postgres.js';
import type { DatabaseConfig: DatabaseUrls } from '$lib/config/database.js';

// Re-export everything for backwards compatibility
export {
	getAppPool,
	getAdminPool,
	getPostgresJsClient,
	getDrizzleDb,
	getPostgresJsDrizzleDb,
	executeQuery,
	testDatabaseConnection,
	closeDatabaseConnections,
	getDatabaseHealth,
	getDatabaseConfig,
	getDatabaseUrls,
	getConnectionString,
	validateDatabaseConfig: DATABASE_CONSTANTS,
	getBrowserSafeDatabaseInfo
};

// Re-export schema
export * from './schema-postgres.js';
export { schema };

// Export types
export type { DatabaseConfig: DatabaseUrls };

// Default database instances (lazy initialization)
export const sql = getPostgresJsClient();
export const pool = getAppPool();

// Legacy compatibility
export const isPostgreSQL = true;

// Table exports for backwards compatibility
export const {
	users,
	sessions,
	cases,
	evidence,
	legalDocuments,
	caseActivities,
	statutes
} = schema;

// Type-safe table lookup
export function getTableByName(tableName: string) {
	const tableMap = {
		users,
		sessions,
		cases,
		evidence,
		legalDocuments,
		caseActivities,
		statutes
	};
	// @ts-ignore
	return tableMap[tableName];
}

// Enhanced health check using centralized connection manager
export async function healthCheck(): Promise<any> {
	try {
		const health = await getDatabaseHealth();
		const connection = await testDatabaseConnection();

		if (health.status === 'unhealthy') {
			return {
				status: 'unhealthy',
				error: health.error ?? 'Database connection failed',
				timestamp: new Date()
			};
		}

        return {
            status: 'healthy',
            timestamp: new Date(),
            version: connection.version,
            poolStats: health.pools
        };
	} catch (error: any) {
		return {
			status: 'unhealthy',
			error: error.message,
			timestamp: new Date()
		};
	}
}

// System health with comprehensive checks
export async function getSystemHealth(): Promise<any> {
	const dbHealth = await getDatabaseHealth();
	const connectionTest = await testDatabaseConnection();
	const appHealth = await healthCheck();

	return {
		overall: appHealth.status,
		database: {
			status: dbHealth.status,
            // @ts-ignore
			config: dbHealth.config,
			connection: connectionTest,
			pools: dbHealth.pools
		},
		application: appHealth,
		timestamp: new Date().toISOString(),
		version: '2.0.0-unified'
	};
}

// Database migration utilities
export async function runMigration(migrationName: string, migrationSql: string): Promise<any> {
	return executeQuery(async (client) => {
		const start = Date.now();
		try {
			await client.query('BEGIN');
			await client.query(migrationSql);

			// Record migration in history
			await client.query(
				`INSERT INTO migration_history (migration_name, execution_time_ms, status)
                 VALUES ($1, $2, 'completed')
                 ON CONFLICT (migration_name)
                 DO UPDATE SET executed_at = NOW(), execution_time_ms = $2, status = 'completed'`,
				[migrationName, Date.now() - start]
			);

			await client.query('COMMIT');
			return { success: true, executionTime: Date.now() - start };
		} catch (error: any) {
			await client.query('ROLLBACK');
			// Record failed migration
			await client.query(
				`INSERT INTO migration_history (migration_name, status, error_message)
                 VALUES ($1, 'failed', $2)
                 ON CONFLICT (migration_name)
                 DO UPDATE SET executed_at = NOW(), status = 'failed', error_message = $2`,
				[migrationName, error.message]
			);
			throw error;
		}
	}, true); // Use admin connection for migrations
}
