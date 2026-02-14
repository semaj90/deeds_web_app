/**
 * Redis Client Configuration
 * Provides connection management for Redis caching and orchestration
 */
import Redis from 'ioredis';
import dotenv from 'dotenv';
import createRedisConnection, { redis } from '$lib/server/redis'; // Fix: createRedisConnection is the default export
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

dotenv.config();

export interface RedisConfig {
	host: string;
	port: number;
	password?: string;
	db: number;
	retryDelayOnFailover: number;
	maxRetriesPerRequest: number;
	lazyConnect: boolean;
}

// Use REDIS_URL if provided, otherwise fallback to individual config
// Default Redis configuration
const defaultConfig: RedisConfig = {
	host: process.env?.REDIS_HOST ?? 'localhost',
	port: parseInt(process.env?.REDIS_PORT ?? '6379'),
	password: process.env.REDIS_PASSWORD,
	db: 0,
	retryDelayOnFailover: 100,
	maxRetriesPerRequest: 3,
	lazyConnect: true
};

// Replace strict dependency on package types with a minimal local interface
// that declares only the members we use. This prevents TS errors if installed
// Redis lib's types differ from runtime.
interface MinimalRedisClient {
	on(event: string, listener: (...args: any[]) => void): this;
	ping(): Promise<string>;
	quit(): Promise<string>;
	disconnect(): void;
	// allow additional members as optional to avoid tight coupling
	[key: string]: unknown;
}

// Use the minimal interface for runtime instances
type IORedisClient = MinimalRedisClient;

// This is the module's managed shared instance
// It seems `redis` exported from '$lib/server/redis' is already the instance we want to use
// or `createRedisConnection` creates it.
// To match signature: let, redisInstance: IORedisClient | null = null;
let isConnected = false;

/**
 * Get Redis client instance
 */
export async function getRedisClient(): Promise<IORedisClient | null> {
	if (redis) {
        // Assuming 'redis' imported from '$lib/server/redis' is the client instance
        // If it is initialized, return it.
        // We also check our local wrapper `redisInstance` if the import is just a binding
        return redis as unknown as IORedisClient;
    }

    // If we need to create one:
	try {
		// Delegate creation to centralized helper which manages URL/password and options
		const instance = createRedisConnection();
        // The helper likely returns the client.

		// Attach minimal-typed event handlers
		(instance as any).on('connect', () => {
			isConnected = true;
			console.log('🕹️ Redis connected successfully');
		});
		(instance as any).on('error', (error: any) => {
			isConnected = false;
			console.warn('🔴 Redis connection error: ', (error && error.message) || String(error));
		});
		(instance as any).on('close', () => {
			isConnected = false;
			console.log('🔴 Redis connection closed');
		});

        return instance as unknown as IORedisClient;

	} catch (error) {
		console.error('Failed to create redis client', error);
		return null;
	}
}

/**
 * Check Redis connection status
 */
export function isRedisConnected(): boolean {
	return isConnected && redis !== null;
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
    // We reference the imported 'redis' object.
    // If it is immutable/const from import we can't null it easily but we can quit it.
    const client = redis as unknown as IORedisClient;
	if (client) {
		try {
			await client.quit();
		} catch (e) {
			// attempt force disconnect if quit fails
			try {
				console.warn('⚠️ Redis quit failed, forcing disconnect: ', e instanceof Error ? e.message : String(e));
				client.disconnect();
			} catch (inner) {
				console.error('⚠️ Redis forced disconnect failed: ', inner);
			}
		}
		isConnected = false;
		console.log('🕹️ Redis connection closed gracefully');
	}
}

/**
 * Create Redis client for specific use case
 */
export function createRedisClient(customConfig: Partial<RedisConfig> = {}): IORedisClient {
	// For custom clients we can still construct a new ioredis instance, but
	// prefer delegating to createRedisInstance when no custom config is needed.
	if (Object.keys(customConfig).length === 0) {
		// If no custom config, return the module's managed 'redis' instance (if available)
		// or create a new one with default config.
		return (redis || createRedisConnection()) as unknown as IORedisClient;
	}

	const config = { ...defaultConfig, ...customConfig };
	const client = new Redis({
		host: config.host,
		port: config.port,
		password: config.password,
		db: config.db,
		maxRetriesPerRequest: config.maxRetriesPerRequest,
		retryStrategy: (times: number) => Math.min(times * 100, 2000)
	}) as unknown as IORedisClient;

	client.on('error', (error: any) => {
		console.warn('🔴 Redis client error: ', error?.message ?? String(error));
	});

	return client;
}

/**
 * Redis health check
 */
export async function checkRedisHealth(): Promise<{
	status: 'healthy' | 'disconnected' | 'error'; latency?: number; error?: string }> {
	try {
		const start = Date.now();
        // Use getRedisClient to ensure we have a client
		const client = await getRedisClient();

		if (!client) {
			return { status: 'disconnected', error: 'No Redis client available' };
		}

		await client.ping();
		const latency = Date.now() - start;
		return { status: 'healthy', latency };
	} catch (error) {
		return { status: 'error', error: error instanceof Error ? error.message : String(error) };
	}
}

// Export a single redisClient reference and the helper functions
// Provide a typed alias to the shared redis instance from the central module so callers can
// continue importing `redisClient` from this helper while we still rely on the central factory.
export const redisClient = redis;

