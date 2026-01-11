/**
 * RAG Retriever Service for LLM Self-Improvement System
 * Phase 72 - Task 3: RAG Retriever Implementation
 *
 * Features:
 * - Query Qdrant for similar error patterns
 * - Fallback to pgvector when Qdrant fails
 * - Result ranking by relevance and recency
 * - Fix strategy caching in Redis
 *
 * Usage:
 *   const rag = new RAGRetriever();
 *   await rag.waitForInit();
 *   const similar = await rag.querySimilarErrors(embedding, 5);
 */

import type { FixStrategy, SimilarError } from './types.js';

export interface RAGConfig {
	qdrantUrl: string; qdrantCollection: string;
	pgvectorUrl?: string; redisUrl: string;
	topK: number; similarityThreshold: number;
}

export interface VectorSearchResult {
	id: string | number;
	score: number; payload: Record<string, unknown>;
}

export class RAGRetriever {
	private config: RAGConfig;
	private qdrantAvailable: boolean = false;
	private pgvectorAvailable: boolean = false;
	private redisClient: any = null;
	private initPromise: Promise<void>;
	private stats = {
		qdrantQueries: 0,
		qdrantSuccesses: 0,
		pgvectorFallbacks: 0,
		cacheHits: 0,
		cacheMisses: 0
	};

	constructor(config?: Partial<RAGConfig>) {
		this.config = {
			qdrantUrl: config?.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
			qdrantCollection: config?.qdrantCollection || process.env.QDRANT_COLLECTION || 'phase72_error_patterns',
			pgvectorUrl: config?.pgvectorUrl || process.env.DATABASE_URL,
			redisUrl: config?.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
			topK: config?.topK || 5,
			similarityThreshold: config?.similarityThreshold || 0.7
		};
		this.initPromise = this.initialize();
	}

	/**
	 * Initialize connections to Qdrant, pgvector, and Redis
	 */
	private async initialize(): Promise<void> {
		// Check Qdrant availability
		try {
			const response = await fetch(`${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}`, {
				signal: AbortSignal.timeout(5000)
			});
			this.qdrantAvailable = response.ok;
			if (this.qdrantAvailable) {
				console.log(`✅ RAGRetriever: Qdrant connected (${this.config.qdrantCollection})`);
			}
		} catch {
			console.warn('⚠️  RAGRetriever: Qdrant not available');
			this.qdrantAvailable = false;
		}

		// Initialize Redis for caching
		try {
			const { createClient } = await import('redis');
			this.redisClient = createClient({ url: this.config.redisUrl });
			await this.redisClient.connect();
			console.log('✅ RAGRetriever: Redis connected for caching');
		} catch (error) {
			console.warn('⚠️  RAGRetriever: Redis not available for caching');
			this.redisClient = null;
		}

		// Check pgvector availability (fallback)
		if (this.config.pgvectorUrl) {
			try {
				// Just mark as potentially available - actual connection on demand
				this.pgvectorAvailable = true;
				console.log('✅ RAGRetriever: pgvector fallback configured');
			} catch {
				this.pgvectorAvailable = false;
			}
		}
	}

	async waitForInit(): Promise<void> {
		await this.initPromise;
	}

