import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { redisService } from './redis-service.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

interface DatabasePoolConfig {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	max: number;
	idle_timeout: number;
	connect_timeout: number;
	prepare: boolean; // boolean in postgres options, simplified from 'require' | 'allow' | 'prefer'
    ssl: boolean | 'require' | 'prefer' | 'allow';
}

interface CachedQuery {
	sql: string;
	params: any[];
	timestamp: number;
	result: unknown;
	ttl: number; // seconds
}

class DatabasePoolService {
	private pools: Map<string, ReturnType<typeof postgres>> = new Map();
	private drizzleInstances: Map<string, PostgresJsDatabase<any>> = new Map();
	// keep an in-memory index only — do NOT store large results here to avoid memory bloat
	private queryCacheIndex: Map<string, Omit<CachedQuery, 'result'>> = new Map();

	// Cache settings
	private readonly DEFAULT_CACHE_TTL = 300; // 5 minutes
	private readonly QUERY_CACHE_PREFIX = 'db:query:';
	private readonly CONNECTION_STATS_PREFIX = 'db:stats:';

	private connectionString: string;
	private config: DatabasePoolConfig;

	constructor() {
		// Use centralized env helper pattern and prefer Docker service names with localhost fallback
		const DB_HOST =
			process.env?.DB_HOST || (process.env.NODE_ENV === 'production' ? 'postgres' : 'localhost');
		const DB_PORT =
			process.env?.DB_PORT || (process.env.NODE_ENV === 'production' ? '5432' : '5434');
		const DB_USER = process.env?.DB_USER ?? 'legal_admin';
		const DB_PASS = process.env?.DB_PASS ?? '123456';
		const DB_NAME = process.env?.DB_NAME ?? 'legal_ai_db';

		// Prefer a provided process.env.DATABASE_URL (common with docker-compose), otherwise build one
		this.connectionString =
			process.env?.DATABASE_URL ||
			`postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

		this.config = {
			host: DB_HOST,
			port: parseInt(String(DB_PORT), 10),
			database: DB_NAME,
			username: DB_USER,
			password: DB_PASS,
			max: parseInt(process.env?.DB_POOL_SIZE ?? '10', 10),
			idle_timeout: parseInt(process.env?.DB_IDLE_TIMEOUT ?? '30', 10),
			connect_timeout: parseInt(process.env?.DB_CONNECT_TIMEOUT ?? '10', 10),
			prepare: process.env.NODE_ENV === 'production',
			ssl: process.env.DB_SSL === 'true' ? 'require' : false
		};
	}

	// Helper to check Redis health consistently
	private async isRedisHealthy(): Promise<boolean> {
		try {
			if (!redisService) return false;
			if (typeof redisService.isHealthy === 'function') {
				return !!(await redisService.isHealthy());
			}
			// if no isHealthy helper, do a lightweight probe if get exists
			if (typeof (redisService as any).ping === 'function') {
				const pong = await (redisService as any).ping();
				return pong === 'PONG' || pong === true;
			}
			return false;
		} catch (err) {
			return false;
		}
	}

	/**
	 * Get or create a connection pool for a specific context
	 */
	async getPool(context: string = 'default'): Promise<ReturnType<typeof postgres>> {
		const poolKey = `${context}:${this.config.database}`;
		if (this.pools.has(poolKey)) {
			const pool = this.pools.get(poolKey)!;
			await this.recordConnectionStats(context, 'reused');
			return pool;
		}

		// Create new pool with optional dynamic adjustments (based on Redis stats)
		const redisStats = (await this.isRedisHealthy())
			? await this.getRedisConnectionStats(context)
			: {};
		const dynamicConfig = await this.adjustPoolSize(redisStats);

		const pool = postgres(this.connectionString, {
			// postgres-js accepts connectionString, additional options vary by client.
			// merge in dynamic options where supported, keep object minimal to avoid unsupported keys
			max: dynamicConfig.max ?? this.config.max,
			prepare: this.config.prepare,
			ssl: this.config.ssl,
			timeout: this.config.connect_timeout * 1000,
            idle_timeout: dynamicConfig.idle_timeout ?? this.config.idle_timeout,
			onnotice: () => {},
	// Suppress debug
			debug: process.env.NODE_ENV === 'development'
		} as any);

		this.pools.set(poolKey, pool);
		await this.recordConnectionStats(context, 'created');
		console.log(
			`🔗 Database pool created, context: ${context} (size: ${dynamicConfig.max ?? this.config.max})`
		);
		return pool;
	}

	/**
	 * Get Drizzle instance with connection pooling
	 */
	async getDrizzle(context: string = 'default'): Promise<PostgresJsDatabase<any>> {
		const poolKey = `drizzle:${context}`;
		if (this.drizzleInstances.has(poolKey)) {
			return this.drizzleInstances.get(poolKey)!;
		}

		const pool = await this.getPool(context);
		// create Drizzle instance from the postgres-js pool
		const db = drizzle(pool);
		this.drizzleInstances.set(poolKey, db);
		return db;
	}

	/**
	 * Execute cached query with Redis integration
	 * - Redis is the authoritative cache; avoid storing large result objects in-process
	 */
	async queryCached<T = any>(
		sql: string,
		params: any[] = [],
		context: string = 'default',
		ttl: number = this.DEFAULT_CACHE_TTL
	): Promise<T> {
		const cacheKey = this.generateCacheKey(sql, params);
		const redisKey = `${this.QUERY_CACHE_PREFIX}${cacheKey}`;

		if (await this.isRedisHealthy()) {
			try {
				const cached = await redisService.get(redisKey);
				if (cached) {
					// cached stored JSON string
					const cachedQuery: CachedQuery = JSON.parse(cached as string);
					if (Date.now() - cachedQuery.timestamp < cachedQuery.ttl * 1000) {
						console.log(`📋 Cache hit for query (redis): ${sql.substring(0, 80)}...`);
						return cachedQuery.result as T;
					}
				}
			} catch (error) {
				console.warn('Cache read error (redis):', (error as Error).message);
			}
		}

		// Execute query using pool
		const pool = await this.getPool(context);
		// postgres-js supports tagged template or unsafe; use unsafe for dynamic SQL strings
		const result = await (pool as any).unsafe(sql, params);

		// Cache result in Redis only (no heavy in-memory retention)
		if (await this.isRedisHealthy()) {
			try {
				const cacheData: CachedQuery = {
					sql,
					params,
					timestamp: Date.now(),
					result,
					ttl
				};
				await redisService.set(redisKey, JSON.stringify(cacheData), ttl);
				// update lightweight index for inspection (no result stored)
				this.queryCacheIndex.set(cacheKey, {
					sql,
					params,
					timestamp: cacheData.timestamp,
					ttl
				});
				console.log(`💾 Cached query result in Redis (TTL: ${ttl}s)`);
			} catch (error) {
				console.warn('Cache write error (redis):', (error as Error).message);
			}
		} else {
			// keep small index (no result) so getStats can show presence without holding payloads
			this.queryCacheIndex.set(cacheKey, { sql, params, timestamp: Date.now(), ttl });
		}

		return result as T;
	}

	/**
	 * Invalidate cache for specific patterns
	 */
	async invalidateCache(pattern: string): Promise<void> {
		if (!(await this.isRedisHealthy())) return;
		try {
			const keys = await redisService.keys(`${this.QUERY_CACHE_PREFIX}${pattern}`);
			if (Array.isArray(keys) && keys.length > 0) {
				for (const key of keys) {
					await redisService.del(key);
				}
				console.log(`🗑️ Invalidated ${keys.length} cached queries`);
			}
		} catch (error) {
			console.warn('Cache error: ', (error as Error).message);
		}
	}

	/**
	 * Get connection statistics from Redis
	 */
	private async getRedisConnectionStats(context: string): Promise<any> {
		if (!(await this.isRedisHealthy())) return {};
		try {
			const stats = await redisService.hgetall(`${this.CONNECTION_STATS_PREFIX}${context}`);
            const result: any = {};
            if (stats) {
                result.totalConnections = parseInt((stats.total as string) ?? '0', 10);
                result.activeConnections = parseInt((stats.active as string) ?? '0', 10);
                result.avgResponseTime = parseFloat((stats.avgResponse as string) ?? '0');
                result.lastUpdate = parseInt((stats.lastUpdate as string) ?? '0', 10);
            }
			return result;
		} catch (error) {
			console.warn('Failed to get stats: ', (error as Error).message);
			return {};
		}
	}

	/**
	 * Dynamically adjust pool size based on Redis stats
	 */
	private async adjustPoolSize(stats: any): Promise<Partial<DatabasePoolConfig>> {
		const baseSize = this.config.max;
		let adjustedSize = baseSize;

		// Adjust based on current load
		if (stats && typeof stats.activeConnections === 'number') {
			if (stats.activeConnections > baseSize * 0.8) {
				adjustedSize = Math.min(Math.floor(baseSize * 1.5), 20); // Scale up but at 20
			} else if (stats.activeConnections < baseSize * 0.3) {
				adjustedSize = Math.max(Math.floor(baseSize * 0.7), 3); // Scale down but minimum 3
			}
		}

		return {
			max: Math.floor(adjustedSize),
            // if connection stats available and last update recent, maybe reduce idle
            idle_timeout: (stats.lastUpdate && Date.now() - stats.lastUpdate < 60000) ? 60 : this.config.idle_timeout
		};
	}

	/**
	 * Record connection statistics to Redis
	 */
	private async recordConnectionStats(
		context: string,
		operation: 'created' | 'reused'
	): Promise<void> {
		if (!(await this.isRedisHealthy())) return;
		try {
			const key = `${this.CONNECTION_STATS_PREFIX}${context}`;
			const timestamp = Date.now();

			// increment total creations if created
			if (operation === 'created') {
				await redisService.hincrby(key, 'total', 1);
				await redisService.hincrby(key, 'creates', 1);
			} else {
				await redisService.hincrby(key, 'reuses', 1);
			}

			await redisService.hset(key, 'lastUpdate', timestamp.toString());
			await redisService.expire(key, 3600); // Stats expire after 1 hour
		} catch (error) {
			console.warn('Failed to record stats: ', (error as Error).message);
		}
	}

	/**
	 * Generate cache key for query
	 */
	private generateCacheKey(sql: string, params: any[]): string {
		const normalized = sql.replace(/\s+/g, ' ').trim();
		const paramsStr = JSON.stringify(params);
		return Buffer.from(`${normalized}:${paramsStr}`).toString('base64').substring(0, 32);
	}

	/**
	 * Close all connections and clean up
	 */
	async close(): Promise<void> {
		console.log('🔌 Closing database pools...');
		for (const [key, pool] of this.pools) {
			try {
				// postgres-js client exposes end()
				if (typeof (pool as any).end === 'function') {
					await (pool as any).end();
				} else if (typeof (pool as any).close === 'function') {
					await (pool as any).close();
				}
				console.log(`✅ pool: ${key}`);
			} catch (error) {
				console.error(`❌ Error closing pool ${key}:`, (error as Error).message);
			}
		}
		this.pools.clear();
		this.drizzleInstances.clear();
		// keep lightweight index but clear entries (no heavy payloads kept here)
		this.queryCacheIndex.clear();
	}

	/**
	 * Health check for all pools
	 */
	async healthCheck(): Promise<Record<string, boolean>> {
		const results: Record<string, boolean> = {};
		for (const [key, pool] of this.pools) {
			try {
				// use the pool as a tagged template to run a quick query
				await (pool as any)`SELECT 1`;
				results[key] = true;
			} catch (error) {
				results[key] = false;
				console.error(`❌ Health check failed for pool ${key}: `, (error as Error).message);
			}
		}
		return results;
	}

	/**
	 * Get pool statistics
	 */
	getStats(): unknown {
		const stats = {
			totalPools: this.pools.size,
			totalDrizzleInstances: this.drizzleInstances.size,
			cacheCount: this.queryCacheIndex.size,
			pools: {}
		};

		for (const [key /*, pool*/] of this.pools) {
			(stats.pools as Record<string, any>)[key] = { status: 'active' };
		}
		return stats;
	}
}

// Export singleton instance
export const dbPool = new DatabasePoolService();

// Graceful shutdown
if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => {
        void dbPool.close().catch(e => console.error('Error closing DB pool SIGTERM: ', e));
    });
    process.on('SIGINT', () => {
        void dbPool.close().catch(e => console.error('Error closing DB pool SIGINT: ', e));
    });
}

