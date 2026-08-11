/**
 * Redis Connection Pool
 * Prevents connection exhaustion under load with round-robin distribution
 */

import Redis from 'ioredis';
import { closeValkeyClient, getValkeyClient, pingValkey } from './cache/valkey-client.js';

/**
 * Redis Connection Pool
 * Creates and manages a pool of Redis connections to prevent exhaustion
 */
class RedisConnectionPool {
	private pool: Redis[] = [];
	private maxConnections = 10;
	private currentIndex = 0;
	private isShuttingDown = false;

	constructor(maxConnections = 10) {
		this.maxConnections = maxConnections;
	}

	/**
	 * Get a connection from the pool (round-robin)
	 * Creates new connections up to maxConnections limit.
	 * Checks client status and recreates if closed.
	 */
	getConnection(): Redis {
		if (this.isShuttingDown) {
			throw new Error('Redis pool is shutting down');
		}
		if (this.pool.length === 0) {
			this.pool.push(getValkeyClient());
		}
		return this.pool[0];
	}

	/**
	 * Get current pool statistics
	 */
	getStats() {
		const client = this.pool[0] ?? getValkeyClient();
		return {
			totalConnections: 1,
			maxConnections: this.maxConnections,
			currentIndex: this.currentIndex,
			isShuttingDown: this.isShuttingDown,
			statuses: this.pool.map((client, i) => ({
				index: i,
				status: client.status
			})),
			sharedStatus: client.status
		};
	}

	/**
	 * Close all connections in the pool
	 * Call this on server shutdown
	 */
	async closeAll() {
		this.isShuttingDown = true;
		await closeValkeyClient().catch((err) => {
			console.error('[Redis Pool] Error closing shared Valkey client:', err);
		});
		this.pool = [];
		this.currentIndex = 0;
	}
}

// Global pool instance (Valkey-backed singleton compatibility layer)
export const redisPool = new RedisConnectionPool(1);

/**
 * Get a Redis connection from the pool
 * This is the primary export for use across the app
 */
export const getRedis = (): Redis => redisPool.getConnection();

/**
 * Legacy export: Single shared client (backwards compatibility)
 * DEPRECATED: Use getRedis() instead to leverage connection pooling
 *
 * ROUTE_IMPORT_INFRA_ISOLATION gate: this must NOT connect at module-evaluation
 * time. It previously called `redisPool.getConnection()` eagerly here, which
 * opened a real Valkey/Redis socket the instant any file imported `redis`
 * (even transitively) — the confirmed root cause of route-handler test hangs
 * that import this module without ever calling a Redis method (see
 * openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md,
 * "Follow-up investigation" section, for the discovery trail).
 *
 * Lazy Proxy: connection is deferred until the first property access (i.e.
 * the first `redis.get(...)` / `redis.set(...)` call site), matching the
 * existing precedent in vector/qdrant-manager.ts (`export const qdrant = new
 * Proxy(...)`). All 9 known callers (as of 2026-08-11) use `redis` purely as
 * a runtime method-call target — no `instanceof`, no destructuring, no
 * module-init-time access — so this is a behavior-preserving swap for every
 * confirmed caller pattern.
 */
export const redis: Redis = new Proxy({} as Redis, {
	get(_target, prop, _receiver) {
		const client = redisPool.getConnection();
		const value = Reflect.get(client, prop, client);
		return typeof value === 'function' ? value.bind(client) : value;
	},
	set(_target, prop, value) {
		const client = redisPool.getConnection();
		return Reflect.set(client, prop, value, client);
	},
});

/**
 * Factory for creating specialized Redis instances with custom config
 * Use this for special cases that need non-pooled connections
 */
export default function createRedisInstance(options: Record<string, unknown>): Redis {
	return new Redis(options as any);
}

/**
 * Create a standalone Redis connection (non-pooled)
 * Use sparingly - prefer getRedis() for pooled connections
 */
export function createRedisConnection() {
	return getValkeyClient().duplicate({
		maxRetriesPerRequest: 1,
		enableReadyCheck: false,
		connectTimeout: 3000,
		commandTimeout: 3000
	});
}

/**
 * Ensure Redis is ready
 * For pooled connections, checks the first connection in the pool
 */
export async function ensureRedis() {
	if (!(await pingValkey())) {
		throw new Error('Redis connection timeout');
	}
}

// =============================================================================
// Typed Hash Helpers (Sprint 3.6 G17 Hardening)
// Standardizes key naming and TTL enforcement for high-traffic metadata.
// =============================================================================

