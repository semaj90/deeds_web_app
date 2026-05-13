import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';
import { VECTOR_CONFIG, buildVectorPayload } from '$lib/server/config/vector-config.js';
import { generateSparseVector, type SparseVector } from './bm42-sparse.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { traceVectorSearch } from '$lib/server/observability/langfuse.js';

// Re-export for existing consumers
export { generateSparseVector, type SparseVector };

/** Shared return shape for all search methods (hybridSearch, _denseSearch, sectionFilteredSearch, sparseHybridSearch). */
export interface QdrantSearchResult {
  results: { id: string | number; score: number; payload?: Record<string, unknown> }[];
  metadata: {
    query: string;
    collection: string;
    responseTime: number;
    total_results: number;
    cached: boolean;
    searchType: string;
    [key: string]: unknown;
  };
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

const sparseSupportCache = new Map<string, boolean>();
const denseOnlyNoticeEmitted = new Set<string>();

export class QdrantManager {
  public client: QdrantClient;
  /** Canonical collection names — sourced from VECTOR_CONFIG */
  public readonly collections = VECTOR_CONFIG.COLLECTIONS;

  constructor(url = ENV.QDRANT_URL) {
    this.client = new QdrantClient({ url });
  }

  private sparseSupportCacheKey(collectionName: string, sparseVectorName: string): string {
    return `${collectionName}:${sparseVectorName}`;
  }

  private async getSparseSupport(
    collectionName: string,
    sparseVectorName: string
  ): Promise<boolean | null> {
    const cacheKey = this.sparseSupportCacheKey(collectionName, sparseVectorName);
    if (sparseSupportCache.has(cacheKey)) {
      return sparseSupportCache.get(cacheKey) ?? null;
    }

    try {
      const info = await this.client.getCollection(collectionName);
      const sparseVectors =
        (info as any).config?.params?.sparse_vectors ??
        (info as any).config?.sparse_vectors ??
        (info as any).result?.config?.params?.sparse_vectors;
      const supported = Boolean(
        sparseVectors &&
          typeof sparseVectors === 'object' &&
          Object.prototype.hasOwnProperty.call(sparseVectors, sparseVectorName)
      );
      sparseSupportCache.set(cacheKey, supported);
      return supported;
    } catch {
      return null;
    }
  }

