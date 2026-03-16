import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';

// ── BM25 Sparse Vector Generator ─────────────────────────────────────────
// Generates sparse vectors for Qdrant hybrid search (dense + sparse RRF fusion).
// Uses deterministic token hashing for vocabulary-free BM25-style weighting.

const SPARSE_STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'after', 'before', 'above', 'below', 'and', 'or', 'not',
    'but', 'if', 'then', 'than', 'so', 'no', 'nor', 'too', 'very',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
    'same', 'just', 'also', 'any', 'it', 'its',
]);

/** Hash a token string to a stable uint32 index (vocabulary-free). */
function tokenToIndex(token: string): number {
    let h = 0x811c9dc5; // FNV-1a offset basis
    for (let i = 0; i < token.length; i++) {
        h ^= token.charCodeAt(i);
        h = Math.imul(h, 0x01000193); // FNV prime
    }
    return (h >>> 0) % 2_000_000; // Cap at 2M vocabulary slots
}

export interface SparseVector {
    indices: number[];
    values: number[];
}

/**
 * Generate a BM25-style sparse vector from text.
 * Tokens are hashed to vocabulary indices; values are log(1 + TF) normalized.
 * Legal tokens (§, U.S.C.) get 2x weight boost.
 */
export function generateSparseVector(text: string): SparseVector {
    const tokens = text
        .toLowerCase()
        .replace(/[^\w\s§./-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1 && !SPARSE_STOP_WORDS.has(t));

    if (tokens.length === 0) return { indices: [], values: [] };

    // Count term frequencies
    const tf = new Map<number, { count: number; isLegal: boolean }>();
    for (const token of tokens) {
        const idx = tokenToIndex(token);
        const isLegal = token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr');
        const entry = tf.get(idx);
        if (entry) {
            entry.count++;
            if (isLegal) entry.isLegal = true;
        } else {
            tf.set(idx, { count: 1, isLegal });
        }
    }

    // Build sparse vector with log(1+TF) weighting
    const indices: number[] = [];
    const values: number[] = [];
    for (const [idx, { count, isLegal }] of tf) {
        indices.push(idx);
        const weight = Math.log(1 + count) * (isLegal ? 2.0 : 1.0);
        values.push(weight);
    }

    // L2-normalize values
    const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
        for (let i = 0; i < values.length; i++) values[i] /= norm;
    }

    return { indices, values };
}

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
            // evidence: filtered by section_type in sectionFilteredSearch()
            { collection: this.collections.evidence, field: 'section_type', schema: 'keyword' },
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

    /**
     * Search evidence collection filtered by legal section type(s).
     * Uses the section_type keyword payload index for O(log n) filtering.
     */
    async sectionFilteredSearch(params: {
        query: string;
        queryEmbedding: number[];
        sectionTypes: string[];
        caseId?: string | null;
        limit?: number;
        scoreThreshold?: number;
    }) {
        const startTime = Date.now();
        const mustConditions: any[] = [
            { key: 'section_type', match: { any: params.sectionTypes } },
        ];
        if (params.caseId) {
            mustConditions.push({ key: 'case_id', match: { value: params.caseId } });
        }

        try {
            const results = await this.client.search(this.collections.evidence, {
                vector: { name: 'content', vector: params.queryEmbedding },
                limit: params.limit ?? 10,
                score_threshold: params.scoreThreshold ?? 0.5,
                filter: { must: mustConditions },
                with_payload: true,
                with_vector: false,
            });

            return {
                results: results.map((r) => ({
                    id: r.id,
                    score: r.score,
                    payload: r.payload,
                })),
                metadata: {
                    query: params.query,
                    collection: 'evidence',
                    sectionTypes: params.sectionTypes,
                    responseTime: Date.now() - startTime,
                    total_results: results.length,
                    cached: false,
                },
            };
        } catch (error: any) {
            console.error('Qdrant section-filtered search error:', error);
            return { results: [], metadata: { query: params.query, collection: 'evidence', responseTime: Date.now() - startTime, total_results: 0, cached: false } };
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

    /**
     * BM42-style hybrid search: dense vector + sparse BM25 vector fused via RRF.
     * Uses Qdrant's query API with prefetch for server-side multi-stage retrieval.
     * Falls back to dense-only search if the collection lacks sparse vectors.
     */
    async sparseHybridSearch(params: {
        query: string;
        queryEmbedding: number[];
        collection: string;
        denseVectorName?: string;
        sparseVectorName?: string;
        filters?: any;
        limit?: number;
        scoreThreshold?: number;
    }) {
        const startTime = Date.now();
        const collectionName = this.collections[params.collection] ?? params.collection;
        const denseVecName = params.denseVectorName ?? 'content';
        const sparseVecName = params.sparseVectorName ?? 'bm25';
        const limit = params.limit ?? 10;

        // Generate sparse vector from query text
        const sparseVec = generateSparseVector(params.query);

        try {
            // Try hybrid query with RRF fusion (dense + sparse prefetch)
            const queryParams: any = {
                prefetch: [
                    {
                        query: { indices: sparseVec.indices, values: sparseVec.values },
                        using: sparseVecName,
                        limit: limit * 3,
                    },
                    {
                        query: params.queryEmbedding,
                        using: denseVecName,
                        limit: limit * 3,
                    },
                ],
                query: { fusion: 'rrf' },
                limit,
                with_payload: true,
                with_vector: false,
            };

            if (params.filters) {
                queryParams.filter = this.buildQdrantFilter(params.filters);
            }

            const response = await this.client.query(collectionName, queryParams);
            const points = (response as any).points ?? response ?? [];

            return {
                results: Array.isArray(points) ? points.map((p: any) => ({
                    id: p.id,
                    score: p.score,
                    payload: p.payload,
                })) : [],
                metadata: {
                    query: params.query,
                    collection: params.collection,
                    responseTime: Date.now() - startTime,
                    total_results: Array.isArray(points) ? points.length : 0,
                    searchType: 'hybrid-rrf',
                    cached: false,
                },
            };
        } catch (error: any) {
            // Fallback to dense-only if collection doesn't have sparse vectors
            if (error?.message?.includes('sparse') || error?.message?.includes('not found') || error?.message?.includes('does not exist')) {
                console.warn(`[qdrant] Sparse vector not available on ${collectionName}, falling back to dense-only`);
                return this.hybridSearch({
                    query: params.query,
                    queryEmbedding: params.queryEmbedding,
                    collection: params.collection,
                    filters: params.filters,
                    limit,
                    scoreThreshold: params.scoreThreshold,
                });
            }
            console.error('Qdrant sparse hybrid search error:', error);
            throw new Error(`Qdrant hybrid search failed: ${error.message}`);
        }
    }

    /**
     * Ensure a collection has sparse vector support for BM42 hybrid search.
     * Adds a 'bm25' sparse vector config if not already present.
     */
    async ensureSparseVectors(collectionName: string, sparseVectorName = 'bm25') {
        try {
            const info = await this.client.getCollection(collectionName);
            const sparseVecs = (info as any).config?.params?.sparse_vectors;
            if (sparseVecs && sparseVectorName in sparseVecs) {
                return; // Already configured
            }
            // Update collection to add sparse vector
            await this.client.updateCollection(collectionName, {
                sparse_vectors: {
                    [sparseVectorName]: {},
                },
            });
            console.log(`✅ Added sparse vector '${sparseVectorName}' to ${collectionName}`);
        } catch (error: any) {
            console.warn(`⚠️ Could not add sparse vectors to ${collectionName}:`, error?.message);
        }
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

// ── Adaptive GPU Scaling ─────────────────────────────────────────────────
// Auto-downgrade quantization when GPU thermal thresholds are exceeded.
// Extracted from vector/metadata-encoder.ts adaptive scaling pattern.

export type QuantizationLevel = 'int8' | 'int4' | 'binary';
export type ScalingMode = 'balanced' | 'performance' | 'memory';

export interface GPUHealthMetrics {
    memoryUsage: number;   // 0.0-1.0 ratio
    temperature: number;   // Celsius
    gpuUtilization: number; // 0.0-1.0 ratio
}

export interface ScalingDecision {
    shouldScale: boolean;
    recommendedDimensions: number;
    recommendedQuantization: QuantizationLevel;
}

/**
 * Decide whether to downgrade vector dimensions/quantization based on GPU health.
 * Call this before batch upserts to protect against GPU thermal throttling.
 */
export function adaptiveScalingDecision(
    metrics: GPUHealthMetrics,
    mode: ScalingMode = 'balanced'
): ScalingDecision {
    const shouldScale =
        metrics.memoryUsage > 0.8 ||
        metrics.temperature > 75;

    if (!shouldScale) {
        return { shouldScale: false, recommendedDimensions: 768, recommendedQuantization: 'int8' };
    }

    switch (mode) {
        case 'performance':
            return { shouldScale: true, recommendedDimensions: 512, recommendedQuantization: 'int4' };
        case 'memory':
            return { shouldScale: true, recommendedDimensions: 256, recommendedQuantization: 'binary' };
        default: // balanced
            return { shouldScale: true, recommendedDimensions: 384, recommendedQuantization: 'int4' };
    }
}

export const qdrant = new QdrantManager();





