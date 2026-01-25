/**
 * Centralized Database Connection Manager
 * Handles all database connections with connection pooling and error recovery
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import pgClient, { poolShim } from '$lib/server/db-shim';
import { getDatabaseConfig, validateDatabaseConfig } from '$lib/config/database.js';
import * as schema from './schema-postgres.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Minimal pool/client types
type LocalClientLike = {
	query: (
		textOrConfig: string | { text: string; values?: any[] },
		params?: any[]
	) => Promise<{ rows?: Record<string, unknown>[] }>;
	release?: () => void;
};

type LocalPoolLike = {
	connect?: () => Promise<LocalClientLike>;
	end?: () => Promise<void>;
	on?: (event: string, handler: (...args: any[]) => void) => void;
	totalCount?: number;
	idleCount?: number;
	waitingCount?: number;
};

type RowLike = Record<string, unknown>;

// Global connection instances
let appPool: LocalPoolLike | null = null;
let adminPool: LocalPoolLike | null = null;
let postgresJsClient: unknown | null = null;
let drizzleDb: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Resolve a pool candidate from available shims/clients
 */
function resolvePool(): LocalPoolLike | null {
	if (poolShim) return poolShim as LocalPoolLike;
	if (pgClient && (pgClient as any).pool) return (pgClient as any).pool as LocalPoolLike;
	return null;
}

/**
 * Initialize application database pool
 */
export function getAppPool(): LocalPoolLike {
	if (!appPool) {
		const validation = validateDatabaseConfig();
		if (!validation.valid) {
			throw new Error(`Invalid database configuration: ${validation.errors?.join(', ') ?? 'unknown'}`);
		}

		const environment = (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development';
		appPool = resolvePool();

		if (!appPool) {
			throw new Error('No database pool implementation available');
		}

		try {
			appPool.on?.('error', (err: Error) => console.error('Database pool error:', err));
			appPool.on?.('connect', () => console.log('✅ Database pool connection established'));
		} catch (e) {
			console.warn('Failed to attach appPool handlers', e);
		}

		console.log(`🐘 Database pool initialized for ${environment} environment`);
	}
	return appPool;
}

/**
 * Initialize admin database pool
 */
export function getAdminPool(): LocalPoolLike {
	if (!adminPool) {
		adminPool = resolvePool();

		if (!adminPool) {
			throw new Error('No admin database pool available');
		}

		try {
			adminPool.on?.('error', (err: Error) => console.error('Admin database pool error:', err));
			adminPool.on?.('connect', () => console.log('🔧 Admin database pool connection established'));
		} catch (e) {
			console.warn('Failed to attach adminPool handlers', e);
		}

		console.log('🔧 Admin database pool initialized');
	}
	return adminPool;
}

/**
 * Get postgres.js client
 */
export function getPostgresJsClient(): unknown {
	if (!postgresJsClient) {
		if (!pgClient) {
			throw new Error('Postgres.js client not available from shim');
		}
		postgresJsClient = pgClient;
		console.log('🚀 Postgres.js client initialized');
	}
	return postgresJsClient;
}

/**
 * Get Drizzle database instance
 */
export function getDrizzleDb(): PostgresJsDatabase<typeof schema> {
	if (!drizzleDb) {
		const client = getPostgresJsClient();
		drizzleDb = drizzle(client as any, { schema });
		console.log('🗄️ Drizzle database initialized');
	}
	return drizzleDb!;
}

/**
 * Execute a query with automatic connection management
 */
export async function executeQuery<T>(
	queryFn: (client: LocalClientLike) => Promise<T>,
	useAdmin = false
): Promise<T> {
	const pool = useAdmin ? getAdminPool() : getAppPool();

	if (!pool?.connect) {
		throw new Error('Database pool does not support connect()');
	}

	const conn = await pool.connect();
	try {
		return await queryFn(conn);
	} finally {
		try {
			if (conn && typeof conn.release === 'function') conn.release();
		} catch (e) {
			console.warn('Failed to release DB connection', e);
		}
	}
}

/**
 * Test database connectivity
 */
export async function testDatabaseConnection(): Promise<{
	success: boolean;
	version?: string;
	tables?: string[];
	extensions?: string[];
	error?: string;
}> {
	try {
		const pool = getAppPool();
		if (!pool?.connect) {
			return { success: false, error: 'App pool unavailable' };
		}

		const conn = await pool.connect();
		try {
			const versionResult = await conn.query('SELECT version()');
			const version = versionResult.rows?.[0]?.version as string | undefined;

			const tablesResult = await conn.query(`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'public'
				ORDER BY table_name
			`);
			const tables = (tablesResult.rows || [])
				.map((r: RowLike) => r['table_name'] as string | undefined)
				.filter(Boolean) as string[];

			const extensionsResult = await conn.query(`
				SELECT extname
				FROM pg_extension
				ORDER BY extname
			`);
			const extensions = (extensionsResult.rows || [])
				.map((r: RowLike) => r['extname'] as string | undefined)
				.filter(Boolean) as string[];

			return { success: true, version, tables, extensions };
		} finally {
			try {
				if (conn && typeof conn.release === 'function') conn.release();
			} catch (e) {
				console.warn('Failed to release connection after test', e);
			}
		}
	} catch (error) {
		console.error('Database connection test failed:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Close all database connections
 */
export async function closeDatabaseConnections(): Promise<void> {
	const promises: Promise<void>[] = [];

	if (appPool) {
		try {
			if (typeof appPool.end === 'function') promises.push(appPool.end());
		} catch (e) {
			console.warn('Error closing appPool', e);
		}
		appPool = null;
	}

	if (adminPool) {
		try {
			if (typeof adminPool.end === 'function') promises.push(adminPool.end());
		} catch (e) {
			console.warn('Error closing adminPool', e);
		}
		adminPool = null;
	}

	if (postgresJsClient) {
		const client = postgresJsClient as { end?: () => Promise<void>; close?: () => Promise<void> };
		try {
			if (typeof client.end === 'function') promises.push(client.end());
		} catch {
			try {
				if (typeof client.close === 'function') promises.push(client.close());
			} catch (e) {
				console.warn('Failed to close postgresJsClient', e);
			}
		}
		postgresJsClient = null;
	}

	await Promise.all(promises);
	drizzleDb = null;
	console.log('🛑 All database connections closed');
}

/**
 * Health check for database connections
 */
export async function getDatabaseHealth(): Promise<{
	status: 'healthy' | 'unhealthy';
	config?: Record<string, unknown>;
	connection?: { success: boolean; version?: string; tables?: string[]; extensions?: string[] };
	pools?: { app: { totalCount: number; idleCount: number; waitingCount: number } };
	errors?: string[];
}> {
	const config = getDatabaseConfig() as Record<string, unknown>;
	const validation = validateDatabaseConfig();

	if (!validation.valid) {
		return {
			status: 'unhealthy',
			errors: validation.errors
		};
	}

	try {
		const connectionTest = await testDatabaseConnection();

		return {
			status: connectionTest.success ? 'healthy' : 'unhealthy',
			config: {
				host: config.host,
				port: config.port,
				database: config.database,
				user: config.user,
				ssl: config.ssl
			},
			connection: connectionTest,
			pools: {
				app: {
					totalCount: appPool?.totalCount ?? 0,
					idleCount: appPool?.idleCount ?? 0,
					waitingCount: appPool?.waitingCount ?? 0
				}
			}
		};
	} catch (error) {
		return {
			status: 'unhealthy',
			errors: [error instanceof Error ? error.message : 'Unknown error']
		};
	}
}