  private noteDenseOnly(collectionName: string, sparseVectorName: string, reason: string): void {
    const key = `${collectionName}:${sparseVectorName}:${reason}`;
    if (denseOnlyNoticeEmitted.has(key)) return;
    denseOnlyNoticeEmitted.add(key);
    console.info(`[qdrant] ${collectionName} using dense-only search (${reason})`);
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
        console.log(
          `✅ Qdrant collection created: ${config.name} (INT8 quantized, ef_construct=${hnsw.ef_construct})`
        );
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
    const indexConfigs: Array<{
      collection: string;
      field: string;
      schema: 'keyword' | 'integer' | 'float';
    }> = [
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
      // legal_canon_chunks: filtered by jurisdiction, authority_level, doc_type in /api/canon/search
      { collection: this.collections.legal_canon_chunks, field: 'jurisdiction', schema: 'keyword' },
      {
        collection: this.collections.legal_canon_chunks,
        field: 'authority_level',
        schema: 'keyword',
      },
      { collection: this.collections.legal_canon_chunks, field: 'doc_type', schema: 'keyword' },
      {
        collection: this.collections.legal_canon_chunks,
        field: 'semantic_label',
        schema: 'keyword',
      },
      // fictional_case_chunks: filtered by case_id, category, jurisdiction
      { collection: this.collections.fictional_case_chunks, field: 'case_id', schema: 'keyword' },
      { collection: this.collections.fictional_case_chunks, field: 'category', schema: 'keyword' },
      {
        collection: this.collections.fictional_case_chunks,
        field: 'jurisdiction',
        schema: 'keyword',
      },
      // ── codebase_chunks_768 — KAG/ACE/error-fix critical filters ──────────────
      // These fields are used in every codebase search: by language, by kind (route/
      // component/schema/migration), by K-means cluster, by SOM neuron, by file path,
      // by extracted symbol, and by repo for future multi-repo support.
      // Without these indexes Qdrant does a full O(n) payload scan on every query.
      { collection: this.collections.codebase_chunks, field: 'kind', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'language', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'cluster_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'som_cluster', schema: 'integer' },
      { collection: this.collections.codebase_chunks, field: 'path', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'symbol_name', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'tags', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'repo', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'error_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'updated_at', schema: 'integer' },
      { collection: this.collections.codebase_chunks, field: 'cluster_key', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'topo_class', schema: 'keyword' },
      // evidence_items: add cluster + tag indexes for cross-case similarity
      { collection: this.collections.evidence, field: 'cluster_id', schema: 'keyword' },
      { collection: this.collections.evidence, field: 'tags', schema: 'keyword' },
      { collection: this.collections.evidence, field: 'entity_labels', schema: 'keyword' },
      // ── summary_lenses — KAG/TRACE multi-lens retrieval ──────────────
      { collection: this.collections.summary_lenses, field: 'stable_key', schema: 'keyword' },
      { collection: this.collections.summary_lenses, field: 'lens_type', schema: 'keyword' },
      // ── synthesis_memory — long-term agent memory ────────────────────
      { collection: this.collections.synthesis_memory, field: 'source', schema: 'keyword' },
      { collection: this.collections.synthesis_memory, field: 'tags', schema: 'keyword' },
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
    console.log(
      `✅ Payload indexes ensured (${indexConfigs.length} fields across ${new Set(indexConfigs.map((c) => c.collection)).size} collections)`
    );
  }

  /**
   * Universal Multi-Query Search — Combines multiple sub-queries (dense, sparse, filtered)
   * into a single retrieval pass using Qdrant's Universal Query API (prefetch + fusion).
   *
   * Replaces legacy manual RRF fusion with server-side fusion for better performance.
   */
  async multiQuerySearch(params: {
    queries: Array<{
      query?: string;
      vector?: number[] | SparseVector;
      vectorName?: string;
      filter?: any;
      limit?: number;
      weight?: number;
    }>;
    collection: string;
    fusion?: 'rrf' | 'dbsf';
    limit?: number;
    scoreThreshold?: number;
    skipCache?: boolean;
  }): Promise<QdrantSearchResult> {
    return traceVectorSearch(
      params.collection,
      { searchType: 'multi-query-fusion', queryCount: params.queries.length, limit: params.limit },
      async () => {
        const startTime = Date.now();
        const collectionName =
          this.collections[params.collection as keyof typeof this.collections] ?? params.collection;

        // Build prefetch sub-queries
        const prefetches = params.queries.map((q) => {
          const prefetch: any = {
            limit: q.limit ?? params.limit ?? 20,
          };
          if (q.vector) {
            if (Array.isArray(q.vector)) {
              // Dense vector
              prefetch.query = q.vector;
              if (q.vectorName) prefetch.using = q.vectorName;
            } else {
              // Sparse vector (Indices/Values)
              prefetch.query = {
                indices: q.vector.indices,
                values: q.vector.values,
              };
              prefetch.using = q.vectorName ?? 'bm25';
            }
          }
          if (q.filter) {
            prefetch.filter = this.buildQdrantFilter(q.filter);
          }
          return prefetch;
        });

        const searchRequest: any = {
          prefetch: prefetches,
          query: {
            fusion: params.fusion ?? 'rrf',
          },
          limit: params.limit ?? 10,
          score_threshold: params.scoreThreshold ?? 0.01, // Let fusion decide final scores
          with_payload: true,
        };

        const results = (await this.client.query(collectionName, searchRequest)) as any;
        const responseTime = Date.now() - startTime;

        return {
          results: results.points.map((p: any) => ({
            id: p.id,
            score: p.score,
            payload: p.payload,
          })),
          metadata: {
            query: 'multi-query-fusion',
            collection: params.collection,
            responseTime,
            total_results: results.points.length,
            cached: false,
            searchType: 'multi-query-fusion',
            fusion: params.fusion ?? 'rrf',
          },
        };
      }
    );
  }

  /**
   * Hybrid dense+sparse search (BM42 RRF fusion).
   * Now uses the native Universal Query API for multi-lane retrieval.
   */
  async hybridSearch(params: {
    query: string;
    queryEmbedding: number[];
    collection: string;
    filters?: any;
    limit?: number;
    scoreThreshold?: number;
    skipCache?: boolean;
  }): Promise<QdrantSearchResult> {
    const sparseAvailable = await this.getSparseSupport(params.collection, 'bm25');

    if (!sparseAvailable) {
      return this._denseSearch(params);
    }

    const sparseVector = await generateSparseVector(params.query);

    return this.multiQuerySearch({
      collection: params.collection,
      queries: [
        {
          vector: params.queryEmbedding,
          vectorName: 'default',
          limit: params.limit ?? 20,
          weight: 1.0,
          filter: params.filters,
        },
        {
          vector: sparseVector,
          vectorName: 'bm25',
          limit: params.limit ?? 20,
          weight: 1.0,
          filter: params.filters,
        },
      ],
      fusion: 'rrf',
      limit: params.limit,
      scoreThreshold: params.scoreThreshold,
      skipCache: params.skipCache,
    });
  }

  /**
   * Dense-only cosine search. Used as automatic fallback by sparseHybridSearch
   * when a collection has no sparse (BM42) vectors configured.
   * Callers that explicitly want dense-only can call this directly.
   */
  async _denseSearch(params: {
    query: string;
    queryEmbedding: number[];
    collection: string;
    filters?: any;
    limit?: number;
    scoreThreshold?: number;
    skipCache?: boolean;
  }): Promise<QdrantSearchResult> {
    return traceVectorSearch(
      params.collection,
      { searchType: 'dense-cosine', query: params.query, limit: params.limit },
      async () => {
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
                const parsed = fastJsonParse<QdrantSearchResult>(cached);
                parsed.metadata.responseTime = Date.now() - startTime;
                parsed.metadata.cached = true;
                return parsed;
              }
            }
          } catch {
            /* cache miss — proceed */
          }
        }

        try {
          // Resolve collection name and build correct vector payload from VECTOR_CONFIG
          const collectionName =
            this.collections[params.collection as keyof typeof this.collections] ??
            params.collection;
          const vectorField = buildVectorPayload(collectionName, params.queryEmbedding);

          const searchRequest: any = {
            vector: vectorField,
            limit: params.limit ?? 10,
            score_threshold: params.scoreThreshold ?? 0.7,
            with_payload: true,
            with_vector: false,
          };

          if (params.filters) {
            searchRequest.filter = this.buildQdrantFilter(params.filters);
          }

          const results = await this.client.search(collectionName, searchRequest);

          const responseTime = Date.now() - startTime;

          const response = {
            results: results.map((result) => ({
              id: result.id,
              score: result.score,
              payload: result.payload,
            })),
            metadata: {
              query: params.query,
              collection: params.collection,
              responseTime,
              total_results: results.length,
              cached: false,
              searchType: 'dense-cosine',
            },
          };

          // Cache for 5 minutes
          if (cacheKey) {
            try {
              const { getRedis } = await import('../redis.js');
              const redis = getRedis();
              if (redis) {
                await redis.set(cacheKey, JSON.stringify(response), 'EX', 300);
              }
            } catch {
              /* cache write failure — non-fatal */
            }
          }

          return response;
        } catch (error: any) {
          console.error('Qdrant dense search error:', error);
          throw new Error(`Qdrant search failed: ${error.message}`);
        }
      }
    ); // end traceVectorSearch
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
  }): Promise<QdrantSearchResult> {
    return traceVectorSearch(
      'evidence',
      { searchType: 'section-filtered', query: params.query, sectionTypes: params.sectionTypes },
      async () => {
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
              searchType: 'section-filtered',
            },
          };
        } catch (error: any) {
          console.error('Qdrant section-filtered search error:', error);
          return {
            results: [],
            metadata: {
              query: params.query,
              collection: 'evidence',
              responseTime: Date.now() - startTime,
              total_results: 0,
              cached: false,
              searchType: 'section-filtered',
            },
          };
        }
      }
    ); // end traceVectorSearch
  }

  private async buildSearchCacheKey(params: {
    query: string;
    collection: string;
    filters?: any;
    limit?: number;
    scoreThreshold?: number;
  }): Promise<string | null> {
    try {
      const { createHash } = await import('crypto');
      const raw = JSON.stringify({
        q: params.query,
        c: params.collection,
        f: params.filters,
        l: params.limit,
        s: params.scoreThreshold,
      });
      return `qdrant:search:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
    } catch {
      return null;
    }
  }

  async searchChatContext(params: {
    userEmbedding: number[];
    userId: string;
    sessionId?: string;
    limit?: number;
  }) {
    const filters: any = {
      must: [
        {
          key: 'user_id',
          match: {
            value: params.userId,
          },
        },
      ],
    };

    if (params.sessionId) {
      filters.must.push({
        key: 'session_id',
        match: {
          value: params.sessionId,
        },
      });
    }

    const searchRequest: any = {
      vector: {
        name: 'message',
        vector: params.userEmbedding,
      },
      limit: params.limit ?? 5,
      score_threshold: 0.6,
      filter: filters,
      with_payload: true,
    };

    const results = await this.client.search(this.collections.chat_history, searchRequest);
    return results.map((r) => ({
      content: r.payload?.content,
      role: r.payload?.role,
      score: r.score,
      timestamp: r.payload?.created_at,
    }));
  }

  async batchUpsert(params: {
    collection: keyof typeof this.collections;
    points: any[];
    batchSize?: number;
  }) {
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
            const delPipeline = redis.pipeline();
            for (const k of keys) delPipeline.del(k);
            await delPipeline.exec();
          }
        }
      } catch {
        /* invalidation failure — non-fatal, cache will TTL-expire */
      }
    }
    return { totalUpserted };
  }

  async storeDocument(document: {
    id: string;
    title: string;
    content: string;
    contentEmbedding: number[];
    summaryEmbedding?: number[];
    metadata: Record<string, unknown>;
  }) {
    const point: any = {
      id: document.id,
      vector: {
        content: document.contentEmbedding,
        ...(document.summaryEmbedding && { summary: document.summaryEmbedding }),
      },
      payload: {
        title: document.title,
        content_preview: document.content.substring(0, 500),
        document_type: document.metadata.document_type,
        case_id: document.metadata.case_id,
        created_at: new Date().toISOString(),
        ...document.metadata,
      },
    };
    await this.client.upsert(this.collections.documents, { wait: true, points: [point] });
  }

  async findRelatedEvidence(evidenceId: string, embedding: number[], limit = 5) {
    const searchRequest: any = {
      vector: {
        name: 'content',
        vector: embedding,
      },
      limit: limit + 1, // Exclude self
      score_threshold: 0.75,
      filter: {
        must_not: [
          {
            key: 'evidence_id',
            match: {
              value: evidenceId,
            },
          },
        ],
      },
      with_payload: true,
    };

    const results = await this.client.search(this.collections.evidence, searchRequest);
    return results
      .filter((r) => r.id !== evidenceId)
      .slice(0, limit)
      .map((r) => ({
        evidence_id: r.id,
        similarity_score: r.score,
        relationship_strength: this.calculateRelationshipStrength(r.score),
        evidence_data: r.payload,
      }));
  }

  async cacheEmbedding(key: string, embedding: number[]) {
    const point: any = {
      // deterministicPointId: MD5 hash → 4 bytes → int % 2^31 — always a valid Qdrant int ID
      id: deterministicPointId(key),
      vector: { embedding },
      payload: {
        cache_key: key,
        cached_at: Date.now(),
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
      },
    };
    try {
      await this.client.upsert(this.collections.embeddings_cache, { wait: false, points: [point] });
    } catch (e) {
      console.warn('[qdrant] cacheEmbedding upsert failed:', e);
    }
  }

  async getCachedEmbedding(key: string) {
    try {
      const results = await this.client.search(this.collections.embeddings_cache, {
        vector: {
          name: 'embedding',
          vector: new Array(768).fill(0),
        },
        limit: 1,
        filter: {
          must: [
            {
              key: 'cache_key',
              match: {
                value: key,
              },
            },
            {
              key: 'expires_at',
              range: {
                gt: Date.now(),
              },
            },
          ],
        },
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
        optimizer_status: info.optimizer_status,
      };
    } catch (error) {
      console.error(`Failed to get collection info for ${collection}:`, error);
      return null;
    }
  }

  async getCollections() {
    return await this.client.getCollections();
  }

  async healthCheck() {
    try {
      const collections = await this.getCollections();
      return {
        status: 'healthy',
        collections: collections.collections.map((c) => ({ name: c.name })),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private buildQdrantFilter(filters: any) {
    const conditions: any[] = [];
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        conditions.push({
          key,
          match: {
            any: value,
          },
        });
      } else {
        conditions.push({ key, match: { value } });
      }
    }
    return { must: conditions };
  }

  /**
   * Hyper Search — Multi-collection parallel search with Reciprocal Rank Fusion (RRF).
   * Aggregates results from codebase, evidence, and legal canon in one shot.
   */
  async hyperSearch(params: {
    query: string;
    queryEmbedding: number[];
    collections?: string[];
    limit?: number;
  }): Promise<QdrantSearchResult> {
    const collections = params.collections || ['codebase_chunks', 'evidence', 'legal_canon_chunks'];
    const limit = params.limit ?? 20;
    const startTime = Date.now();

    // Parallel search across all requested collections
    const searchPromises = collections.map(col => 
      this.hybridSearch({
        query: params.query,
        queryEmbedding: params.queryEmbedding,
        collection: col,
        limit: limit * 2 // Over-sample for better fusion
      }).catch(err => {
        console.error(`HyperSearch failed for ${col}:`, err);
        return { results: [], metadata: {} } as any;
      })
    );

    const allResults = await Promise.all(searchPromises);
    
    // RRF Fusion Logic: score = sum(1 / (60 + rank))
    const fusedResultsMap = new Map<string, { id: string | number; score: number; payload: any; collection: string }>();
    const RRF_CONSTANT = 60;

    allResults.forEach((res, colIdx) => {
      const collectionName = collections[colIdx];
      res.results.forEach((hit: any, rank: number) => {
        const key = `${collectionName}:${hit.id}`;
        const rrfScore = 1 / (RRF_CONSTANT + rank + 1);
        
        if (fusedResultsMap.has(key)) {
          fusedResultsMap.get(key)!.score += rrfScore;
        } else {
          fusedResultsMap.set(key, {
            id: hit.id,
            score: rrfScore,
            payload: { ...hit.payload, _collection: collectionName },
            collection: collectionName
          });
        }
      });
    });

    const fusedResults = Array.from(fusedResultsMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      results: fusedResults.map(r => ({ id: r.id, score: r.score, payload: r.payload })),
      metadata: {
        query: params.query,
        collection: 'hyper-collection',
        responseTime: Date.now() - startTime,
        total_results: fusedResults.length,
        cached: false,
        searchType: 'hyper-rrf-fusion'
      }
    };
  }

  /**
   * Dense-only cosine search. Used as automatic fallback by sparseHybridSearch
            });
            denseResult.metadata.sparseAvailable = false;
            denseResult.metadata.sparseFallback = 'runtime-dense-only';
            return denseResult;
          }
          console.error('Qdrant sparse hybrid search error:', error);
          throw new Error(`Qdrant hybrid search failed: ${error.message}`);
        }
      }
    ); // end traceVectorSearch
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
        sparseSupportCache.set(this.sparseSupportCacheKey(collectionName, sparseVectorName), true);
        return; // Already configured
      }
      // Update collection to add sparse vector
      await this.client.updateCollection(collectionName, {
        sparse_vectors: {
          [sparseVectorName]: {},
        },
      });
      sparseSupportCache.set(this.sparseSupportCacheKey(collectionName, sparseVectorName), true);
      console.log(`✅ Added sparse vector '${sparseVectorName}' to ${collectionName}`);
    } catch (error: any) {
      console.warn(`⚠️ Could not add sparse vectors to ${collectionName}:`, error?.message);
    }
  }

  /**
   * Semantic Clustering — Scroll all points, run k-means on GPU, and write back assignments.
   * Useful for directory mapping and Atlas visualization.
   */
  async clusterCollection(params: {
    collection: string;
    k: number;
    vectorName?: string;
    batchSize?: number;
  }) {
    const { collection, k, vectorName = 'content', batchSize = 1000 } = params;
    const startTime = Date.now();
    
    const { kmeansWithCentroids } = await import('../gpu/pytorch-graph.js');
    
    // 1. Scroll all points to get embeddings
    const embeddings: number[][] = [];
    const ids: (string | number)[] = [];
    let nextOffset: string | number | null | undefined = null;
    
    console.log(`[qdrant] Starting cluster scroll for ${collection}...`);
    
    do {
      const scrollResult: any = await this.client.scroll(collection, {
        limit: batchSize,
        offset: nextOffset as any,
        with_vector: [vectorName],
        with_payload: false
      });
      
      for (const point of scrollResult.points) {
        const vec = point.vector?.[vectorName] || point.vector;
        if (vec && Array.isArray(vec)) {
          embeddings.push(vec);
          ids.push(point.id);
        }
      }
      
      nextOffset = scrollResult.next_page_offset;
    } while (nextOffset);
    
    const n = embeddings.length;
    if (n === 0) return { status: 'empty', count: 0 };
    const dim = embeddings[0].length;
    
    console.log(`[qdrant] Scrolled ${n} points. Running k-means (k=${k})...`);
    
    // 2. Flatten for GPU k-means
    const flat = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
      flat.set(embeddings[i], i * dim);
    }
    
    // 3. Run k-means
    const { assignments, centroids, source } = kmeansWithCentroids(flat, n, dim, k);
    
    console.log(`[qdrant] k-means complete (${source}). Writing back assignments...`);
    
    // 4. Write back assignments in batches
    const updateBatches = this.chunkArray(ids.map((id, i) => ({
      id,
      payload: { cluster_id: assignments[i] }
    })), batchSize);
    
    for (const batch of updateBatches) {
      await this.client.setPayload(collection, {
        payload: { cluster_id: 0 }, // placeholder to define key if missing
        points: batch.map(p => p.id)
      });
      // Actually set the specific cluster_id per point
      // Note: setPayload with points array sets the same payload for all.
      // We need overwritePayload or individual updates if clusterIds differ.
      // Better: use batch update if available or loop.
      // Optimization: group by cluster_id to minimize calls.
      const byCluster = new Map<number, (string | number)[]>();
      for (const item of batch) {
        const c = assignments[ids.indexOf(item.id)];
        if (!byCluster.has(c)) byCluster.set(c, []);
        byCluster.get(c)!.push(item.id);
      }
      
      for (const [clusterId, points] of byCluster.entries()) {
        await this.client.setPayload(collection, {
          payload: { cluster_id: clusterId },
          points
        });
      }
    }
    
    return {
      status: 'success',
      count: n,
      clusters: k,
      durationMs: Date.now() - startTime,
      source
    };
  }

  private calculateRelationshipStrength(
    score: number
  ): 'weak' | 'moderate' | 'strong' | 'very_strong' {
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