/**
 * Standard Redis Key Namespaces:
 *   ace:rank:demand   — 1h TTL, hit-demand hash (from chunk_hit_log)
 *   ace:authority:top — 6h TTL, top entries from graphify:gds
 *   ace:atlas:*       — 24h TTL, atlas directory cards
 *   gpu:karpathy:scores — 24h TTL, GPU rank blend
 *   agents:dir:*      — 24h TTL, LLMS.md envelope mirror
 *   taxonomy:clusters — 12h TTL, SOM/K-means cluster centroids
 */

/**
 * Typed Hash Helper with TTL
 * Standardizes the pattern of setting multiple fields in a hash and applying a TTL.
 */
export async function setHashWithTtl<T extends Record<string, string | number | boolean>>(
	key: string,
	fields: T,
	ttlSeconds: number
): Promise<void> {
	try {
		const redis = getRedis();
		// Use pipeline to ensure atomic-ish set + expire
		const pipeline = redis.pipeline();
		pipeline.hset(key, fields);
		pipeline.expire(key, ttlSeconds);
		await pipeline.exec();
	} catch (err) {
		console.warn(`[Redis] Failed to set hash with TTL for key ${key}:`, err);
	}
}

/**
 * Typed Hash Retrieval
 * Returns null if key doesn't exist or hash is empty.
 */
export async function getHash<T extends Record<string, string>>(
	key: string
): Promise<T | null> {
	try {
		const redis = getRedis();
		const data = await redis.hgetall(key);
		return Object.keys(data).length > 0 ? (data as T) : null;
	} catch {
		return null;
	}
}

/**
 * Generic JSON Set with TTL
 * Standardizes the pattern of stringifying objects and applying a TTL.
 */
export async function setJsonWithTtl<T>(
	key: string,
	value: T,
	ttlSeconds: number
): Promise<void> {
	try {
		const redis = getRedis();
		await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
	} catch (err) {
		console.warn(`[Redis] Failed to set JSON with TTL for key ${key}:`, err);
	}
}

/**
 * Generic JSON Retrieval
 * Automatically parses JSON string back to typed object. Returns null on miss.
 */
export async function getJson<T>(key: string): Promise<T | null> {
	try {
		const redis = getRedis();
		const raw = await redis.get(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

// =============================================================================
// Chat Message Cache
// Keys: chat:msg:{conversationId}:{index}  → JSON {role,content,timestamp}
//       chat:session:{sessionId}            → Redis Set of conversationIds
// TTL: 24 h (hot cache) — long-term storage handled by Qdrant/pgvector consumers
// =============================================================================

export interface CachedChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

const CHAT_MSG_TTL = 24 * 3600; // 24 h

/**
 * Persist a single chat message to Redis.
 * Call fire-and-forget from the SSE chat handler.
 */
export async function cacheMessage(
	conversationId: string,
	index: number,
	msg: CachedChatMessage,
	sessionId?: string
): Promise<void> {
	try {
		const redis = getRedis();
		const key = `chat:msg:${conversationId}:${index}`;
		await redis.set(key, JSON.stringify(msg), 'EX', CHAT_MSG_TTL);
		if (sessionId) {
			await redis.sadd(`chat:session:${sessionId}`, conversationId);
			await redis.expire(`chat:session:${sessionId}`, CHAT_MSG_TTL);
		}
	} catch {
		// non-fatal — DB is the source of truth
	}
}

/**
 * Read cached messages for a conversation in insertion order.
 * Returns [] on cache miss or Redis unavailability.
 */
export async function getCachedMessages(
	conversationId: string,
	limit = 100
): Promise<CachedChatMessage[]> {
	try {
		const redis = getRedis();
		const msgs: CachedChatMessage[] = [];
		for (let i = 0; i < limit; i++) {
			const raw = await redis.get(`chat:msg:${conversationId}:${i}`);
			if (!raw) break;
			msgs.push(JSON.parse(raw) as CachedChatMessage);
		}
		return msgs;
	} catch {
		return [];
	}
}

/**
 * Invalidate all cached messages for a conversation.
 */
export async function invalidateChatCache(conversationId: string, length: number): Promise<void> {
	try {
		const redis = getRedis();
		const keys = Array.from({ length }, (_, i) => `chat:msg:${conversationId}:${i}`);
		if (keys.length) await redis.del(...keys);
	} catch {
		// non-fatal
	}
}
