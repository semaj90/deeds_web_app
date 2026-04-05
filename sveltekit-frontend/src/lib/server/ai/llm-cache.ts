/**
 * LLM Response Semantic Cache
 * Caches Ollama responses using vector similarity to reduce redundant API calls.
 *
 * Architecture:
 * - Query embedding (768-dim) stored in Qdrant llm_response_cache collection
 * - Context hash (MD5) ensures cache hits only for semantically similar queries with identical context
 * - TTL metadata for cache expiration (default 24 hours)
 * - Similarity threshold 0.88 for cache hits (high precision for legal domain safety)
 */

import { createHash } from 'crypto';
import { QdrantManager, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Cache hit threshold — only return cached response if similarity >= 0.88
// Bumped from 0.85 to 0.88 for legal domain safety (incorrect cached answers are worse than cache misses)
const CACHE_HIT_THRESHOLD = 0.88;

// Model version — included in cache key so cache auto-invalidates when model changes
// Bump this when deploying a new fine-tuned model (e.g. gemma4-legal → gemma4-legal)
const CACHE_MODEL_VERSION = 'v2';

// Tiered TTL by query type (seconds)
const CACHE_TTL = {
	precedent: 48 * 60 * 60,   // 48h — statutes/case law rarely change
	analysis:   4 * 60 * 60,   // 4h  — case analysis evolves during investigation
	evidence:  30 * 60,         // 30m — active evidence, data changes frequently
	chat:       5 * 60,         // 5m  — conversational, ephemeral
	default:   24 * 60 * 60,   // 24h — fallback
} as const;

type CacheTier = keyof typeof CACHE_TTL;

/** Classify a query into a cache tier based on content keywords */
function classifyQueryTier(query: string): CacheTier {
	const q = query.toLowerCase();
	if (/\b(statute|u\.?s\.?c|cfr|code|section|§|precedent|case law|ruling)\b/.test(q)) return 'precedent';
	if (/\b(evidence|exhibit|chain of custody|forensic|upload)\b/.test(q)) return 'evidence';
	if (/\b(analyz|review|assess|evaluat|summariz|interpret)\b/.test(q)) return 'analysis';
	if (q.length < 80) return 'chat'; // Short messages are likely conversational
	return 'default';
}

interface CacheEntry {
	query: string;
	queryEmbedding: number[];
	contextHash: string;
	response: string;
	model: string;
	confidence?: number;
	cachedAt: string;
	expiresAt: string;
}

interface CacheLookupResult {
	hit: boolean;
	response?: string;
	confidence?: number;
	similarity?: number;
	cachedAt?: string;
	model?: string;
}

/**
 * Generate a deterministic hash of the context to ensure cache hits only for identical context
 */
function hashContext(context: string): string {
	return createHash('md5').update(context).digest('hex');
}

/**
 * Generate query embedding via Ollama
 */
async function embedQuery(query: string): Promise<number[] | null> {
	try {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query }),
			signal: AbortSignal.timeout(8000)
		});

		if (!res.ok) return null;
		const data = await res.json();
		return Array.isArray(data.embedding) ? data.embedding : null;
	} catch (error) {
		console.warn('[LLM Cache] Embedding generation failed:', error);
		return null;
	}
}

/**
 * Search for cached LLM response
 * Returns cached response if similarity >= threshold AND context matches
 */
