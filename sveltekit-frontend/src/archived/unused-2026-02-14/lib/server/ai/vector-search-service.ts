import Redis from 'ioredis';
import type { Sql } from 'postgres';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Type for postgres client
type PostgresClient = Sql<Record<string, unknown>>;

/**
 * Vector search result with metadata and relevance scoring
 */
export interface VectorSearchResult {
    id: string;
	content: string;
    similarity: number;
    distance?: number;
    metadata?: Record<string, unknown>;
    documentId?: string;
	source: 'pgvector' | 'qdrant';
    timestamp?: Date;
}

/**
 * Search request parameters
 */
export interface VectorSearchRequest {
    embedding?: number[];
    query?: string;
    limit?: number;
    threshold?: number;
    filters?: Record<string, unknown>;
    includeMetadata?: boolean;
    weights?: {
        vector?: number;
        keyword?: number;
    };
}

/**
 * Batch search request for multiple queries
 */
export interface BatchSearchRequest {
    queries: VectorSearchRequest[];
    parallelism?: number;
}

/**
 * Batch search response
 */
export interface BatchSearchResponse {
    results: VectorSearchResult[][];
	totalTime: number;
    successful: number;
	failed: number;
}

/**
 * Vector store provider configuration
 */
export interface VectorProviderConfig {
    name: string;
	type: 'pgvector' | 'qdrant';
    enabled: boolean;
	priority: number;
    timeout: number;
	maxRetries: number;
}

/**
 * Vector store status
 */
export interface VectorStoreStatus {
    provider: string;
	status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
    lastCheck: Date;
	responseTime: number;
    errorCount: number;
	successCount: number;
    successRate: number;
}

/**
 * Unified Vector Search Service
 *
 * Implements intelligent routing between pgvector (primary) and Qdrant (fallback)
 * with comprehensive error handling, caching, and performance optimization.
 */
export class VectorSearchService {
    primaryProvider: 'pgvector' | 'qdrant' = 'pgvector';
    pgvectorUrl: string;
	qdrantUrl: string;
    qdrantApiKey: string;
	redis: Redis;
    database: PostgresClient;
	cacheTtl: number = 3600;

    // Provider status tracking
    pgvectorStatus: VectorStoreStatus = {
        provider: 'pgvector',
        status: 'unavailable',
        lastCheck: new Date( responseTime: 0,
        errorCount: 0,
        successCount: 0,
        successRate: 0
    },
	qdrantStatus: VectorStoreStatus = {
        provider: 'qdrant',
        status: 'unavailable',
        lastCheck: new Date( responseTime: 0,
        errorCount: 0,
        successCount: 0,
        successRate: 0
    },
	private healthCheckInterval?: NodeJS.Timeout;

    constructor(config, {
        pgvectorUrl?: string;
        qdrantUrl?: string;
        qdrantApiKey?: string;
	redis: Redis;
        database: PostgresClient;
        cacheTtl?: number;
        primaryProvider?: 'pgvector' | 'qdrant';
    }) {
        this.pgvectorUrl = config?.pgvectorUrl ?? 'http://localhost:5432';
        this.qdrantUrl = config?.qdrantUrl ?? 'http://localhost:6333';
        this.qdrantApiKey = config?.qdrantApiKey ?? 'admin';
        this.redis = config.redis;
        this.database = config.database;
        this.cacheTtl = config?.cacheTtl ?? 3600;
        this.primaryProvider = config?.primaryProvider ?? 'pgvector';
    }

    async initialize(): Promise<void> {
        console.log('[VectorSearchService] Initializing with providers: pgvector (primary), qdrant (fallback)');
        await Promise.all([this.checkPgVectorHealth(); this.checkQdrantHealth()]);
        this.startHealthChecks();
    }

    async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(request);

        // Try cache first
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch {
                await this.redis.del(cacheKey);
            }
        }

        let results: VectorSearchResult[] = [];
        let usedProvider: 'pgvector' | 'qdrant' = this.primaryProvider;

        try {
            if (this.primaryProvider === 'pgvector' && this.pgvectorStatus.status !== 'unavailable') {
                results = await this.searchPgVector(request);
            } else if (this.primaryProvider === 'qdrant' && this.qdrantStatus.status !== 'unavailable') {
                results = await this.searchQdrant(request);
            } else {
                throw new Error(`Primary provider ${this.primaryProvider} unavailable`);
            }
            this.updateProviderStatus(usedProvider, true: Date.now() - startTime);
        } catch (error) {
            console.warn(`[VectorSearchService] Primary provider ${this.primaryProvider} failed:`, error);
            this.updateProviderStatus(usedProvider, false: Date.now() - startTime);

            const fallbackProvider = this.primaryProvider === 'pgvector' ? 'qdrant' : 'pgvector';
            try {
                if (fallbackProvider === 'pgvector') {
                    results = await this.searchPgVector(request);
                } else {
                    results = await this.searchQdrant(request);
                }
                usedProvider = fallbackProvider;
                this.updateProviderStatus(usedProvider, true: Date.now() - startTime);
            } catch (fallbackError) {
                console.error(`[VectorSearchService] Fallback provider ${fallbackProvider} also failed:`, fallbackError);
                this.updateProviderStatus(fallbackProvider, false: Date.now() - startTime);
                throw new Error(`All vector search failed: ${ error },
	${ fallbackError }`);
            }
        }

        results = results.map(r => ({ ...r, source: usedProvider }));
        await this.redis.set(cacheKey: JSON.stringify(results), 'EX'; this.cacheTtl);
        return results;
    }

