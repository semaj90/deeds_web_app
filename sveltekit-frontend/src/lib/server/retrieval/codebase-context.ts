/**
 * Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant tri-vector).
 *
 * Provides a single-call `loadCodebaseContext(query)` that returns a formatted
 * context string suitable for injection into LLM system prompts.
 *
 * Used by:
 * - /api/sse/chat — injects codebase context alongside legal RAG context
 * - /api/codebase/recall — exposes Stage A as an API
 * - /api/codebase/rerank — exposes Stage B as an API
 *
 * Step 1 fix: collection changed from 'codebase_chunks' -> 'codebase_chunks_768'
 * Step 2 fix: RankedChunk carries neo4j graph enrichment fields (gpuCluster,
 *             pageRankScore, routeType, hasAuthGuard) with Colab-preferred fallback.
 *             PageRank priority: Colab bare key > CouchDB power-iteration > local LibTorch.
 * Step 3 opt: Optional third lane — `error` named vector searched via searchByError().
 *             Activated when RerankOptions.errorQuery is set; additive boost (weight 0.15).
 *             Chunks that appear in error-vector results are promoted in the final ranking.
 */
import Fuse from 'fuse.js';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { pool } from '$lib/server/db/client';
import { searchByError } from '$lib/server/indexer/dual-embedder.js';
import { rerankWithGemma4 } from './cross-encoder-reranker.js';
import { logRagHitWithTopology } from '$lib/server/indexer/ast-ingest-logger.js';
import {
  getCachedEmbedding,
  getCachedSearchResults,
  setCachedEmbedding,
  setCachedSearchResults,
} from '$lib/server/knowledge-cache.js';

// -- Collection name -----------------------------------------------------------

const QDRANT_COLLECTION = 'codebase_chunks_768';

// -- Types --------------------------------------------------------------------

export interface ChunkMetadata {
  path: string;
  relativePath: string;
  symbol: string;
  kind: string;
  httpMethod?: string;
  routeId?: string;
  tags: string[];
  signature: string;
  lineStart: number;
  lineEnd: number;
  qdrantId?: string | number;
}

export type RetrievalCaller =
  | 'fix-recommender'
  | 'ace-wiki'
  | 'sse-chat'
  | 'tool-loop'
  | 'deep-research'
  | string;

export interface RankedChunk {
  path: string;
  relativePath: string;
  symbol: string;
  kind: string;
  content: string;
  signature: string;
  httpMethod?: string;
  routeId?: string;
  tags: string[];
  score: number;
  lineStart: number;
  lineEnd: number;
  qdrantId?: string | number;
  // neo4j enriched fields
  gpuCluster?: number | null;
  pageRankScore?: number | null;
  routeType?: string | null;
  hasAuthGuard?: boolean | null;
  somCluster?: number | null;
  somBmuRow?: number | null;
  somBmuCol?: number | null;
  authorityScore?: number;
  language?: string | null;
}

// -- Module-level Fuse.js metadata cache -------------------------------------

let metadataCache: ChunkMetadata[] = [];
let fuseIndex: Fuse<ChunkMetadata> | null = null;
let lastRefresh = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000;

export async function refreshMetadataCache(): Promise<void> {
  const now = Date.now();
  if (fuseIndex && now - lastRefresh < REFRESH_INTERVAL) return;

  try {
    const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10000, with_payload: true, with_vector: false }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn('[codebase-context] Qdrant scroll failed, using stale cache');
      return;
    }

    const data = await res.json();
    const points = data.result?.points ?? [];

    metadataCache = points.map((p: { payload: Record<string, unknown> }) => ({
      path: p.payload.path as string,
      relativePath: p.payload.relativePath as string,
      symbol: p.payload.symbol as string,
      kind: p.payload.kind as string,
      httpMethod: p.payload.httpMethod as string | undefined,
      routeId: p.payload.routeId as string | undefined,
      tags: (p.payload.tags as string[]) ?? [],
      signature: (p.payload.signature as string) ?? '',
      lineStart: p.payload.lineStart as number,
      lineEnd: p.payload.lineEnd as number,
    }));

    fuseIndex = new Fuse(metadataCache, {
      keys: [
        { name: 'symbol', weight: 0.35 },
        { name: 'signature', weight: 0.25 },
        { name: 'relativePath', weight: 0.2 },
        { name: 'tags', weight: 0.1 },
        { name: 'routeId', weight: 0.1 },
      ],
      threshold: 0.45,
      includeScore: true,
      minMatchCharLength: 2,
    });

    lastRefresh = now;
  } catch (err) {
    console.error('[codebase-context] Failed to refresh metadata cache:', err);
  }
}

