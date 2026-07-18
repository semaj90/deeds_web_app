import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';
import { getQdrantClient } from './qdrant-singleton.js';
import {
  VECTOR_CONFIG,
  buildVectorPayload,
  getCollectionDimension,
} from '$lib/server/config/vector-config.js';
import { generateSparseVector, type SparseVector } from './bm42-sparse.js';
import { fastJsonParse } from '../gpu/simdjson-bridge.js';
import { traceVectorSearch } from '../observability/langfuse.js';
import {
  type CodebaseVectorName,
  type DenseSearchParams,
  assertVectorDimension,
  buildQdrantSearchRequest,
} from './vector-contracts.js';

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

/**
 * Generate a deterministic UUID-like string from a SHA-256 hash.
 * Formats the hash as a valid UUID string (8-4-4-4-12) for Qdrant compatibility.
 */
export function sha256ToUuid(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
}

/**
 * Deterministic chunk/point id using SHA-256 of canonical parts.
 * Returns the hex digest (full 64-char) which is safe to use as a string id in Qdrant.
 * Key format: sha256(`${workspaceId}:${sourceRef}:${chunkIndex}:${contentHash}`)
 */
export function deterministicChunkId(
  workspaceId: string,
  sourceRef: string,
  chunkIndex: number | string,
  contentHash: string
): string {
  const raw = `${workspaceId}:${sourceRef}:${chunkIndex}:${contentHash}`;
  return createHash('sha256').update(raw).digest('hex');
}


const sparseSupportCache = new Map<string, boolean>();
const denseOnlyNoticeEmitted = new Set<string>();

export class QdrantManager {
  public client: QdrantClient;
  /** Canonical collection names — sourced from VECTOR_CONFIG */
  public readonly collections = VECTOR_CONFIG.COLLECTIONS;
  /** In-flight concurrent search dedupe map. Keys are short hashes of search params. */
  private inflightSearches: Map<string, Promise<QdrantSearchResult>> = new Map();

