import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';

/**
 * Generate a deterministic integer point ID from a string key.
 * Ported from Python qdrant_gpu_client.py — MD5 hash → first 4 bytes → int % 2^31.
 * Ensures idempotent upserts: same chunk_id always maps to the same Qdrant point ID.
 */
export function deterministicPointId(key: string): number {
    const hash = createHash('md5').update(key).digest();
    const raw = hash.readUInt32BE(0);
    return raw % 2147483648;
}

export class QdrantManager {
    public client: QdrantClient;
    /** Canonical collection names — sourced from VECTOR_CONFIG */
    public readonly collections = VECTOR_CONFIG.COLLECTIONS;

    constructor(url = ENV.QDRANT_URL) {
        this.client = new QdrantClient({ url });
    }

    async initializeCollections() {
        const dim = VECTOR_CONFIG.DIMENSIONS;
        const dist = VECTOR_CONFIG.DISTANCE_METRIC.QDRANT;
        const hnsw = VECTOR_CONFIG.QDRANT_HNSW;
        const quant = VECTOR_CONFIG.QDRANT_QUANTIZATION;

        const collectionConfigs = Object.entries(VECTOR_CONFIG.COLLECTION_VECTORS).map(
            ([name, schema]) => {
                const vectors: Record<string, { size: number; distance: string }> = {};
                for (const v of schema.vectors) {
                    if (v === 'default') continue;
                    vectors[v] = { size: dim, distance: dist };
                }
                const config: any = {
                    name,
                    quantization_config: quant,
                    hnsw_config: hnsw,
                };
                // Single unnamed vector vs named multi-vector
                if (schema.vectors.length === 1 && schema.vectors[0] === 'default') {
                    config.vectors = { size: dim, distance: dist };
                } else {
                    config.vectors = vectors;
                }
                if ('on_disk_payload' in schema) {
                    config.on_disk_payload = schema.on_disk_payload;
                }
                return config;
            }
        );

        for (const config of collectionConfigs) {
            try {
                await this.client.createCollection(config.name, config as any);
                console.log(`✅ Qdrant collection created: ${config.name} (INT8 quantized, ef_construct=${hnsw.ef_construct})`);
            } catch (error: any) {
                if (!error?.message?.includes('already exists')) {
                    console.error(`❌ Failed to create collection ${config.name}:`, error);
                }
            }
        }

        // Create payload indexes for frequently filtered fields (non-fatal)
        await this.ensurePayloadIndexes();
    }

    /** Create payload indexes on fields used in filter queries — O(log n) vs O(n) filter scans */
    private async ensurePayloadIndexes() {
        const indexConfigs: Array<{ collection: string; field: string; schema: 'keyword' | 'integer' | 'float' }> = [
            // chat_history: filtered by user_id and session_id in searchChatContext()
            { collection: this.collections.chat_history, field: 'user_id', schema: 'keyword' },
            { collection: this.collections.chat_history, field: 'session_id', schema: 'keyword' },
            // embeddings_cache: filtered by cache_key and expires_at in getCachedEmbedding()
            { collection: this.collections.embeddings_cache, field: 'cache_key', schema: 'keyword' },
            { collection: this.collections.embeddings_cache, field: 'expires_at', schema: 'integer' },
            // evidence: filtered by evidence_id (must_not) in findRelatedEvidence()
            { collection: this.collections.evidence, field: 'evidence_id', schema: 'keyword' },
            { collection: this.collections.evidence, field: 'case_id', schema: 'keyword' },
            // documents: filtered by case_id and document_type in storeDocument()
            { collection: this.collections.documents, field: 'case_id', schema: 'keyword' },
            { collection: this.collections.documents, field: 'document_type', schema: 'keyword' },
        ];

        for (const { collection, field, schema } of indexConfigs) {
            try {
                await this.client.createPayloadIndex(collection, {
                    field_name: field,
                    field_schema: schema,
                    wait: false,
                });
            } catch (error: any) {
                // Index may already exist — not an error
                if (!error?.message?.includes('already exists')) {
                    console.warn(`⚠️ Payload index ${collection}.${field} failed:`, error?.message);
                }
            }
        }
        console.log(`✅ Payload indexes ensured (${indexConfigs.length} fields across ${new Set(indexConfigs.map(c => c.collection)).size} collections)`);
    }