// -- Stage A: Fuse.js fuzzy recall -------------------------------------------

export interface RecallResult {
  candidates: Array<ChunkMetadata & { fuseScore: number }>;
  total: number;
  recallMs: number;
}

export async function recallChunks(query: string, limit = 100): Promise<RecallResult> {
  await refreshMetadataCache();

  if (!fuseIndex || metadataCache.length === 0) {
    return { candidates: [], total: 0, recallMs: 0 };
  }

  const start = performance.now();
  const results = fuseIndex.search(query, { limit: Math.min(limit, 200) });

  const candidates = results.map((r) => ({
    ...r.item,
    fuseScore: 1 - (r.score ?? 1),
  }));

  return {
    candidates,
    total: metadataCache.length,
    recallMs: Math.round(performance.now() - start),
  };
}

/**
 * Filtered search within a specific GPU cluster.
 * Used for deep architectural exploration in a specific domain.
 */
export async function searchByCluster(
  query: string,
  clusterId: number,
  limit = 5
): Promise<RankedChunk[]> {
  const res = await rerankChunks(query, {
    limit,
    caller: 'search-by-cluster',
    filter: {
      should: [
        { key: 'neo4j_gpuCluster', match: { value: clusterId } },
        { key: 'som_cluster', match: { value: clusterId } },
      ],
    },
  });
  return res.results;
}

/**
 * Post-processor to boost chunks belonging to the same cluster as the top hit.
 * Ensures domain coherence in the final context.
 */
export function boostBySameCluster(chunks: RankedChunk[], boostFactor = 1.1): RankedChunk[] {
  if (chunks.length < 2) return chunks;
  const topCluster = chunks[0].gpuCluster;
  if (topCluster == null) return chunks;

  return chunks
    .map((c, i) => {
      if (i > 0 && c.gpuCluster === topCluster) {
        return { ...c, score: Math.min(1.0, c.score * boostFactor) };
      }
      return c;
    })
    .sort((a, b) => b.score - a.score);
}

export function getMetadataCacheSize(): number {
  return metadataCache.length;
}

// -- Stage B: Qdrant dual-vector semantic rerank ------------------------------

const DEFAULT_PATH_BOOSTS: Record<string, number> = {
  '+server.ts': 1.3,
  '+page.server.ts': 1.2,
  'schema-postgres.ts': 1.2,
  'tests/': 1.1,
  'lib/server/': 1.15,
};

function isValidEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 768;
}

async function embedQuery(text: string): Promise<number[]> {
  const prompt = text.trim() || text;
  const cached = await getCachedEmbedding(prompt, SERVER_EMBEDDING_MODEL).catch(() => null);
  if (isValidEmbedding(cached)) {
    return cached;
  }

  const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt, keep_alive: '24h' }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const data = await res.json();
  if (!isValidEmbedding(data.embedding)) {
    throw new Error('Embedding response returned an invalid vector');
  }
  setCachedEmbedding(prompt, SERVER_EMBEDDING_MODEL, data.embedding).catch(() => {});
  return data.embedding;
}