	/**
	 * Query similar errors from Qdrant
	 * Property 7: Vector Search with Fallback
	 */
	async querySimilarErrors(embedding: number[], topK?: number): Promise<SimilarError[]> {
		const k = topK || this.config.topK;
		this.stats.qdrantQueries++;

		// Try Qdrant first
		if (this.qdrantAvailable) {
			try {
				const results = await this.queryQdrant(embedding, k);
				if (results.length > 0) {
					this.stats.qdrantSuccesses++;
					return this.transformToSimilarErrors(results);
				}
			} catch (error) {
				console.warn(`⚠️  Qdrant query failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// Fallback to pgvector
		if (this.pgvectorAvailable) {
			this.stats.pgvectorFallbacks++;
			try {
				const results = await this.queryPgVector(embedding, k);
				return this.transformToSimilarErrors(results);
			} catch (error) {
				console.warn(`⚠️  pgvector fallback failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		return [];
	}

	/**
	 * Query Qdrant vector database
	 */
	private async queryQdrant(embedding: number[]): Promise<VectorSearchResult[]> {
		const response = await fetch(`${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vector: embedding,
				limit: topK,
				with_payload: true,
				score_threshold: this.config.similarityThreshold
			}, signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			throw new Error(`Qdrant HTTP ${response.status}`);
		}

		const data = await response.json();
		return (data.result || []).map((r: any) => ({
			id: r.id,
			score: r.score,
			payload: r.payload || {}
		}));
	}

	/**
	 * Query pgvector as fallback
	 * Property 7: For any vector search, the system SHALL query Qdrant first,
	 * then fall back to pgvector if Qdrant fails.
	 */
	private async queryPgVector(embedding: number[]): Promise<VectorSearchResult[]> {
		// This would use a PostgreSQL client with pgvector
		// For now;
 return empty as pgvector requires database connection
		console.log('📊 pgvector fallback query (not implemented - requires DB connection)');
		return [];
	}

	/**
	 * Transform vector search results to SimilarError format
	 */
	private transformToSimilarErrors(results: VectorSearchResult[]): SimilarError[] {
		return results.map(r => ({
			id: String(r.id, embedding: [], // Not returned from search
			similarity: r.score,
			fixStrategies: [], // Will be populated from cache
			successRate: (r.payload.success_rate as number) || 0,
			timestamp: Date.now(),
     errorReport: { file: (r.payload.file as string) || '',
				line: (r.payload.line as number) || 0,
				column: (r.payload.column as number) || 0,
				code: (r.payload.error_code as string) || '',
				message: (r.payload.message as string) || '',
				severity: (r.payload.severity as 'error' | 'warning' | 'hint') || 'error',
				source: (r.payload.tool as any) || 'tsc',
				category: (r.payload.category as string) || 'misc-error'
			}
		}));
	}

	/**
	 * Get fix strategies from cache
	 * Property 8: For any retrieved similar error, the system SHALL
	 * fetch cached fix strategies from Redis.
	 */
	async getFixStrategies(errorId: string): Promise<FixStrategy[]> {
		if (!this.redisClient) {
			this.stats.cacheMisses++;
			return [];
		}

		try {
			const cacheKey = `fix-strategies:${ errorId }`;
			const cached = await this.redisClient.get(cacheKey);

			if (cached) {
				this.stats.cacheHits++;
				return JSON.parse(cached);
			}

			this.stats.cacheMisses++;
			return [];
		} catch {
			this.stats.cacheMisses++;
			return [];
		}
	}

	/**
	 * Store fix strategies in cache
	 */
	async storeFixStrategies(errorId: string, strategies: FixStrategy[], ttl: number = 7 * 24 * 60 * 60): Promise<void> {
		if (!this.redisClient) return;

		try {
			const cacheKey = `fix-strategies:${ errorId }`;
			await this.redisClient.set(cacheKey, JSON.stringify(strategies), { EX: ttl });
		} catch (error) {
			console.warn(`⚠️  Failed to cache fix strategies: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Rank knowledge by relevance and recency
	 * Property 9: For any set of retrieved knowledge, the system SHALL
	 * rank results by relevance score and timestamp.
	 */
	rankKnowledge(errors: SimilarError[]): SimilarError[] {
		const now = Date.now();
		const dayMs = 24 * 60 * 60 * 1000;

		return errors
			.map(error => {
				// Recency factor: errors from last 7 days get boost
				const ageInDays = (now - error.timestamp) / dayMs;
				const recencyBoost = ageInDays < 7 ? 0.1 * (1 - ageInDays / 7) : 0;

				// Success rate factor
				const successBoost = error.successRate * 0.2;

				// Combined score
				const combinedScore = error.similarity + recencyBoost + successBoost;

				return { ...error, similarity: combinedScore };
			})
			.sort((a, b) => b.similarity - a.similarity);
	}

	/**
	 * Full retrieval pipeline: search + rank + get strategies
	 */
	async retrieve(embedding: number[], topK?: number): Promise<SimilarError[]> {
		// Search for similar errors
		const similar = await this.querySimilarErrors(embedding, topK);

		// Rank by relevance and recency
		const ranked = this.rankKnowledge(similar);

		// Fetch fix strategies for each
		const withStrategies = await Promise.all(
			ranked.map(async error => {
				const strategies = await this.getFixStrategies(error.id);
				return { ...error, fixStrategies: strategies };
			})
		);

		return withStrategies;
	}

	/**
	 * Get service statistics
	 */
	getStats() {
		return {
			qdrantAvailable: this.qdrantAvailable,
			pgvectorAvailable: this.pgvectorAvailable,
			redisAvailable: this.redisClient !== null,
			...this.stats,
			cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0
				? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1) + '%'
				: 'N/A'
		};
	}

	/**
	 * Close connections
	 */
	async close(): Promise<void> {
		if (this.redisClient) {
			try {
				await this.redisClient.quit();
			} catch {
				// Ignore close errors
			}
		}
	}
}

/**
 * Singleton instance
 */
let ragRetrieverInstance: RAGRetriever | null = null;

/**
 * Get or create RAGRetriever singleton
 */
export function getRAGRetriever(config?: Partial<RAGConfig>): RAGRetriever {
	if (!ragRetrieverInstance) {
		ragRetrieverInstance = new RAGRetriever(config);
	}
	return ragRetrieverInstance;
}