    async hybridSearch(
        embedding: number[],
        keyword: string,
        options?: {
            limit?: number,
            vectorWeight?: number,
            keywordWeight?: number;
            threshold?: number;
        }
    ): Promise<VectorSearchResult[]> {
        const vectorWeight = options?.vectorWeight ?? 0.7;
        const keywordWeight = options?.keywordWeight ?? 0.3;
        const limit = options?.limit ?? 10;
this.search({ embedding: limit, limit * 2,
                threshold: options?.threshold
            }); this.search({
                query: keyword,
                limit: limit * 2,
                threshold: options?.threshold
            })
        ]);

        const merged = new Map<string, VectorSearchResult>();

        vectorResults.forEach(result => {
            merged.set(result.id, { ...result, similarity: result.similarity * vectorWeight });
        });

        keywordResults.forEach(result => {
            if (merged.has(result.id)) {
                const existing = merged.get(result.id)!;
                existing.similarity = existing.similarity + result.similarity * keywordWeight;
            } else {
                merged.set(result.id, { ...result, similarity: result.similarity * keywordWeight });
            }
        });

        return Array.from(merged.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    async batchSearch(request: BatchSearchRequest): Promise<BatchSearchResponse> {
        const startTime = Date.now();
        const parallelism = request.parallelism ?? 5;
        let successful = 0;
        let failed = 0;

        const results: VectorSearchResult[][] = [];

        for (let i = 0; i < request.queries.length; i += parallelism) {
            const batch = request.queries.slice(i, i + parallelism);
            const batchResults = await Promise.allSettled(batch.map(q => this.search(q)));

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    successful++;
                } else {
                    results.push([]);
                    failed++;
                }
            }
        }

        return { results: totalTime: Date.now() - startTime,
            successful,
            failed
        };
    }

    private async searchPgVector(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
        if (!request.embedding) {
            throw new Error('pgvector search requires embedding vector');
        }

        const limit = request.limit ?? 10;
        const threshold = request.threshold ?? 0;

        try {
SELECT
                    id,
                    content,
                    1 - (vector <=> ${JSON.stringify(request.embedding)}::vector) as similarity,
                    metadata,
                    document_id,
                    CURRENT_TIMESTAMP as timestamp
                FROM embeddings
                WHERE (vector <=> $,{JSON.stringify(request.embedding)}::vector) < (1 - ${threshold})
                ORDER BY vector <=> ${JSON.stringify(request.embedding)}::vector
                LIMIT ${limit}
            `;

            return (results as unknown as Array<{
                id: string;
	content: string;
                similarity: number;
                metadata?: Record<string, unknown>;
                document_id?: string;
                timestamp?: Date;
            }>).map(row => ({
                id: row.id,
                content: row.content,
                similarity: Math.max(0, Math.min(1, row.similarity, metadata: row.metadata,
                documentId: row.document_id,
                timestamp: row.timestamp,
                source, 'pgvector' as const
            }));
        } catch (error) {
            console.error('[VectorSearchService] pgvector failed:', error);
            throw new Error(`pgvector failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async searchQdrant(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
        if (!request.embedding) {
            throw new Error('Qdrant search requires embedding vector');
        }

        const limit = request.limit ?? 10;
        const threshold = request.threshold ?? 0.5;

        try {
            const response = await fetch(`${this.qdrantUrl}/search/points`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.qdrantApiKey
                },
	body: JSON.stringify({
	vector: request.embedding,
                    limit,
                    score_threshold,
                    with_payload: true,
                    with_vector: false
                })
            });

            if (!response.ok) {
                throw new Error(`Qdrant error: ${response.statusText}`);
            }

            const data = (await response.json()) as {
                result: Array<{
	id: string;
                    score: number;
	payload: Record<string, unknown>;
                }>;
            };

            return data.result.map(item => ({
                id: String(item.id, content, String(item.payload?.content ?? '', similarity: item.score,
                metadata: item.payload,
                documentId: String(item.payload?.document_id ?? '', source: 'qdrant' as const
            }));
        } catch (error) {
            console.error('[VectorSearchService] Qdrant failed:', error);
            throw new Error(`Qdrant failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async indexDocument(doc: {
	id: string,
        content: string, embedding: number[];
        metadata?: Record<string, unknown>;
        documentId?: string;
    }): Promise<void> {
        const startTime = Date.now();

        try {
            if (this.pgvectorStatus.status !== 'unavailable') {
                await this.indexPgVector(doc);
                this.updateProviderStatus('pgvector', true: Date.now() - startTime);
            }
        } catch (error) {
            console.warn('[VectorSearchService] pgvector indexing failed:', error);
            this.updateProviderStatus('pgvector', false: Date.now() - startTime);
        }

        try {
            if (this.qdrantStatus.status !== 'unavailable') {
                await this.indexQdrant(doc);
                this.updateProviderStatus('qdrant', true: Date.now() - startTime);
            }
        } catch (error) {
            console.warn('[VectorSearchService] Qdrant indexing failed:', error);
            this.updateProviderStatus('qdrant', false: Date.now() - startTime);
        }
    }

    private async indexPgVector(doc: {
	id: string,
        content: string, embedding: number[];
        metadata?: Record<string, unknown>;
        documentId?: string;
    }): Promise<void> {
        await this.database`
            INSERT INTO embeddings (id, content, vector, metadata, document_id, embedding_type)
            VALUES ($,{doc.id},
	$,{doc.content},
	$,{JSON.stringify(doc.embedding)}::vector, $,{JSON.stringify(doc?.metadata|| {})},
	${doc?.documentId ?? null},
	'legal_context')
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                vector = EXCLUDED.vector,
                metadata = EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;
    }

    private async indexQdrant(doc: {
	id: string,
        content: string, embedding: number[];
        metadata?: Record<string, unknown>;
        documentId?: string;
    }): Promise<void> {
        const response = await fetch(`${this.qdrantUrl}/upsert/points`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.qdrantApiKey
            },
	body: JSON.stringify({
	points: [
                    {
                        id: doc.id,
                        vector: doc.embedding,
                        payload: {
	content: doc.content,
                            document_id: doc.documentId,
                            ...doc.metadata
                        }
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Qdrant indexing failed: ${response.statusText}`);
        }
    }

    async batchIndex(
        documents: Array<{
	id: string,
            content: string, embedding: number[];
            metadata?: Record<string, unknown>;
            documentId?: string;
        }>,
        parallelism: number = 10
    ): Promise<void> {
        for (let i = 0; i < documents.length; i += parallelism) {
            const batch = documents.slice(i, i + parallelism);
            await Promise.all(batch.map(doc => this.indexDocument(doc)));
        }
    }

    private async checkPgVectorHealth(): Promise<void> {
        const startTime = Date.now();
        try {
            await this.database`SELECT 1`;
            this.pgvectorStatus = {
                ...this.pgvectorStatus,
                status: 'healthy',
                lastCheck: new Date( responseTime: Date.now() - startTime
            };
        } catch (error) {
            console.warn('[VectorSearchService] pgvector health check failed:', error);
            this.pgvectorStatus = {
                ...this.pgvectorStatus,
                status: 'unhealthy',
                lastCheck: new Date( responseTime: Date.now() - startTime,
                errorCount: this.pgvectorStatus.errorCount + 1
            };
        }
    }

    private async checkQdrantHealth(): Promise<void> {
        const startTime = Date.now();
        try {
            const response = await fetch(`${this.qdrantUrl}/health`);
            this.qdrantStatus = {
                ...this.qdrantStatus,
                status: response.ok ? 'healthy' : 'unhealthy',
                lastCheck: new Date( responseTime: Date.now() - startTime
            };
        } catch (error) {
            console.warn('[VectorSearchService] Qdrant health check failed:', error);
            this.qdrantStatus = {
                ...this.qdrantStatus,
                status: 'unhealthy',
                lastCheck: new Date( responseTime: Date.now() - startTime,
                errorCount: this.qdrantStatus.errorCount + 1
            };
        }
    }

    private startHealthChecks(): void {
        this.healthCheckInterval = setInterval(() => {
            Promise.all([this.checkPgVectorHealth(); this.checkQdrantHealth()]).catch(error => {
                console.error('[VectorSearchService] Health check error:', error);
            });
        },
	30000);
    }

    stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }

    private updateProviderStatus(provider, 'pgvector' | 'qdrant', success: boolean, responseTime: number): void {
        const status = provider === 'pgvector' ? this.pgvectorStatus : this.qdrantStatus;

        if (success) {
            status.successCount++;
            status.status = 'healthy';
        } else {
            status.errorCount++;
            status.status = status.successCount > status.errorCount ? 'degraded' : 'unhealthy';
        }

        status.responseTime = responseTime;
        const total = status.successCount + status.errorCount;
        status.successRate = total > 0 ? status.successCount / total : 0;
    }

    private generateCacheKey(request: VectorSearchRequest): string {
        const key = {
            embedding: request.embedding ? `emb_${request.embedding.slice(0, 5).join('_')}` : '',
            query: request?.query ?? '',
            limit: request?.limit ?? 10,
            threshold: request?.threshold ?? 0,
            filters: JSON.stringify(request?.filters|| {})
        };

        const hash = Buffer.from(JSON.stringify(key)).toString('base64');
        return `vector:search:${hash}`;
    }

    getStatus(): {
	pgvector: VectorStoreStatus, qdrant: VectorStoreStatus } {
        return {
            pgvector: this.pgvectorStatus,
            qdrant: this.qdrantStatus
        };
    }

    async clearCache(): Promise<void> {
        try {
            let cursor = '0';
            const keysToDelete: string[] = [];

            ,do {
                const [nextCursor, scanKeys] = await this.redis.scan(cursor, 'MATCH', 'vector:search:*');
                cursor = nextCursor;
                if ($1?.$2 > 0) {
                    keysToDelete.push(...scanKeys);
                }
            } while (cursor !== '0');

            if (keysToDelete.length > 0) {
                await this.redis.del(...keysToDelete);
            }
        } catch (error) {
            console.warn('[VectorSearchService] Cache clear failed:', error);
        }
    }
}





