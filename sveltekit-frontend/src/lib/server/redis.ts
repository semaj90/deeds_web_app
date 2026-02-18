import Redis from 'ioredis';
import { ENV } from '$lib/server/env.server.js';

const REDIS_URL = ENV.REDIS_URL;

// Single shared client for SSR (auto-connects)
export const redis = new Redis(REDIS_URL, {
	maxRetriesPerRequest: 1,
	enableReadyCheck: false,
	connectTimeout: 3000,
	commandTimeout: 3000,
	retryStrategy: (times: number) => {
		if (times > 2) return null; // Stop retrying after 2 attempts
		return Math.min(times * 100, 500);
	}
});

/**
 * Factory for creating specialized Redis instances with custom config
 */
export default function createRedisInstance(options: Record<string, unknown>): Redis {
	return new Redis(options as any);
}

export function createRedisConnection() {
	return new Redis(REDIS_URL, {
		maxRetriesPerRequest: 1,
		enableReadyCheck: false,
		connectTimeout: 3000,
		commandTimeout: 3000
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

export async function ensureRedis() {
	if (redis.status === 'ready') return;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
		const onReady = () => { clearTimeout(timeout); redis.off('error', onError); resolve(); };
		const onError = (err: Error) => { clearTimeout(timeout); redis.off('ready', onReady); reject(err); };
		redis.on('ready', onReady);
		redis.on('error', onError);
	});
}