export async function lookupCachedResponse(params: {
	query: string;
	queryEmbedding?: number[];
	context: string;
	model?: string;
}): Promise<CacheLookupResult> {
	const { query, queryEmbedding: providedEmbedding, context, model = 'gemma4-legal:latest' } = params;

	try {
		// Generate query embedding if not provided
		const queryEmbedding = providedEmbedding ?? await embedQuery(query);
		if (!queryEmbedding) {
			return { hit: false };
		}

		const contextHash = hashContext(context);
		const qdrant = new QdrantManager();

		// Search for semantically similar cached queries
		const searchRes = await qdrant.client.search(qdrant.collections.llm_cache, {
			vector: {
				name: 'query',
				vector: queryEmbedding
			},
			limit: 5,
			score_threshold: CACHE_HIT_THRESHOLD,
			with_payload: true,
			filter: {
				must: [
					{ key: 'contextHash', match: { value: contextHash } },
					{ key: 'model', match: { value: model } }
				]
			}
		});

		if (searchRes.length === 0) {
			return { hit: false };
		}

		// Check if top result is still valid (not expired)
		const topHit = searchRes[0];
		const payload = topHit.payload as any;
		const expiresAt = new Date(payload.expiresAt);

		if (expiresAt < new Date()) {
			// Cache entry expired — delete it asynchronously
			qdrant.client.delete(qdrant.collections.llm_cache, {
				points: [topHit.id as number]
			}).catch(err => console.warn('[LLM Cache] Failed to delete expired entry:', err));
			return { hit: false };
		}

		console.log(`[LLM Cache] ✅ HIT — similarity: ${topHit.score?.toFixed(3)}, cached: ${payload.cachedAt}`);

		return {
			hit: true,
			response: payload.response,
			confidence: payload.confidence,
			similarity: topHit.score,
			cachedAt: payload.cachedAt,
			model: payload.model
		};
	} catch (error) {
		console.warn('[LLM Cache] Lookup failed:', error);
		return { hit: false };
	}
}

/**
 * Store LLM response in cache
 */
export async function storeCachedResponse(params: {
	query: string;
	queryEmbedding: number[];
	context: string;
	response: string;
	model: string;
	confidence?: number;
}): Promise<void> {
	const { query, queryEmbedding, context, response, model, confidence } = params;

	try {
		const contextHash = hashContext(context);
		const tier = classifyQueryTier(query);
		const ttlSeconds = CACHE_TTL[tier];
		const now = new Date();
		const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

		// Generate deterministic point ID from query + context hash + model version
		// Model version ensures cache auto-invalidates when deploying a new fine-tuned model
		const pointId = deterministicPointId(`${query}:${contextHash}:${model}:${CACHE_MODEL_VERSION}`);

		const qdrant = new QdrantManager();

		await qdrant.client.upsert(qdrant.collections.llm_cache, {
			points: [
				{
					id: pointId,
					vector: {
						query: queryEmbedding
					},
					payload: {
						query,
						contextHash,
						response,
						model,
						confidence,
						cachedAt: now.toISOString(),
						expiresAt: expiresAt.toISOString()
					}
				}
			]
		});

		console.log(`[LLM Cache] STORED — tier: ${tier}, ttl: ${ttlSeconds}s, query: "${query.slice(0, 50)}...", expires: ${expiresAt.toISOString()}`);
	} catch (error) {
		// Cache storage failures should not block the response
		console.warn('[LLM Cache] Storage failed:', error);
	}
}

/**
 * Clear expired cache entries (call periodically via cron/scheduler)
 */
export async function cleanExpiredCache(): Promise<{ deleted: number }> {
	try {
		const qdrant = new QdrantManager();
		const now = new Date().toISOString();

		// Scroll through all points and delete expired ones
		const scrollRes = await qdrant.client.scroll(qdrant.collections.llm_cache, {
			limit: 1000,
			with_payload: true,
			filter: {
				must: [
					{
						key: 'expiresAt',
						range: {
							lt: now
						}
					}
				]
			}
		});

		const expiredIds = scrollRes.points.map(p => p.id);

		if (expiredIds.length > 0) {
			await qdrant.client.delete(qdrant.collections.llm_cache, {
				points: expiredIds as number[]
			});
			console.log(`[LLM Cache] 🧹 Cleaned ${expiredIds.length} expired entries`);
		}

		return { deleted: expiredIds.length };
	} catch (error) {
		console.warn('[LLM Cache] Cleanup failed:', error);
		return { deleted: 0 };
	}
}
