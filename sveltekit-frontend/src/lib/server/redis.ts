/**
 * Redis Connection Pool
 * Prevents connection exhaustion under load with round-robin distribution
 */

import Redis from 'ioredis';
import { ENV } from '$lib/server/env.server.js';

const REDIS_URL = ENV.REDIS_URL;

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
	 * Creates new connections up to maxConnections limit
	 */
	getConnection(): Redis {
		if (this.isShuttingDown) {
			throw new Error('Redis pool is shutting down');
		}

		// Create new connection if pool not at capacity
		if (this.pool.length < this.maxConnections) {
			const client = new Redis(REDIS_URL, {
				maxRetriesPerRequest: 1,
				enableReadyCheck: false,
				connectTimeout: 3000,
				commandTimeout: 3000,
				retryStrategy: (times: number) => {
					if (times > 2) return null; // Stop after 2 attempts
					return Math.min(times * 100, 500);
				},
				lazyConnect: false // Auto-connect on creation
			});

			// Handle connection errors
			client.on('error', (err) => {
				console.error('[Redis Pool] Connection error:', err.message);
			});

			this.pool.push(client);
			return client;
		}

		// Round-robin existing connections
		const connection = this.pool[this.currentIndex];
		this.currentIndex = (this.currentIndex + 1) % this.pool.length;
		return connection;
	}

	/**
	 * Get current pool statistics
	 */
	getStats() {
		return {
			totalConnections: this.pool.length,
			maxConnections: this.maxConnections,
			currentIndex: this.currentIndex,
			isShuttingDown: this.isShuttingDown,
			statuses: this.pool.map((client, i) => ({
				index: i,
				status: client.status
			}))
		};
	}

	/**
	 * Close all connections in the pool
	 * Call this on server shutdown
	 */
	async closeAll() {
		this.isShuttingDown = true;
		await Promise.all(
			this.pool.map((client) =>
				client.quit().catch((err) => {
					console.error('[Redis Pool] Error closing connection:', err);
				})
			)
		);
		this.pool = [];
		this.currentIndex = 0;
	}
}

// Global pool instance
export const redisPool = new RedisConnectionPool(10);

/**
 * Get a Redis connection from the pool
 * This is the primary export for use across the app
 */
export const getRedis = (): Redis => redisPool.getConnection();

/**
 * Legacy export: Single shared client (backwards compatibility)
 * DEPRECATED: Use getRedis() instead to leverage connection pooling
 */
export const redis = redisPool.getConnection();

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
	return new Redis(REDIS_URL, {
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
	const client = getRedis();
	if (client.status === 'ready') return;

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
		const onReady = () => {
			clearTimeout(timeout);
			client.off('error', onError);
			resolve();
		};
		const onError = (err: Error) => {
			clearTimeout(timeout);
			client.off('ready', onReady);
			reject(err);
		};
		client.on('ready', onReady);
		client.on('error', onError);
	});
}

// =============================================================================
// TODO: Chat Message Caching & Tensor Store
// =============================================================================
// Phase: Redis optimization tensor analysis for chat persistence
//
// 1. Cache user chat messages as Redis hashes keyed by `chat:{conversationId}:{msgIndex}`
// 2. Generate embeddings (embeddinggemma:latest) for each user message on write
// 3. Store embedding tensors as Redis binary buffers: `chat:embed:{conversationId}:{msgIndex}`
// 4. Ripgrep-style semantic search: query cached directives using cosine similarity
// 5. Mirror embeddings to Qdrant collection `chat_directives` for long-term vector retrieval
// 6. Mirror to pgvector `chat_message_embeddings` table for SQL-based analytics
// 7. TTL: 24h for hot cache, Qdrant/pgvector for permanent storage
// 8. Use case: retrieve past user instructions across context window resets
//    e.g. "user said use Ollama not OpenAI" → searchable via embedding similarity
//
// Redis key schema:
//   chat:msg:{conversationId}:{index}     → JSON { role, content, timestamp }
//   chat:embed:{conversationId}:{index}   → Float32Array (768-dim embeddinggemma)
//   chat:session:{sessionId}              → Set of conversationIds
//   chat:directives:{userId}              → Sorted set of user instructions by recency
//
// Integration points:
//   - src/routes/api/sse/chat/+server.ts  → write-through on message save
//   - src/routes/api/chat/migrate/+server.ts → bulk cache on login migration
//   - src/lib/stores/chat-store.svelte.ts → client-side IndexedDB mirror (Loki.js)
// =============================================================================