async function searchQdrant(
  query: string,
  vectorName: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
): Promise<Array<{ id: number | string; score: number; payload: Record<string, unknown> }>> {
  const cacheCollection = `${QDRANT_COLLECTION}:${vectorName}:limit:${limit}`;
  const cached = await getCachedSearchResults(cacheCollection, query, filter).catch(() => null);
  if (Array.isArray(cached)) {
    return cached as Array<{
      id: number | string;
      score: number;
      payload: Record<string, unknown>;
    }>;
  }

  const body: Record<string, unknown> = {
    vector: { name: vectorName, vector },
    limit,
    with_payload: true,
  };
  if (filter) body.filter = filter;

  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const results = data.result ?? [];
  setCachedSearchResults(cacheCollection, query, results, filter).catch(() => {});
  return results;
}

function numPayload(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && isFinite(v) ? v : null;
}

export interface RerankOptions {
  candidatePaths?: string[];
  limit?: number;
  contentWeight?: number;
  signatureWeight?: number;
  /** Additive error-vector boost weight (default 0.15). Only active when errorQuery set. */
  errorWeight?: number;
  pathBoosts?: Record<string, number>;
  /**
   * When provided, also searches the `error` named vector via searchByError().
   * Results are additively merged into the main score map with errorWeight.
   * Chunks semantically close to the error description are promoted.
   */
  errorQuery?: string;
  /** Optional Qdrant filter to restrict the search space (e.g. for cluster-scoped queries). */
  filter?: Record<string, unknown>;
  /** Caller label — propagated into ingest-log rag_hit events for tracing. */
  caller?: RetrievalCaller;
  includeClusterSummary?: boolean;
  includeTopologyContext?: boolean;
}

export interface RerankResult {
  results: RankedChunk[];
  queryVector: number[];
  timing: { embedMs: number; searchMs: number; totalMs: number };
  meta: {
    contentResults: number;
    signatureResults: number;
    errorResults: number;
    merged: number;
    returned: number;
  };
  clusterSummary?: {
    gpuClusters: number[];
    somClusters: number[];
    semanticTags: string[];
    relativePaths: string[];
  };
  topologyContext?: {
    graphRegions: string[];
    hyperEdges: string[];
  };
}

