/**
 * EnhancedVectorService — Thin convenience facade over VectorSearchService
 * Adds: keyword search via ILIKE, health aggregation across all providers.
 * NOT a second search implementation — delegates all vector ops to vectorSearchService.
 */

import {
	vectorSearchService,
	type VectorSearchResult,
	type VectorStoreStatus
} from '$lib/server/ai/vector-search-service.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getRedis } from '$lib/server/redis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnhancedSearchOptions {
	query: string;
	limit?: number;
	mode?: 'vector' | 'keyword' | 'hybrid';
	vectorWeight?: number;
	keywordWeight?: number;
	collection?: string;
}

export interface HealthAggregation {
	vector: VectorStoreStatus;
	redis: { available: boolean; latencyMs: number; error?: string };
	ollama: { available: boolean; latencyMs: number; error?: string };
	overallHealth: 'healthy' | 'degraded' | 'down';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EnhancedVectorService {
	/**
	 * Search with automatic embedding generation.
	 * Accepts raw text query — generates embedding, then delegates to VectorSearchService.
	 */
	async search(options: EnhancedSearchOptions): Promise<VectorSearchResult[]> {
		const limit = options.limit ?? 10;
		const mode = options.mode ?? 'hybrid';

		if (mode === 'keyword') {
			return this.keywordSearch(options.query, limit);
		}

		// Generate embedding from query text
		const embedding = await generateSingleEmbedding(options.query);
		if (!embedding || embedding.length === 0) {
			// Fallback to keyword-only if embedding fails
			return this.keywordSearch(options.query, limit);
		}

		if (mode === 'vector') {
			return vectorSearchService.search({ embedding, limit, collection: options.collection });
		}

		// Hybrid: vector + keyword blend
		return vectorSearchService.hybridSearch(embedding, options.query, {
			vectorWeight: options.vectorWeight ?? 0.7,
			keywordWeight: options.keywordWeight ?? 0.3,
			limit,
			collection: options.collection
		});
	}

	/**
	 * Keyword search via PostgreSQL ILIKE
	 * Unique feature not available in qdrant-manager directly
	 */
	async keywordSearch(query: string, limit = 10): Promise<VectorSearchResult[]> {
		try {
			const { pool } = await import('$lib/server/db/client');

			const result = await pool.query(
				`SELECT id, doc, 0.5 as score
				 FROM embeddings
				 WHERE doc::text ILIKE $1
				 ORDER BY length(doc::text) ASC
				 LIMIT $2`,
				[`%${query}%`, limit]
			);

			return (result.rows as Array<{ id: string; doc: Record<string, unknown> | null; score: number }>).map(
				(r) => ({
					id: r.id,
					content: (r.doc?.content as string) ?? '',
					similarity: r.score,
					metadata: (r.doc?.meta as Record<string, unknown>) ?? {},
					source: 'pgvector' as const
				})
			);
		} catch {
			return [];
		}
	}

	/**
	 * Aggregate health check across all providers: Qdrant, pgvector, Redis, Ollama
	 */
	async healthAggregation(): Promise<HealthAggregation> {
		const vectorStatus = vectorSearchService.getStatus();

		// Redis health
		let redisHealth: HealthAggregation['redis'];
		try {
			const start = Date.now();
			const redis = getRedis();
			await redis.ping();
			redisHealth = { available: true, latencyMs: Date.now() - start };
		} catch (error) {
			redisHealth = { available: false, latencyMs: 0, error: (error as Error).message };
		}

		// Ollama health
		let ollamaHealth: HealthAggregation['ollama'];
		try {
			const start = Date.now();
			const { ENV } = await import('$lib/server/env.server.js');
			const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`);
			ollamaHealth = { available: res.ok, latencyMs: Date.now() - start };
		} catch (error) {
			ollamaHealth = { available: false, latencyMs: 0, error: (error as Error).message };
		}

		// Overall
		const allAvailable =
			vectorStatus.mode === 'healthy' && redisHealth.available && ollamaHealth.available;
		const anyAvailable =
			vectorStatus.mode !== 'down' || redisHealth.available || ollamaHealth.available;

		return {
			vector: vectorStatus,
			redis: redisHealth,
			ollama: ollamaHealth,
			overallHealth: allAvailable ? 'healthy' : anyAvailable ? 'degraded' : 'down'
		};
	}
}

// Singleton
export const enhancedVectorService = new EnhancedVectorService();
