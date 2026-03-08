/**
 * VectorSearchService — Dual-provider search orchestration facade
 * Single entry point for vector search with auto-failover between Qdrant + pgvector.
 * Provides hybrid search (vector + keyword), batch search, continuous health monitoring.
 */

import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { pgVectorService } from '$lib/server/vector/PgVectorService.js';
import { getRedis } from '$lib/server/redis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
	id: string;
	content: string;
	similarity: number;
	metadata: Record<string, unknown>;
	source: 'qdrant' | 'pgvector';
}

export interface VectorSearchRequest {
	embedding: number[];
	limit?: number;
	threshold?: number;
	filters?: Record<string, string>;
	collection?: string;
}

export interface HybridSearchOptions {
	vectorWeight?: number;
	keywordWeight?: number;
	limit?: number;
	collection?: string;
}

export interface BatchSearchRequest {
	queries: Array<{ id: string; embedding: number[]; limit?: number }>;
	parallelism?: number;
	collection?: string;
}

export interface BatchSearchResponse {
	results: Array<{ queryId: string; results: VectorSearchResult[] }>;
	timing: { totalMs: number; perQueryAvgMs: number };
}

export interface VectorStoreStatus {
	qdrant: ProviderStatus;
	pgvector: ProviderStatus;
	mode: 'healthy' | 'degraded' | 'down';
}

interface ProviderStatus {
	available: boolean;
	lastChecked: Date;
	latencyMs: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VectorSearchService {
	private qdrantStatus: ProviderStatus = {
		available: true,
		lastChecked: new Date(),
		latencyMs: 0
	};
	private pgvectorStatus: ProviderStatus = {
		available: true,
		lastChecked: new Date(),
		latencyMs: 0
	};
	private healthInterval: ReturnType<typeof setInterval> | null = null;
	private cacheTtlSeconds = 300; // 5 min default

	// -----------------------------------------------------------------------
	// Search — primary with auto-failover
	// -----------------------------------------------------------------------

	async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
		const limit = request.limit ?? 10;
		const collection = request.collection ?? qdrant.collections.evidence;

		// Try cache first
		const cacheKey = this.buildCacheKey('search', request);
		const cached = await this.getFromCache(cacheKey);
		if (cached) return cached;

		// Try primary (Qdrant), failover to secondary (pgvector)
		let results: VectorSearchResult[];
		try {
			results = await this.searchQdrant(request.embedding, limit, collection);
			this.updateStatus('qdrant', true, 0);
		} catch (qdrantError) {
			this.updateStatus('qdrant', false, 0, (qdrantError as Error).message);
			try {
				results = await this.searchPgvector(request.embedding, limit, request.filters);
				this.updateStatus('pgvector', true, 0);
			} catch (pgError) {
				this.updateStatus('pgvector', false, 0, (pgError as Error).message);
				return [];
			}
		}

		// Apply threshold filter
		if (request.threshold) {
			results = results.filter((r) => r.similarity >= request.threshold!);
		}

		// Cache results (fire-and-forget)
		this.setCache(cacheKey, results).catch(() => {});

		return results;
	}

	// -----------------------------------------------------------------------
	// Hybrid Search — blend vector + keyword results
	// -----------------------------------------------------------------------