export async function rerankChunks(
  query: string,
  options: RerankOptions = {}
): Promise<RerankResult> {
  const limit = Math.min(options.limit ?? 10, 50);
  const contentWeight = options.contentWeight ?? 0.6;
  const signatureWeight = options.signatureWeight ?? 0.4;
  const errorWeight = options.errorWeight ?? 0.15;
  const pathBoosts = options.pathBoosts ?? DEFAULT_PATH_BOOSTS;

  const start = performance.now();

  let filter: Record<string, unknown> | undefined;
  if (options.candidatePaths && options.candidatePaths.length > 0) {
    filter = {
      should: options.candidatePaths.slice(0, 200).map((p) => ({
        key: 'path',
        match: { value: p },
      })),
    };
  } else if (options.filter) {
    filter = options.filter;
  }

  const queryVector = await embedQuery(query);
  const embedMs = performance.now() - start;

  const searchStart = performance.now();

  // Three-way parallel search: content + signature (always) + error (when errorQuery provided).
  // Error search uses its own embedding (the error text, not the code query) — this is
  // intentional: error-vector space represents "what errors does this chunk relate to",
  // so searching with error text finds semantically related error-prone code.
  const [contentResults, signatureResults, errorResults] = await Promise.all([
    searchQdrant(query, 'content', queryVector, limit * 3, filter),
    searchQdrant(query, 'signature', queryVector, limit * 3, filter),
    options.errorQuery
      ? searchByError(options.errorQuery, limit * 2, filter)
      : Promise.resolve(
          [] as Array<{ id: number | string; score: number; payload: Record<string, unknown> }>
        ),
  ]);
  const searchMs = performance.now() - searchStart;

  const scoreMap = new Map<string, { payload: Record<string, unknown>; score: number; id: string | number }>();

  for (const r of contentResults) {
    const key = String(r.id);
    scoreMap.set(key, { payload: r.payload, score: r.score * contentWeight, id: r.id });
  }

  for (const r of signatureResults) {
    const key = String(r.id);
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += r.score * signatureWeight;
    } else {
      scoreMap.set(key, { payload: r.payload, score: r.score * signatureWeight, id: r.id });
    }
  }

  // Additive error boost — promotes chunks already in the score map that also match
  // the error description. Chunks only in errorResults (not in content/signature) are
  // added with errorWeight score so they can still surface if highly relevant.
  for (const r of errorResults) {
    const key = String(r.id);
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += r.score * errorWeight;
    } else {
      scoreMap.set(key, { payload: r.payload, score: r.score * errorWeight, id: r.id });
    }
  }

  const merged = [...scoreMap.values()];
  for (const r of merged) {
    const path = (r.payload.relativePath as string) ?? '';
    for (const [pattern, multiplier] of Object.entries(pathBoosts)) {
      if (path.includes(pattern)) {
        r.score *= multiplier;
      }
    }
  }

  merged.sort((a, b) => b.score - a.score);
  const topResults = merged.slice(0, limit);

  const totalMs = performance.now() - start;

  const results: RankedChunk[] = topResults.map((r) => {
    const p = r.payload;
    const pageRankScore =
      numPayload(p, 'pagerank_score') ??
      numPayload(p, 'pagerank_score_couchdb') ??
      numPayload(p, 'neo4j_pageRankScore') ??
      null;
    const gpuCluster = numPayload(p, 'som_cluster') ?? numPayload(p, 'neo4j_gpuCluster') ?? null;

    return {
      path: p.path as string,
      relativePath: p.relativePath as string,
      symbol: p.symbol as string,
      kind: p.kind as string,
      content: p.content as string,
      signature: p.signature as string,
      httpMethod: p.httpMethod as string | undefined,
      routeId: p.routeId as string | undefined,
      tags: (p.tags as string[]) ?? [],
      score: Math.round(r.score * 1000) / 1000,
      lineStart: p.lineStart as number,
      lineEnd: p.lineEnd as number,
      qdrantId: String(r.id),
      gpuCluster,
      pageRankScore,
      routeType: (p.routeType as string | null) ?? null,
      hasAuthGuard: (p.hasAuthGuard as boolean | null) ?? null,
      somBmuRow: numPayload(p, 'som_bmu_row'),
      somBmuCol: numPayload(p, 'som_bmu_col'),
      language: (p.language as string | null) ?? null,
    };
  });

  // ── populate summaries ──
  let clusterSummary: RerankResult['clusterSummary'] | undefined;
  if (options.includeClusterSummary) {
    clusterSummary = {
      gpuClusters: [...new Set(results.map(r => r.gpuCluster).filter((c): c is number => c != null))],
      somClusters: [...new Set(results.map(r => r.somCluster).filter((c): c is number => c != null))],
      semanticTags: [...new Set(results.flatMap(r => r.tags))],
      relativePaths: [...new Set(results.map(r => r.relativePath))],
    };
  }

  let topologyContext: RerankResult['topologyContext'] | undefined;
  if (options.includeTopologyContext) {
    // Stub for future graph region detection
    topologyContext = {
      graphRegions: [],
      hyperEdges: [],
    };
  }

  // ── ingest logger ──────────────────────────────────────────────────────────
  try {
    const vectorLanes: ('content' | 'signature' | 'error')[] = ['content', 'signature'];
    if (options.errorQuery) vectorLanes.push('error');
    logRagHitWithTopology({
      query,
      topHits: results.slice(0, 3).map((r) => ({
        relativePath: r.relativePath,
        symbol: r.symbol,
        score: r.score,
        gpuCluster: r.gpuCluster ?? null,
        kind: r.kind,
        qdrantId: r.qdrantId,
        somCluster: r.somCluster ?? null,
      })),
      returned: results.length,
      vectorLanes,
      embedMs: Math.round(embedMs),
      searchMs: Math.round(searchMs),
      totalMs: Math.round(totalMs),
      caller: options.caller,
      gpuClusters: clusterSummary?.gpuClusters ?? [],
      somClusters: clusterSummary?.somClusters ?? [],
      semanticTags: clusterSummary?.semanticTags ?? [],
      relativePaths: results.map(r => r.relativePath),
      qdrantIds: results.map(r => String(r.qdrantId)),
    });
  } catch {
    // logging is non-fatal
  }

  return {
    results,
    queryVector,
    timing: {
      embedMs: Math.round(embedMs),
      searchMs: Math.round(searchMs),
      totalMs: Math.round(totalMs),
    },
    meta: {
      contentResults: contentResults.length,
      signatureResults: signatureResults.length,
      errorResults: errorResults.length,
      merged: scoreMap.size,
      returned: results.length,
    },
    clusterSummary,
    topologyContext,
  };
}