    async hybridSearch(params: {
	query: string, queryEmbedding: number[];
	collection: string; filters?: any; limit?: number; scoreThreshold?: number; skipCache?: boolean }) {
        const startTime = Date.now();

        // Check Redis cache for identical query+collection+filters
        const cacheKey = params.skipCache ? null : await this.buildSearchCacheKey(params);
        if (cacheKey) {
            try {
                const { getRedis } = await import('../redis.js');
                const redis = getRedis();
                if (redis) {
                    const cached = await redis.get(cacheKey);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        parsed.metadata.responseTime = Date.now() - startTime;
                        parsed.metadata.cached = true;
                        return parsed;
                    }
                }
            } catch { /* cache miss — proceed */ }
        }

        try {
            const searchRequest: any = {
                vector: {
	name: 'content', vector: params.queryEmbedding },
	limit: params.limit ?? 10,
                score_threshold: params.scoreThreshold ?? 0.7,
                with_payload: true,
                with_vector: false
            };

            if (params.filters) {
                searchRequest.filter = this.buildQdrantFilter(params.filters);
            }

            const collectionName = this.collections[params.collection];
            const results = await this.client.search(collectionName, searchRequest);

            const responseTime = Date.now() - startTime;

            const response = {
                results: results.map((result) => ({
                    id: result.id,
                    score: result.score,
                    payload: result.payload
                })),
                metadata: {
	query: params.query,
                    collection: params.collection,
                    responseTime,
                    total_results: results.length,
                    cached: false
                }
            };

            // Cache for 5 minutes (search results change when data is upserted)
            if (cacheKey) {
                try {
                    const { getRedis } = await import('../redis.js');
                    const redis = getRedis();
                    if (redis) {
                        await redis.set(cacheKey, JSON.stringify(response), 'EX', 300);
                    }
                } catch { /* cache write failure — non-fatal */ }
            }

            return response;
        } catch (error: any) {
            console.error('Qdrant hybrid search error:', error);
            throw new Error(`Qdrant search failed: ${error.message}`);
        }
    }

    private async buildSearchCacheKey(params: { query: string; collection: string; filters?: any; limit?: number; scoreThreshold?: number }): Promise<string | null> {
        try {
            const { createHash } = await import('crypto');
            const raw = JSON.stringify({ q: params.query, c: params.collection, f: params.filters, l: params.limit, s: params.scoreThreshold });
            return `qdrant:search:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
        } catch {
            return null;
        }
    }

    async searchChatContext(params: {
	userEmbedding: number[], userId: string; sessionId?: string; limit?: number }) {
        const filters: any = {
            must: [{
	key: 'user_id', match: {
	value: params.userId } }]
        };

        if (params.sessionId) {
            filters.must.push({ key: 'session_id', match: {
	value: params.sessionId } });
        }

        const searchRequest: any = {
            vector: {
	name: 'message', vector: params.userEmbedding },
	limit: params.limit ?? 5,
            score_threshold: 0.6,
            filter: filters,
            with_payload: true
        };

        const results = await this.client.search(this.collections.chat_history, searchRequest);
        return results.map((r) => ({
            content: r.payload?.content,
            role: r.payload?.role,
            score: r.score,
            timestamp: r.payload?.created_at
        }));
    }

    async batchUpsert(params: {
	collection: keyof typeof this.collections, points: any[]; batchSize?: number }) {
        const batchSize = params.batchSize ?? 100;
        const collectionName = this.collections[params.collection];
        const batches = this.chunkArray(params.points, batchSize);
        let totalUpserted = 0;

        for (const batch of batches) {
            try {
                await this.client.upsert(collectionName, { wait: false, points: batch });
                totalUpserted += batch.length;
                console.log(`📝 Upserted ${batch.length} points to ${collectionName}`);
            } catch (error) {
                console.error(`❌ Batch upsert failed for ${collectionName}:`, error);
            }
        }
        // Invalidate cached searches for this collection after upsert
        if (totalUpserted > 0) {
            try {
                const { getRedis } = await import('../redis.js');
                const redis = getRedis();
                if (redis) {
                    const pattern = `qdrant:search:*`;
                    const keys = await redis.keys(pattern);
                    if (keys.length > 0) {
                        await Promise.all(keys.map(k => redis.del(k)));
                    }
                }
            } catch { /* invalidation failure — non-fatal, cache will TTL-expire */ }
        }
        return { totalUpserted };
    }

    async storeDocument(document: {
	id: string, title: string;
	content: string, contentEmbedding: number[]; summaryEmbedding?: number[];
	metadata: Record<string, unknown> }) {
        const point: any = {
            id: document.id,
            vector: {
	content: document.contentEmbedding,
                ...(document.summaryEmbedding && { summary: document.summaryEmbedding })
            },
	payload: {
	title: document.title,
                content_preview: document.content.substring(0, 500),
                document_type: document.metadata.document_type,
                case_id: document.metadata.case_id,
                created_at: new Date().toISOString(),
                ...document.metadata
            }
        };
        await this.client.upsert(this.collections.documents, { wait: true, points: [point] });
    }

    async findRelatedEvidence(evidenceId: string, embedding: number[], limit = 5) {
        const searchRequest: any = {
            vector: {
	name: 'content', vector: embedding },
	limit: limit + 1, // Exclude self
            score_threshold: 0.75,
            filter: {
	must_not: [{ key: 'evidence_id', match: {
	value: evidenceId } }]
            },
	with_payload: true
        };

        const results = await this.client.search(this.collections.evidence, searchRequest);
        return results
            .filter((r) => r.id !== evidenceId)
            .slice(0, limit)
            .map((r) => ({
                evidence_id: r.id,
                similarity_score: r.score,
                relationship_strength: this.calculateRelationshipStrength(r.score),
                evidence_data: r.payload
            }));
    }

    async cacheEmbedding(key: string, embedding: number[]) {
        const point: any = {
            id: key,
            vector: { embedding },
	payload: {
	cache_key: key,
                cached_at: Date.now(),
                expires_at: Date.now() + 24 * 60 * 60 * 1000
            }
        };
       try {
            await this.client.upsert(this.collections.embeddings_cache, { wait: false, points: [point] });
       } catch (e) {
           console.warn('Cache upsert failed (likely ID format if not UUID):', e);
       }
    }

    async getCachedEmbedding(key: string) {
        try {
            const results = await this.client.search(this.collections.embeddings_cache, {
                vector: {
	name: 'embedding', vector: new Array(768).fill(0) },
	limit: 1,
                filter: {
	must: [
                        { key: 'cache_key', match: {
	value: key } },
	{ key: 'expires_at', range: {
	gt: Date.now() } }
                    ]
                }
            });
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            return null;
        }
    }

    async getCollectionInfo(collection: keyof typeof this.collections) {
        try {
            const collectionName = this.collections[collection];
            const info = await this.client.getCollection(collectionName);
            return {
                name: collectionName,
                vectors_count: info.vectors_count ?? 0,
                status: info.status,
                optimizer_status: info.optimizer_status
            };
        } catch (error) {
            console.error(`Failed to get collection info for ${collection}:`, error);
            return null;
        }
    }

    async healthCheck() {
        try {
            const collections = await this.client.getCollections();
            return {
                status: 'healthy',
                collections: collections.collections.map((c) => ({ name: c.name })),
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            return {
                status: 'unhealthy',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    private buildQdrantFilter(filters: any) {
        const conditions: any[] = [];
        for (const [key, value] of Object.entries(filters)) {
            if (Array.isArray(value)) {
                conditions.push({ key, match: {
	any: value } });
            } else {
                conditions.push({ key, match: { value } });
            }
        }
        return { must: conditions };
    }

    private calculateRelationshipStrength(score: number): 'weak' | 'moderate' | 'strong' | 'very_strong' {
        if (score >= 0.9) return 'very_strong';
        if (score >= 0.8) return 'strong';
        if (score >= 0.7) return 'moderate';
        return 'weak';
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

export const qdrant = new QdrantManager();