	async hybridSearch(
		embedding: number[],
		keyword: string,
		options: HybridSearchOptions = {}
	): Promise<VectorSearchResult[]> {
		const vectorWeight = options.vectorWeight ?? 0.7;
		const keywordWeight = options.keywordWeight ?? 0.3;
		const limit = options.limit ?? 10;
		const collection = options.collection ?? qdrant.collections.evidence;

		// Parallel: vector search + keyword search
		const [vectorResults, keywordResults] = await Promise.allSettled([
			this.searchQdrant(embedding, limit * 2, collection),
			this.keywordSearch(keyword, limit * 2)
		]);

		const vectorHits =
			vectorResults.status === 'fulfilled' ? vectorResults.value : [];
		const keywordHits =
			keywordResults.status === 'fulfilled' ? keywordResults.value : [];

		// Merge and reweight
		const scoreMap = new Map<string, { result: VectorSearchResult; score: number }>();

		for (const r of vectorHits) {
			const existing = scoreMap.get(r.id);
			const vectorScore = r.similarity * vectorWeight;
			if (existing) {
				existing.score += vectorScore;
			} else {
				scoreMap.set(r.id, { result: r, score: vectorScore });
			}
		}

		for (const r of keywordHits) {
			const existing = scoreMap.get(r.id);
			const kwScore = r.similarity * keywordWeight;
			if (existing) {
				existing.score += kwScore;
			} else {
				scoreMap.set(r.id, { result: r, score: kwScore });
			}
		}

		return Array.from(scoreMap.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((entry) => ({
				...entry.result,
				similarity: entry.score
			}));
	}

	// -----------------------------------------------------------------------
	// Batch Search — parallel multi-query
	// -----------------------------------------------------------------------

	async batchSearch(request: BatchSearchRequest): Promise<BatchSearchResponse> {
		const parallelism = request.parallelism ?? 3;
		const collection = request.collection ?? qdrant.collections.evidence;
		const start = Date.now();
		const allResults: Array<{ queryId: string; results: VectorSearchResult[] }> = [];

		for (let i = 0; i < request.queries.length; i += parallelism) {
			const batch = request.queries.slice(i, i + parallelism);
			const results = await Promise.allSettled(
				batch.map(async (q) => ({
					queryId: q.id,
					results: await this.search({
						embedding: q.embedding,
						limit: q.limit ?? 10,
						collection
					})
				}))
			);

			for (const r of results) {
				if (r.status === 'fulfilled') {
					allResults.push(r.value);
				} else {
					allResults.push({ queryId: 'unknown', results: [] });
				}
			}
		}

		const totalMs = Date.now() - start;
		return {
			results: allResults,
			timing: {
				totalMs,
				perQueryAvgMs: request.queries.length > 0 ? totalMs / request.queries.length : 0
			}
		};
	}

	// -----------------------------------------------------------------------
	// Indexing — write path
	// -----------------------------------------------------------------------

	async indexDocument(doc: {
		id: string;
		content: string;
		embedding: number[];
		metadata?: Record<string, unknown>;
		collection?: string;
	}): Promise<{ ok: boolean; error?: string }> {
		try {
			const collection = doc.collection ?? qdrant.collections.evidence;
			const { deterministicPointId } = await import('$lib/server/vector/qdrant-manager.js');
			const pointId = deterministicPointId(doc.id);

			await qdrant.client.upsert(collection, {
				wait: true,
				points: [
					{
						id: pointId,
						vector: { content: doc.embedding },
						payload: {
							document_id: doc.id,
							content: doc.content,
							...(doc.metadata ?? {})
						}
					}
				]
			});
			return { ok: true };
		} catch (error) {
			return { ok: false, error: (error as Error).message };
		}
	}

	async batchIndex(
		docs: Array<{
			id: string;
			content: string;
			embedding: number[];
			metadata?: Record<string, unknown>;
		}>,
		collection?: string
	): Promise<{ ok: boolean; succeeded: number; failed: number }> {
		let succeeded = 0;
		let failed = 0;

		for (const doc of docs) {
			const result = await this.indexDocument({ ...doc, collection });
			if (result.ok) succeeded++;
			else failed++;
		}

		return { ok: failed === 0, succeeded, failed };
	}

	// -----------------------------------------------------------------------
	// Health Monitoring — continuous polling
	// -----------------------------------------------------------------------

	startHealthChecks(intervalMs = 30000): void {
		if (this.healthInterval) return;
		this.healthInterval = setInterval(() => this.runHealthChecks(), intervalMs);
		this.runHealthChecks(); // immediate first check
	}

	stopHealthChecks(): void {
		if (this.healthInterval) {
			clearInterval(this.healthInterval);
			this.healthInterval = null;
		}
	}

	getStatus(): VectorStoreStatus {
		const qdrantOk = this.qdrantStatus.available;
		const pgOk = this.pgvectorStatus.available;
		const mode = qdrantOk && pgOk ? 'healthy' : qdrantOk || pgOk ? 'degraded' : 'down';

		return {
			qdrant: { ...this.qdrantStatus },
			pgvector: { ...this.pgvectorStatus },
			mode
		};
	}

	// -----------------------------------------------------------------------
	// Private
	// -----------------------------------------------------------------------

	private async searchQdrant(
		embedding: number[],
		limit: number,
		collection: string
	): Promise<VectorSearchResult[]> {
		const start = Date.now();
		const results = await qdrant.client.search(collection, {
			vector: { name: 'content', vector: embedding },
			limit,
			with_payload: true
		});
		this.updateStatus('qdrant', true, Date.now() - start);

		return results.map((r) => ({
			id: (r.payload?.document_id as string) ?? String(r.id),
			content: (r.payload?.content as string) ?? '',
			similarity: r.score,
			metadata: (r.payload ?? {}) as Record<string, unknown>,
			source: 'qdrant' as const
		}));
	}

	private async searchPgvector(
		embedding: number[],
		limit: number,
		filters?: Record<string, string>
	): Promise<VectorSearchResult[]> {
		const start = Date.now();
		const results = await pgVectorService.search(embedding, limit, filters);
		this.updateStatus('pgvector', true, Date.now() - start);

		return results.map((r) => ({
			id: r.id,
			content: r.content,
			similarity: r.score,
			metadata: r.metadata,
			source: 'pgvector' as const
		}));
	}

	private async keywordSearch(
		keyword: string,
		limit: number
	): Promise<VectorSearchResult[]> {
		try {
			const { pool } = await import('$lib/server/db/client');
			const result = await pool.query(
				`SELECT id, doc, 0.5 as score
				 FROM embeddings
				 WHERE doc::text ILIKE $1
				 LIMIT $2`,
				[`%${keyword}%`, limit]
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

	private async runHealthChecks(): Promise<void> {
		// Qdrant
		try {
			const start = Date.now();
			await qdrant.healthCheck();
			this.updateStatus('qdrant', true, Date.now() - start);
		} catch (error) {
			this.updateStatus('qdrant', false, 0, (error as Error).message);
		}

		// pgvector
		try {
			const start = Date.now();
			const health = await pgVectorService.healthCheck();
			this.updateStatus('pgvector', health.healthy, Date.now() - start, health.error);
		} catch (error) {
			this.updateStatus('pgvector', false, 0, (error as Error).message);
		}
	}

	private updateStatus(
		provider: 'qdrant' | 'pgvector',
		available: boolean,
		latencyMs: number,
		error?: string
	): void {
		const status: ProviderStatus = {
			available,
			lastChecked: new Date(),
			latencyMs,
			...(error ? { error } : {})
		};

		if (provider === 'qdrant') this.qdrantStatus = status;
		else this.pgvectorStatus = status;
	}

	private buildCacheKey(prefix: string, request: VectorSearchRequest): string {
		const embeddingHash = request.embedding.slice(0, 8).map((v) => v.toFixed(4)).join(',');
		return `vss:${prefix}:${embeddingHash}:${request.limit ?? 10}:${request.collection ?? 'default'}`;
	}

	private async getFromCache(key: string): Promise<VectorSearchResult[] | null> {
		try {
			const redis = getRedis();
			const cached = await redis.get(key);
			return cached ? JSON.parse(cached) : null;
		} catch {
			return null;
		}
	}

	private async setCache(key: string, results: VectorSearchResult[]): Promise<void> {
		try {
			const redis = getRedis();
			await redis.set(key, JSON.stringify(results), 'EX', this.cacheTtlSeconds);
		} catch {
			// Cache write failure is non-fatal
		}
	}
}

// Singleton
export const vectorSearchService = new VectorSearchService();