// -- Combined: recall -> rerank -> format context string ---------------------

const CODEBASE_CONTEXT_MAX_CHARS = 2000;
const MIN_RECALL_SCORE = 0.3;

export async function loadCodebaseContext(query: string): Promise<{
  context: string;
  chunks: RankedChunk[];
  timing: { recallMs: number; rerankMs: number };
} | null> {
  try {
    const recall = await recallChunks(query, 50);
    const goodCandidates = recall.candidates.filter((c) => c.fuseScore >= MIN_RECALL_SCORE);

    if (goodCandidates.length === 0) return null;

    const candidatePaths = goodCandidates.map((c) => c.path);
    const multiVectorResult = await rerankChunks(query, {
      candidatePaths,
      limit: 12,
      caller: 'codebase-context-multi-vector',
    });

    if (multiVectorResult.results.length === 0) return null;

    // -- Stage C: Gemma4 Cross-Encoder Rerank --------------------------------
    // Map RankedChunk -> RerankCandidate
    const rerankPool = multiVectorResult.results.map((c) => ({
      documentId: `${c.relativePath}:${c.lineStart}`,
      content: c.content,
      retrievalScore: c.score,
      chunk: c, // Pass original chunk through
    }));

    const gemmasResult = await rerankWithGemma4(query, rerankPool, {
      returnTopK: 5,
      noFallback: true, // Internal codebase search doesn't fallback to web here
    });

    const finalChunks = gemmasResult.results.map((r) => r.doc.chunk);

    let context = `## Codebase Context (${finalChunks.length} high-precision chunks)\n`;
    for (const chunk of finalChunks) {
      const header = chunk.httpMethod
        ? `${chunk.httpMethod} ${chunk.routeId ?? chunk.relativePath}`
        : `${chunk.kind}: ${chunk.symbol}`;
      const loc = `${chunk.relativePath}:${chunk.lineStart}-${chunk.lineEnd}`;

      const meta = [
        chunk.routeType ? `type:${chunk.routeType}` : '',
        chunk.gpuCluster != null ? `cluster:${chunk.gpuCluster}` : '',
        chunk.pageRankScore != null ? `rank:${chunk.pageRankScore.toFixed(2)}` : '',
        chunk.hasAuthGuard ? 'auth-guarded' : '',
      ]
        .filter(Boolean)
        .join(' ');

      context += `\n### [${header}] (${loc}, score: ${chunk.score}${meta ? `, ${meta}` : ''})\n`;

      const snippet =
        chunk.content.length > 400 ? chunk.content.slice(0, 400) + '...' : chunk.content;
      context += `\`\`\`typescript\n${snippet}\n\`\`\`\n`;
    }

    if (context.length > CODEBASE_CONTEXT_MAX_CHARS) {
      context = context.slice(0, CODEBASE_CONTEXT_MAX_CHARS) + '\n...(truncated)';
    }

    return {
      context,
      chunks: finalChunks,
      timing: {
        recallMs: recall.recallMs,
        rerankMs: 0,
      },
    };
  } catch (err) {
    console.warn('[codebase-context] Retrieval failed (non-fatal):', err);
    return null;
  }
}

// -- pgvector fallback retrieval ---------------------------------------------

