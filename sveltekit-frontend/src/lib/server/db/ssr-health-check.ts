/**
 * SSR Database Health Check Utility
 * Validates PostgreSQL connectivity in SSR context with graceful error handling
 *
 * Requirements: 5.1, 5.2, 5.5
 */
import { appPool, adminPool } from './connections.js';

export interface HealthCheckResult {
	healthy: boolean;
	timestamp: string;
	database: {
	connected: boolean;
		version?: string;
		tableCount?: number;
		error?: string;
	};
	latency?: number;
}

/**
 * Perform a lightweight database health check suitable for SSR
 * Returns quickly with graceful error handling
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
	const startTime = Date.now();
	const result: HealthCheckResult = {
		healthy: false,
		timestamp: new Date().toISOString(),
		database: {
	connected: false
		}
	};

	let client;
	try {
		// Get a client from the pool with timeout
		client = await Promise.race([
			appPool.connect(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Connection timeout')), 5000)
			)
		]);

		// Run a simple query to verify connection
		const versionResult = await client.query('SELECT version() as pg_version');
		result.database.connected = true;
		result.database.version = versionResult.rows[0]?.pg_version?.split(',')[0] || 'unknown';

		// Check table count
		const tableCheck = await client.query(`
			SELECT COUNT(*) as table_count
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		`);
		result.database.tableCount = parseInt(tableCheck.rows[0]?.table_count || '0', 10);

		result.healthy = true;
		result.latency = Date.now() - startTime;

	} catch (error: unknown) {
		const err = error as Error;
		result.database.error = err.message || 'Unknown database error';
		result.latency = Date.now() - startTime;
		console.warn('⚠️ Database health check failed:', err.message);
	} finally {
		if (client && typeof client.release === 'function') {
			client.release();
		}
	}

	return result;
}

/**
 * Verify database connection for SSR page load
 * Returns data or null with error info
 */
export async function verifySSRDatabaseConnection<T>(
	queryFn: () => Promise<T>,
	fallback: T
): Promise<{
	data: T; error?: string;
	fromFallback: boolean }> {
	try {
		const data = await queryFn();
		return { data, fromFallback: false };
	} catch (error: unknown) {
		const err = error as Error;
		console.warn('⚠️ SSR database query failed:', err.message);
		return {
			data: fallback,
			error: err.message || 'Database query failed',
			fromFallback: true
		};
	}
}

/**
 * Check if essential tables exist for the application
 */
export async function checkEssentialTables(): Promise<{
	exists: boolean;
	missing: string[];
	found: string[];
}> {
	const essentialTables = [
		'users',
		'sessions',
		'cases',
		'evidence',
		'chat_messages'
	];

	const result = {
		exists: false,
		missing: [] as string[],
		found: [] as string[]
	};

	let client;
	try {
		client = await appPool.connect();

		const tableQuery = await client.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_type = 'BASE TABLE'
			AND table_name = ANY($1)
		`, [essentialTables]);

		const foundTables = tableQuery.rows.map((r: {
	table_name: string }) => r.table_name);
		result.found = foundTables;
		result.missing = essentialTables.filter(t => !foundTables.includes(t));
		result.exists = result.missing.length === 0;

	} catch (error: unknown) {
		const err = error as Error;
		console.warn('⚠️ Essential tables check failed:', err.message);
		result.missing = essentialTables;
	} finally {
		if (client && typeof client.release === 'function') {
			client.release();
		}
	}

	return result;
}

/**
 * Get database connection status for API endpoints
 */
export async function getDatabaseStatus(): Promise<{
	status: 'healthy' | 'degraded' | 'unavailable';
	details: HealthCheckResult;
}> {
	const health = await checkDatabaseHealth();

	let status: 'healthy' | 'degraded' | 'unavailable' = 'unavailable';

	if (health.healthy) {
		status = 'healthy';
	} else if (health.database.connected) {
		status = 'degraded';
	}

	return { status, details: health };
}

export default {
	checkDatabaseHealth,
	verifySSRDatabaseConnection,
	checkEssentialTables,
	getDatabaseStatus
};