  constructor(url = ENV.QDRANT_URL) {
    // Use singleton client if URL matches default; otherwise allow custom client
    // This preserves backward compatibility while enabling connection pooling for default usage
    if (!url || url === ENV.QDRANT_URL) {
      this.client = getQdrantClient();
    } else {
      this.client = new QdrantClient({ url });
    }
    // Wrap client.upsert to enforce vector-dimension validation for any direct upsert calls
    try {
      const originalUpsert = (this.client as any).upsert?.bind(this.client);
      if (originalUpsert) {
        (this.client as any).upsert = async (collectionName: string, body: any) => {
          try {
            const points = body?.points ?? [];
            const invalids: Array<{
              id: string | number;
              vectorName?: string;
              found?: string | number;
            }> = [];
            for (const p of points) {
              const v = p.vector;
              const expectedDim = getCollectionDimension(collectionName);
              if (Array.isArray(v)) {
                if (v.length !== expectedDim)
                  invalids.push({ id: p.id, found: v.length });
              } else if (v && typeof v === 'object') {
                for (const [name, val] of Object.entries(v)) {
                  if (Array.isArray(val) && (val as any).length !== expectedDim) {
                    invalids.push({ id: p.id, vectorName: name, found: (val as any).length });
                  }
                }
              }
            }

            if (invalids.length > 0) {
              try {
                await fs.mkdir('.tmp', { recursive: true });
                await fs.writeFile(
                  '.tmp/qdrant-upsert-dim-report.json',
                  JSON.stringify(
                    {
                      error: 'invalid_vector_dimensions',
                      details: invalids,
                      expected: getCollectionDimension(collectionName),
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  )
                );
              } catch (e) {
                console.error('Failed to write qdrant upsert dim report (wrapped upsert):', e);
              }
              throw new Error(
                `Aborting Qdrant upsert: found ${invalids.length} points with invalid vector dimensions (expected ${getCollectionDimension(collectionName)}). See .tmp/qdrant-upsert-dim-report.json`
              );
            }

            return await originalUpsert(collectionName, body);
          } catch (err) {
            throw err;
          }
        };
      }
    } catch (e) {
      // Non-fatal: if wrapping fails, rely on explicit batchUpsert/storeDocument checks
      console.warn('[qdrant] failed to wrap client.upsert for additional validation:', e);
    }
  }

  /**
   * Compatibility helper for legacy callers that still expect a fetch-style
   * Qdrant client surface.
   */
  async post(path: string, body: unknown): Promise<{ result?: unknown; status?: string }> {
    const baseUrl = ENV.QDRANT_URL.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Qdrant POST ${path} failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as { result?: unknown; status?: string };
  }

  /**
   * Build a canonical telemetry metadata object for Langfuse traces.
   * Ensures all expected fields exist (may be null) so downstream consumers
   * have a stable schema even when callers provide partial metadata.
   */
  private buildTelemetryMetadata(base: Record<string, unknown> | undefined) {
    const b = base ?? {};
    return {
      // Core fields
      collection: b['collection'] ?? null,
      operation: b['searchType'] ?? b['operation'] ?? null,
      query: b['query'] ?? null,
      // Semantic/packet fields
      point_kind: b['point_kind'] ?? b['kind'] ?? null,
      feature_id: b['feature_id'] ?? b['featureId'] ?? null,
      workspace_task_id: b['workspace_task_id'] ?? b['workspaceTaskId'] ?? null,
      workspace_id: b['workspace_id'] ?? b['workspaceId'] ?? null,
      source_ref: b['source_ref'] ?? b['sourceRef'] ?? null,
      file_path: b['file_path'] ?? b['filePath'] ?? null,
      semantic_path: b['semantic_path'] ?? null,
      cluster_id: b['cluster_id'] ?? b['clusterId'] ?? null,
      parent_cluster_id: b['parent_cluster_id'] ?? b['parentClusterId'] ?? null,
      centroid_id: b['centroid_id'] ?? b['centroidId'] ?? null,
      status: b['status'] ?? null,
      agent_pickup_ready: b['agent_pickup_ready'] ?? null,
      next_action: b['next_action'] ?? null,
      schema_table: b['schema_table'] ?? b['table'] ?? null,
      schema_column: b['schema_column'] ?? b['column'] ?? null,
      embedding_model: b['embedding_model'] ?? b['embeddingModel'] ?? null,
      retrieval_version: b['retrieval_version'] ?? b['retrievalVersion'] ?? null,
      // performance / count fields (populated by trace wrapper)
      hit_count: b['hit_count'] ?? null,
      response_time_ms: b['response_time_ms'] ?? b['responseTime'] ?? null,
      // include any additional provided metadata (keeps original keys)
      __raw: b,
    } as Record<string, unknown>;
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
    const dist = VECTOR_CONFIG.DISTANCE_METRIC.QDRANT;
    const hnsw = VECTOR_CONFIG.QDRANT_HNSW;
    const quant = VECTOR_CONFIG.QDRANT_QUANTIZATION;

    const collectionConfigs = Object.entries(VECTOR_CONFIG.COLLECTION_VECTORS).map(
      ([name, schema]) => {
        const dim = getCollectionDimension(name);
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
      { collection: this.collections.codebase_chunks, field: 'kind', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'point_kind', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'workspace_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'workspace_task_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'feature_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'source_ref', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'sourceRefs', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'file_path', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'status', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'agent_pickup_ready', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'centroid_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'parent_centroid_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'next_action', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'summary_hash', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'semantic_path', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'observed_at', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'som_cluster', schema: 'integer' },
      { collection: this.collections.codebase_chunks, field: 'path', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'symbol_name', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'tags', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'repo', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'error_id', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'updated_at', schema: 'integer' },
      { collection: this.collections.codebase_chunks, field: 'cluster_key', schema: 'keyword' },
      { collection: this.collections.codebase_chunks, field: 'topo_class', schema: 'keyword' },
      { collection: this.collections.feature_maps, field: 'featureId', schema: 'keyword' },
      { collection: this.collections.feature_maps, field: 'kind', schema: 'keyword' },
      { collection: this.collections.feature_maps, field: 'status', schema: 'keyword' },
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
      {
        collection: this.collections.agent_memory_observations,
        field: 'source',
        schema: 'keyword',
      },
      { collection: this.collections.agent_memory_observations, field: 'ide', schema: 'keyword' },
      {
        collection: this.collections.agent_memory_observations,
        field: 'session_id',
        schema: 'keyword',
      },
      {
        collection: this.collections.agent_memory_observations,
        field: 'observation_id',
        schema: 'keyword',
      },
      {
        collection: this.collections.agent_memory_observations,
        field: 'project_path',
        schema: 'keyword',
      },
      { collection: this.collections.agent_memory_observations, field: 'tags', schema: 'keyword' },
      {
        collection: this.collections.agent_memory_observations,
        field: 'source_refs',
        schema: 'keyword',
      },
      { collection: this.collections.document_knowledge, field: 'cardId', schema: 'keyword' },
      { collection: this.collections.document_knowledge, field: 'kind', schema: 'keyword' },
      { collection: this.collections.document_knowledge, field: 'status', schema: 'keyword' },
      {
        collection: this.collections.document_knowledge,
        field: 'featureLabels',
        schema: 'keyword',
      },
      { collection: this.collections.document_knowledge, field: 'sourceRefs', schema: 'keyword' },
      { collection: this.collections.document_knowledge, field: 'chunkIds', schema: 'keyword' },
      { collection: this.collections.document_knowledge, field: 'clusterTags', schema: 'keyword' },
      { collection: this.collections.document_knowledge, field: 'topoClass', schema: 'keyword' },
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
      this.buildTelemetryMetadata({ searchType: 'multi-query-fusion', queryCount: params.queries.length, limit: params.limit }),
      async () => {
        const startTime = Date.now();
        // Try to dedupe concurrent identical multi-query searches using a short hash key
        try {
          const rawKeyObj = {
            c: params.collection,
            q: params.queries.map((q) => ({
              vectorName: q.vectorName ?? null,
              filter: q.filter ?? null,
              limit: q.limit ?? null,
              vecLen: Array.isArray(q.vector)
                ? (q.vector as any).length
                : q.vector && typeof q.vector === 'object'
                  ? ((q.vector as any).indices?.length ?? null)
                  : null,
            })),
            fusion: params.fusion ?? null,
            limit: params.limit ?? null,
          };
          const key = createHash('sha256')
            .update(JSON.stringify(rawKeyObj))
            .digest('hex')
            .slice(0, 16);
          if (this.inflightSearches.has(key)) {
            return await this.inflightSearches.get(key)!;
          }

          const promise = (async () => {
            const collectionName =
              this.collections[params.collection as keyof typeof this.collections] ??
              params.collection;
            const prefetches = params.queries.map((q) => {
              const prefetch: any = { limit: q.limit ?? params.limit ?? 20 };
              if (q.vector) {
                if (Array.isArray(q.vector)) {
                  prefetch.query = q.vector;
                  if (q.vectorName) prefetch.using = q.vectorName;
                } else {
                  prefetch.query = { indices: q.vector.indices, values: q.vector.values };
                  prefetch.using = q.vectorName ?? 'bm25';
                }
              }
              if (q.filter) prefetch.filter = this.buildQdrantFilter(q.filter);
              return prefetch;
            });

            const searchRequest: any = {
              prefetch: prefetches,
              query: { fusion: params.fusion ?? 'rrf' },
              limit: params.limit ?? 10,
              score_threshold: params.scoreThreshold ?? 0.01,
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
          })();

          this.inflightSearches.set(key, promise);
          try {
            return await promise;
          } finally {
            this.inflightSearches.delete(key);
          }
        } catch (err) {
          console.debug(
            '[qdrant] multiQuerySearch dedupe failed, falling back:',
            err?.message ?? err
          );
        }

        // Fallback: original behavior (no dedupe)
        try {
          const collectionName =
            this.collections[params.collection as keyof typeof this.collections] ?? params.collection;
          const prefetches = params.queries.map((q) => {
            const prefetch: any = { limit: q.limit ?? params.limit ?? 20 };
            if (q.vector) {
              if (Array.isArray(q.vector)) {
                prefetch.query = q.vector;
                if (q.vectorName) prefetch.using = q.vectorName;
              } else {
                prefetch.query = { indices: q.vector.indices, values: q.vector.values };
                prefetch.using = q.vectorName ?? 'bm25';
              }
            }
            if (q.filter) prefetch.filter = this.buildQdrantFilter(q.filter);
            return prefetch;
          });

          const searchRequest: any = {
            prefetch: prefetches,
            query: { fusion: params.fusion ?? 'rrf' },
            limit: params.limit ?? 10,
            score_threshold: params.scoreThreshold ?? 0.01,
            with_payload: true,
          };

          const results = (await this.client.query(collectionName, searchRequest)) as any;

          // Validate response structure
          if (!results || !results.points || !Array.isArray(results.points)) {
            console.error('[qdrant] multiQuerySearch response missing .points array:', {
              hasResults: !!results,
              hasPoints: results?.points !== undefined,
              pointsType: typeof results?.points,
              responseKeys: results ? Object.keys(results) : null,
            });
            throw new Error(`Qdrant query returned invalid response structure: ${JSON.stringify(results)}`);
          }

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
        } catch (err) {
          console.error('[qdrant] multiQuerySearch fallback failed:', err?.message ?? err);
          throw new Error(`Qdrant multiQuerySearch failed: ${err instanceof Error ? err.message : String(err)}`);
        }
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
      // Fall back to dense-only search when BM25 not available
      // Map queryEmbedding to queryVector for DenseSearchParams
      return this._denseSearch({
        query: params.query,
        queryVector: params.queryEmbedding,
        vectorName: 'content',
        collection: params.collection,
        limit: params.limit,
        scoreThreshold: params.scoreThreshold,
        filter: params.filters,
        skipCache: params.skipCache,
      });
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
   * Single-lane sparse retrieval via the Universal Query API.
   *
   * Use this instead of multiQuerySearch when you have exactly one sparse sub-query.
   * Single-input RRF (multiQuerySearch with one prefetch) adds no fusion value — it
   * converts the existing rank to an RRF score without combining result sets, which
   * obscures the original sparse score.
   *
   * Returns [] (fail-closed) when the collection has no sparse vector field.
   */
  async querySparse(params: {
    collection: string;
    sparseVector: SparseVector;
    sparseVectorName?: string;
    filter?: any;
    limit?: number;
    scoreThreshold?: number;
  }): Promise<QdrantSearchResult> {
    const sparseVectorName = params.sparseVectorName ?? 'bm25';
    const sparseAvailable = await this.getSparseSupport(params.collection, sparseVectorName).catch(() => false);
    if (!sparseAvailable) {
      this.noteDenseOnly(params.collection, sparseVectorName, 'no-sparse-index');
      return [];
    }

    return traceVectorSearch(
      params.collection,
      this.buildTelemetryMetadata({ searchType: 'sparse-query', limit: params.limit }),
      async () => {
        const collectionName =
          this.collections[params.collection as keyof typeof this.collections] ??
          params.collection;

        const searchRequest: any = {
          query: { indices: params.sparseVector.indices, values: params.sparseVector.values },
          using: sparseVectorName,
          limit: params.limit ?? 10,
          with_payload: true,
        };
        if (params.filter) searchRequest.filter = this.buildQdrantFilter(params.filter);
        if (params.scoreThreshold != null) searchRequest.score_threshold = params.scoreThreshold;

        const results = (await this.client.query(collectionName, searchRequest)) as any;
        return Array.isArray(results)
          ? results
          : Array.isArray(results?.points)
            ? results.points
            : [];
      }
    );
  }

  /**
   * Dense-only cosine search. Used as automatic fallback by sparseHybridSearch
   * when a collection has no sparse (BM42) vectors configured.
   * Callers that explicitly want dense-only can call this directly.
   */
  async _denseSearch(params: DenseSearchParams): Promise<QdrantSearchResult> {
    // CRITICAL: vectorName parameter is now mandatory and defines the vector space
    const { vectorName, queryVector } = params;

    return traceVectorSearch(
      params.collection ?? 'codebase_chunks_768',
      this.buildTelemetryMetadata({
        searchType: `dense-${vectorName}`,
        query: params.query,
        limit: params.limit,
        vectorSpace: vectorName,
      }),
      async () => {
        // Validate dimension BEFORE any network calls
        // (NOTE: Phase 8.6 legacy callers may still use 768-dim; will migrate to vector-contracts in Phase 9)
        try {
          assertVectorDimension(vectorName, queryVector);
        } catch (validationErr) {
          // For now, warn but allow legacy 768-dim vectors to pass through
          if (queryVector.length === 768) {
            console.warn(
              `[qdrant] dimension mismatch: expected ${vectorName} but got 768-dim vector. ` +
              `This is a Phase 8.6 legacy call. Will be migrated in Phase 9.`
            );
          } else {
            throw validationErr;
          }
        }

        const startTime = Date.now();
        const cacheKey = params.skipCache ? null : await this.buildSearchCacheKey(params);

        // Dedupe concurrent identical dense searches (per-process)
        try {
          const raw = JSON.stringify({
            q: params.query,
            c: params.collection,
            v: vectorName,
            f: params.filter ?? null,
            l: params.limit ?? null,
            s: params.scoreThreshold ?? null,
          });
          const key = createHash('sha256').update(raw).digest('hex').slice(0, 16);
          if (this.inflightSearches.has(key)) {
            return await this.inflightSearches.get(key)!;
          }

          const promise = (async () => {
            if (cacheKey) {
              try {
                const { getRedis } = await import('../redis.js');
                const redis = getRedis();
                if (redis) {
                  const cached = await Promise.race([
                    redis.get(cacheKey),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
                  ]);
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
              // Resolve collection name to canonical form
              const collectionName =
                this.collections[params.collection as keyof typeof this.collections] ??
                params.collection ??
                'codebase_chunks_768';

              // Build Qdrant search request using vector-contracts
              const searchRequest = buildQdrantSearchRequest({
                query: params.query,
                queryVector,
                vectorName,
                collection: collectionName,
                limit: params.limit,
                scoreThreshold: params.scoreThreshold,
                filter: params.filter,
                skipCache: params.skipCache,
              });

              if (params.filter) {
                searchRequest.filter = this.buildQdrantFilter(params.filter);
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
                    await Promise.race([
                      redis.set(cacheKey, JSON.stringify(response), 'EX', 300),
                      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
                    ]);
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
          })();

          this.inflightSearches.set(key, promise);
          try {
            return await promise;
          } finally {
            this.inflightSearches.delete(key);
          }
        } catch (e) {
          console.debug(
            '[qdrant] denseSearch dedupe failed, continuing without dedupe:',
            e?.message ?? e
          );
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
      this.buildTelemetryMetadata({ searchType: 'section-filtered', query: params.query, sectionTypes: params.sectionTypes }),
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
    // If points don't include an id but include canonical payload fields, synthesize a deterministic id
    for (const p of params.points) {
      try {
        if ((p.id === undefined || p.id === null) && p.payload && typeof p.payload === 'object') {
          const ws = p.payload.workspace_id ?? p.payload.workspaceId ?? p.payload.workspace ?? null;
          const src = p.payload.source_ref ?? p.payload.sourceRef ?? p.payload.source ?? null;
          const idx = p.payload.chunk_index ?? p.payload.chunkIndex ?? p.payload.index ?? null;
          const ch = p.payload.content_hash ?? p.payload.contentHash ?? p.payload.hash ?? null;
          if (ws && src && (idx !== null && idx !== undefined) && ch) {
            p.id = deterministicChunkId(String(ws), String(src), String(idx), String(ch));
          }
        }
      } catch (e) {
        /* non-fatal id synth failure — continue */
      }
    }

    // Validate all vectors before performing any network upsert to avoid partial writes
    const invalids: Array<{ id: string | number; vectorName?: string; found?: string | number }> =
      [];
    for (const p of params.points) {
      const v = p.vector;
      if (Array.isArray(v)) {
        if (v.length !== VECTOR_CONFIG.DIMENSIONS) {
          invalids.push({ id: p.id, found: v.length });
        }
      } else if (v && typeof v === 'object') {
        // Named multi-vector or mapping
        for (const [name, val] of Object.entries(v)) {
          if (Array.isArray(val)) {
            if (val.length !== VECTOR_CONFIG.DIMENSIONS) {
              invalids.push({ id: p.id, vectorName: name, found: (val as any).length });
            }
          }
          // sparse vectors may be objects with indices/values — skip sparse validation here
        }
      } else {
        // no vector present — skip
      }
    }

    if (invalids.length > 0) {
      try {
        await fs.mkdir('.tmp', { recursive: true });
        await fs.writeFile(
          '.tmp/qdrant-upsert-dim-report.json',
          JSON.stringify(
            {
              error: 'invalid_vector_dimensions',
              details: invalids,
              expected: VECTOR_CONFIG.DIMENSIONS,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );
      } catch (e) {
        console.error('Failed to write qdrant upsert dim report:', e);
      }
      throw new Error(
        `Aborting Qdrant upsert: found ${invalids.length} points with invalid vector dimensions (expected ${VECTOR_CONFIG.DIMENSIONS}). See .tmp/qdrant-upsert-dim-report.json`
      );
    }

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

  /**
   * Scroll wrapper for Qdrant /points/scroll endpoint.
   * Centralizes scroll usage so we can add tracing, dedupe, and consistent headers.
   */
  async scroll(params: {
    collection: keyof typeof this.collections | string;
    limit?: number;
    offset?: any;
    filter?: any;
    withPayload?: boolean | string[] | any;
    withVector?: boolean | string[] | any;
    with_payload?: boolean;
    with_vector?: boolean;
    order?: any;
  }): Promise<{
    points: any[];
    nextPageOffset: any;
    next_page_offset: any;
    metadata: { collection: string; responseTime: number };
  }> {
    const rawCollection = params.collection;
    const collectionName = String(
      (this.collections as any)[rawCollection as any] ?? rawCollection
    );

    return traceVectorSearch(
      collectionName,
      this.buildTelemetryMetadata({ searchType: 'scroll', query: 'scroll', collection: collectionName }),
      async () => {
        const startTime = Date.now();
        try {
          const scrollRequest: any = {
            limit: params.limit ?? 100,
            with_payload: params.withPayload ?? params.with_payload ?? true,
            with_vector: params.withVector ?? params.with_vector ?? false,
          };
          if (params.offset !== undefined && params.offset !== null) {
            scrollRequest.offset = params.offset;
          }
          if (params.filter) {
            scrollRequest.filter = this.buildQdrantFilter(params.filter);
          }
          if (params.order) {
            scrollRequest.order = params.order;
          }

          const result = await this.client.scroll(collectionName, scrollRequest);
          const points = (result.points ?? []).map((p: any) => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
          }));
          const nextPageOffset = result.next_page_offset ?? null;

          return {
            points,
            nextPageOffset,
            next_page_offset: nextPageOffset,
            metadata: {
              collection: collectionName,
              responseTime: Date.now() - startTime,
            },
          };
        } catch (error: any) {
          console.error(`[qdrant] scroll failed for ${collectionName}:`, error);
          return {
            points: [],
            nextPageOffset: null,
            next_page_offset: null,
            metadata: {
              collection: collectionName,
              responseTime: Date.now() - startTime,
            },
          };
        }
      }
    );
  }


  /**
   * Canonical upsert wrapper — validates vectors, delegates to batchUpsert when
   * the payload exceeds batchSize, and performs cache invalidation.
   */
  async upsert(params: {
    collection: keyof typeof this.collections | string;
    points: any[];
    wait?: boolean;
    batchSize?: number;
  }) {
    const batchSize = params.batchSize ?? 100;

    // Resolve collection name (value) and attempt to preserve the original key
    const resolvedCollectionName =
      (this.collections as any)[params.collection as any] ?? params.collection;

    // If caller passed a key (exists in collections), prefer that key when delegating
    const collectionKey =
      Object.keys(this.collections).find(
        (k) => (this.collections as any)[k] === params.collection
      ) ||
      (Object.keys(this.collections).includes(params.collection as string)
        ? params.collection
        : null);

    if (!Array.isArray(params.points) || params.points.length === 0) {
      return { upserted: 0 };
    }

    // Delegate to batchUpsert when large
    if (params.points.length > batchSize) {
      try {
        return await this.batchUpsert({
          collection: (collectionKey as any) ?? (params.collection as any),
          points: params.points,
          batchSize,
        } as any);
      } catch (e) {
        throw e;
      }
    }

    // Validate vector dimensions (same rules as batchUpsert)
    const invalids: Array<{ id: string | number; vectorName?: string; found?: string | number }> =
      [];
    for (const p of params.points) {
      const v = p.vector;
      if (Array.isArray(v)) {
        if (v.length !== VECTOR_CONFIG.DIMENSIONS) invalids.push({ id: p.id, found: v.length });
      } else if (v && typeof v === 'object') {
        for (const [name, val] of Object.entries(v)) {
          if (Array.isArray(val) && (val as any).length !== VECTOR_CONFIG.DIMENSIONS) {
            invalids.push({ id: p.id, vectorName: name, found: (val as any).length });
          }
        }
      }
    }

    if (invalids.length > 0) {
      try {
        await fs.mkdir('.tmp', { recursive: true });
        await fs.writeFile(
          '.tmp/qdrant-upsert-dim-report.json',
          JSON.stringify(
            {
              error: 'invalid_vector_dimensions',
              details: invalids,
              expected: VECTOR_CONFIG.DIMENSIONS,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );
      } catch (e) {
        console.error('Failed to write qdrant upsert dim report (upsert):', e);
      }
      throw new Error(
        `Aborting Qdrant upsert: found ${invalids.length} points with invalid vector dimensions (expected ${VECTOR_CONFIG.DIMENSIONS}). See .tmp/qdrant-upsert-dim-report.json`
      );
    }

    // Perform the upsert
    try {
      await this.client.upsert(resolvedCollectionName as string, {
        wait: params.wait ?? false,
        points: params.points,
      });

      // Invalidate cached searches for this collection after upsert
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
        /* invalidation failure — non-fatal */
      }

      return { upserted: params.points.length };
    } catch (error: any) {
      console.error('[qdrant] upsert failed:', error);
      throw error;
    }
  }

  async storeDocument(document: {
    id: string;
    title: string;
    content: string;
    contentEmbedding: number[];
    summaryEmbedding?: number[];
    metadata: Record<string, unknown>;
  }) {
    // Validate embedding dimensions
    const invalids: Array<{ id: string; field: string; found: number }> = [];
    if (
      !Array.isArray(document.contentEmbedding) ||
      document.contentEmbedding.length !== VECTOR_CONFIG.DIMENSIONS
    ) {
      invalids.push({
        id: document.id,
        field: 'contentEmbedding',
        found: Array.isArray(document.contentEmbedding) ? document.contentEmbedding.length : 0,
      });
    }
    if (
      document.summaryEmbedding &&
      (!Array.isArray(document.summaryEmbedding) ||
        document.summaryEmbedding.length !== VECTOR_CONFIG.DIMENSIONS)
    ) {
      invalids.push({
        id: document.id,
        field: 'summaryEmbedding',
        found: Array.isArray(document.summaryEmbedding) ? document.summaryEmbedding.length : 0,
      });
    }

    if (invalids.length > 0) {
      try {
        await fs.mkdir('.tmp', { recursive: true });
        await fs.writeFile(
          '.tmp/qdrant-upsert-dim-report.json',
          JSON.stringify(
            {
              error: 'invalid_document_embedding_dimensions',
              details: invalids,
              expected: VECTOR_CONFIG.DIMENSIONS,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );
      } catch (e) {
        console.error('Failed to write qdrant upsert dim report:', e);
      }
      throw new Error(
        `Aborting Qdrant document upsert: invalid embedding dimensions for document ${document.id}. See .tmp/qdrant-upsert-dim-report.json`
      );
    }

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(document.id);
    const pointId = isValidUuid ? document.id : sha256ToUuid(document.id);

    const point: any = {
      id: pointId,
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
    // Validate embedding dimension before upsert
    if (!Array.isArray(embedding) || embedding.length !== VECTOR_CONFIG.DIMENSIONS) {
      try {
        await fs.mkdir('.tmp', { recursive: true });
        await fs.writeFile(
          '.tmp/qdrant-upsert-dim-report.json',
          JSON.stringify(
            {
              error: 'invalid_cache_embedding_dimension',
              key,
              found: Array.isArray(embedding) ? embedding.length : typeof embedding,
              expected: VECTOR_CONFIG.DIMENSIONS,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );
      } catch (e) {
        console.error('Failed to write qdrant upsert dim report:', e);
      }
      throw new Error(
        `Aborting Qdrant cacheEmbedding upsert: embedding for key ${key} must be ${VECTOR_CONFIG.DIMENSIONS} dimensions`
      );
    }

    try {
      await this.client.upsert(this.collections.embeddings_cache, { wait: false, points: [point] });
    } catch (e) {
      console.warn('[qdrant] cacheEmbedding upsert failed:', e);
    }
  }

  async getCachedEmbedding(key: string) {
    // Use scroll + payload filter — cache_key is an indexed identity field.
    // A zero-vector search was previously used here, but cosine similarity
    // against a zero vector is semantically undefined and wastes HNSW traversal.
    try {
      const result = await this.client.scroll(this.collections.embeddings_cache, {
        filter: {
          must: [
            { key: 'cache_key', match: { value: key } },
            { key: 'expires_at', range: { gt: Date.now() } },
          ],
        },
        limit: 1,
        with_payload: true,
        with_vector: false,
      });
      const points = result?.points ?? [];
      return points.length > 0 ? points[0] : null;
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
        points_count: info.points_count ?? 0,
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
    const searchPromises = collections.map((col) =>
      this.hybridSearch({
        query: params.query,
        queryEmbedding: params.queryEmbedding,
        collection: col,
        limit: limit * 2, // Over-sample for better fusion
      }).catch((err) => {
        console.error(`HyperSearch failed for ${col}:`, err);
        return { results: [], metadata: {} } as any;
      })
    );

    const allResults = await Promise.all(searchPromises);

    // RRF Fusion Logic: score = sum(1 / (60 + rank))
    const fusedResultsMap = new Map<
      string,
      { id: string | number; score: number; payload: any; collection: string }
    >();
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
            collection: collectionName,
          });
        }
      });
    });

    const fusedResults = Array.from(fusedResultsMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      results: fusedResults.map((r) => ({ id: r.id, score: r.score, payload: r.payload })),
      metadata: {
        query: params.query,
        collection: 'hyper-collection',
        responseTime: Date.now() - startTime,
        total_results: fusedResults.length,
        cached: false,
        searchType: 'hyper-rrf-fusion',
      },
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
        with_payload: false,
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
    const updateBatches = this.chunkArray(
      ids.map((id, i) => ({
        id,
        payload: { cluster_id: assignments[i] },
      })),
      batchSize
    );

    for (const batch of updateBatches) {
      await this.client.setPayload(collection, {
        payload: { cluster_id: 0 }, // placeholder to define key if missing
        points: batch.map((p) => p.id),
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
          points,
        });
      }
    }

    return {
      status: 'success',
      count: n,
      clusters: k,
      durationMs: Date.now() - startTime,
      source,
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

let _qdrantSingleton: QdrantManager | null = null;

export function getQdrantManager(): QdrantManager {
  if (!_qdrantSingleton) {
    _qdrantSingleton = new QdrantManager();
  }
  return _qdrantSingleton;
}

export const qdrant = new Proxy({} as QdrantManager, {
  get(_target, prop) {
    return (getQdrantManager() as any)[prop];
  }
}) as QdrantManager;