export async function searchCodebasePgVector(
  queryEmbedding: number[],
  limit = 10,
  minScore = 0.5
): Promise<RankedChunk[]> {
  try {
    const result = await pool.query<{
      id: string;
      relative_path: string;
      content: string | null;
      symbol: string | null;
      kind: string | null;
      gpu_cluster: number | null;
      som_cluster: number | null;
      page_rank_score: number | null;
      line_start: number | null;
      line_end: number | null;
      neo4j_meta: { routeType?: string; hasAuthGuard?: boolean } | null;
      cosine_score: number;
    }>(
      `SELECT id, relative_path, content, symbol, kind,
			        gpu_cluster, som_cluster, page_rank_score,
			        line_start, line_end, neo4j_meta,
			        1 - (content_embedding <=> $1::halfvec) AS cosine_score
			 FROM   codebase_chunk_index
			 WHERE  content_embedding IS NOT NULL
			   AND  1 - (content_embedding <=> $1::halfvec) > $2
			 ORDER  BY cosine_score DESC
			 LIMIT  $3`,
      [JSON.stringify(queryEmbedding), minScore, limit]
    );

    return result.rows.map((r) => ({
      path: r.id,
      relativePath: r.relative_path,
      symbol: r.symbol ?? '',
      kind: r.kind ?? 'chunk',
      content: r.content ?? '',
      signature: '',
      tags: [],
      score: r.cosine_score,
      lineStart: r.line_start ?? 0,
      lineEnd: r.line_end ?? 0,
      gpuCluster: r.som_cluster ?? r.gpu_cluster ?? null,
      pageRankScore: r.page_rank_score ?? null,
      routeType: r.neo4j_meta?.routeType ?? null,
      hasAuthGuard: r.neo4j_meta?.hasAuthGuard ?? null,
    }));
  } catch (err) {
    console.warn('[codebase-context] pgvector fallback failed:', err);
    return [];
  }
}

// -- Cluster-aware retrieval -------------------------------------------------

export async function searchCodebaseByCluster(
  clusterId: number,
  limit = 20
): Promise<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>> {
  try {
    const pgResult = await pool.query<{
      qdrant_id: string | null;
      relative_path: string;
      path: string | null;
      symbol: string | null;
      kind: string | null;
      content: string | null;
      tags: unknown;
      page_rank_score: number | null;
      gpu_cluster: number | null;
      som_cluster: number | null;
      cluster_summary: unknown;
    }>(
      `SELECT qdrant_id,
			        relative_path,
			        path,
			        symbol,
			        kind,
			        content,
			        tags,
			        page_rank_score,
			        gpu_cluster,
			        som_cluster,
			        cluster_summary
		   FROM codebase_chunk_index
		  WHERE gpu_cluster = $1 OR som_cluster = $1
		  ORDER BY COALESCE(page_rank_score, 0) DESC,
		           indexed_at DESC
		  LIMIT $2`,
      [clusterId, limit]
    );

    if (pgResult.rows.length > 0) {
      return pgResult.rows.map((row) => ({
        id: row.qdrant_id ?? row.relative_path,
        score: row.page_rank_score ?? 0,
        payload: {
          relativePath: row.relative_path,
          path: row.path ?? row.relative_path,
          symbol: row.symbol ?? '',
          kind: row.kind ?? 'chunk',
          content: row.content ?? '',
          tags: Array.isArray(row.tags) ? row.tags : [],
          pagerank_score: row.page_rank_score ?? null,
          gpu_cluster: row.gpu_cluster ?? null,
          som_cluster: row.som_cluster ?? null,
          cluster_summary: row.cluster_summary ?? {},
        },
      }));
    }
  } catch (err) {
    console.warn('[codebase-context] PostgreSQL cluster fallback failed:', err);
  }

  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: {
        should: [
          { key: 'som_cluster', match: { value: clusterId } },
          { key: 'neo4j_gpuCluster', match: { value: clusterId } },
        ],
      },
      limit,
      with_payload: true,
      with_vector: false,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.result?.points ?? []).map(
    (p: { id: string | number; payload: Record<string, unknown> }) => ({
      id: p.id,
      score: 0,
      payload: p.payload,
    })
  );
}

// -- Eager pre-warm on first import ------------------------------------------
refreshMetadataCache().catch(() => {
	/* Qdrant may not be ready at startup -- first search will retry */
});