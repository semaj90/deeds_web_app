/**
 * POST /api/codebase-index/gpu-pipeline
 *
 * Unified GPU codebase indexing pipeline that chains:
 *   1. Qdrant codebase_chunks_768 scroll (GPU-tagged Karpathy knowledge base)
 *   2. ACE error analysis (error clusters + LLM fix generation)
 *   3. KAG graph context (evidence connections, authority scoring)
 *   4. DAG dependency ordering (citation topological sort)
 *   5. RAG chunk retrieval (vector search + cross-encoder rerank)
 *   6. RLM token-cached LLM synthesis (L1 Redis → L2 Bifrost → L3 Ollama)
 *   7. Qdrant payload enrichment (tag results back into codebase_chunks_768)
 *   8. Obsidian vault export (optional, Karpathy-style knowledge cards)
 *
 * Cache strategy:
 *   - Each stage result cached independently (cache-keys.ts TTLs)
 *   - LLM calls via bifrostChat → L1 Redis exact-match → L2 semantic → L3 Ollama
 *   - Pipeline hash → Redis for dedup on repeated runs
 *
 * Body: {
 *   action: 'analyze' | 'fix' | 'tag' | 'export-obsidian' | 'full-pipeline'
 *   query?: string           — semantic search query for RAG stage
 *   clusterId?: number       — target GPU cluster ID (from codebase_chunks_768 som_cluster)
 *   errorIds?: string[]      — specific error IDs to fix via ACE
 *   caseId?: string          — case ID for KAG graph context
 *   limit?: number           — max chunks to process (default 50, cap 200)
 *   exportToObsidian?: bool  — write results to Obsidian vault
 *   folder?: string          — Obsidian vault folder (default 'Codebase Intelligence')
 *   recompute?: bool         — trigger GPU recomputation: ts-morph → embed → k-means → SOM → PageRank
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { pool as pgPool } from '$lib/server/db/client';

const QDRANT_URL = ENV.QDRANT_URL;

// ── Redis retrieval memoization ───────────────────────────────────────────────
// Short-TTL cache for Qdrant scroll/search results — avoids redundant ANN
// sweeps on repeated pipeline runs within the same analysis session.
// Redis unavailability silently falls through to direct Qdrant (no error thrown).

const RETRIEVAL_TTL = {
  chunks: 300, // 5 min — GPU-clustered codebase layout changes rarely mid-session
  errors: 120, // 2 min — error list can update as fixes are applied
  rag: 600, // 10 min — same query → same embedding → same ANN result
} as const;

/** Lightweight FNV-1a cache-key hash (no crypto import, stays in L1 cache). */
function _ck(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Memoize an async Qdrant retrieval stage in Redis.
 * Cache miss: runs fn(), stores result, returns it.
 * Cache hit: returns JSON-parsed value directly.
 * Redis error: silently falls through to fn().
 */
async function cachedStage<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try {
    const redis = getRedis();
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
    const result = await fn();
    // Fire-and-forget SET — don't block the response on Redis write
    redis.setex(key, ttl, JSON.stringify(result)).catch(() => {});
    return result;
  } catch {
    // Redis unavailable or JSON error — degrade gracefully
    return fn();
  }
}

const pipelineSchema = z.object({
  action: z.enum(['analyze', 'fix', 'tag', 'export-obsidian', 'full-pipeline', 'lang-extract']),
  query: z.string().max(500).optional(),
  clusterId: z.number().int().optional(),
  errorIds: z.array(z.string()).max(20).optional(),
  caseId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  exportToObsidian: z.boolean().default(false),
  folder: z.string().max(100).default('Codebase Intelligence'),
  /** Trigger full GPU recomputation: ts-morph scan → embed → k-means → SOM → PageRank → wiki */
  recompute: z.boolean().default(false),
});

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantScroll(collection: string, limit: number, filter?: Record<string, unknown>) {
  const body: Record<string, unknown> = { limit, with_payload: true, with_vector: false };
  if (filter) body.filter = filter;
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`[qdrantScroll] Qdrant scroll failed on collection ${collection}: ${res.status} ${errorText}`);
  }
  const data = await res.json();
  return data.result?.points ?? [];
}

async function qdrantSearch(
  collection: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
) {
  const body: Record<string, unknown> = { vector, limit, with_payload: true };
  if (filter) body.filter = filter;
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`[qdrantSearch] Qdrant search failed on collection ${collection}: ${res.status} ${errorText}`);
  }
  const data = await res.json();
  return data.result ?? [];
}

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embeddings?.[0] ?? null;
  } catch (err) {
    throw new Error(`[embedQuery] Ollama embedding failed: ${(err as Error).message}`);
  }
}

// ── Pipeline stages ───────────────────────────────────────────────────────────

interface PipelineResult {
  stage: string;
  data: unknown;
  durationMs: number;
  source: string;
}

/** Stage 1: Scroll GPU-tagged codebase chunks from Qdrant (Redis-memoized 5 min) */
async function stageCodebaseChunks(limit: number, clusterId?: number): Promise<PipelineResult> {
  const t0 = performance.now();
  const cacheKey = `gp:chunks:${limit}:${clusterId ?? 'all'}`;

  const chunks = await cachedStage(cacheKey, RETRIEVAL_TTL.chunks, async () => {
    const filter =
      clusterId != null
        ? { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] }
        : undefined;
    const points = await qdrantScroll('codebase_chunks_768', limit, filter);
    return points.map((p: any) => ({
      id: p.id,
      path: p.payload?.file_path ?? p.payload?.relativePath ?? '',
      domain: p.payload?.domain ?? '',
      role: p.payload?.role ?? '',
      risk: p.payload?.risk ?? '',
      tags: Array.isArray(p.payload?.tags)
        ? p.payload.tags
        : typeof p.payload?.tags === 'string'
          ? p.payload.tags.split(',').map((t: string) => t.trim())
          : [],
      summary: p.payload?.summary ?? '',
      gpuCluster: p.payload?.neo4j_gpuCluster ?? p.payload?.som_cluster,
      pageRank: p.payload?.neo4j_pageRankScore ?? 0,
      complexity: p.payload?.neo4j_complexity ?? 0,
      kagContext: p.payload?.kag_context ?? '',
    }));
  });

  return {
    stage: 'codebase-chunks',
    data: chunks,
    durationMs: performance.now() - t0,
    source: 'qdrant',
  };
}

/** Stage 2: Fetch error clusters + cards for ACE analysis (Redis-memoized 2 min) */
async function stageErrorAnalysis(
  errorIds?: string[],
  clusterId?: number
): Promise<PipelineResult> {
  const t0 = performance.now();
  // Include errorIds in key so different error subsets get distinct cache slots
  const errorSig = errorIds?.length ? _ck(errorIds.join(',')) : 'all';
  const cacheKey = `gp:errors:${errorSig}:${clusterId ?? 'all'}`;

  const data = await cachedStage(cacheKey, RETRIEVAL_TTL.errors, async () => {
    const [clusters, cards] = await Promise.all([
      qdrantScroll('phase90_error_clusters', 25),
      qdrantScroll(
        'phase90_error_cards',
        100,
        errorIds?.length
          ? { must: [{ key: 'error_id', match: { any: errorIds } }] }
          : clusterId != null
            ? { must: [{ key: 'cluster_id', match: { value: String(clusterId) } }] }
            : undefined
      ),
    ]);
    return {
      clusters: clusters.map((c: any) => ({
        id: c.id,
        label: c.payload?.cluster_label ?? c.payload?.label ?? `Cluster ${c.id}`,
        errorCount: c.payload?.error_count ?? 0,
        description: c.payload?.description ?? '',
        affectedFiles: c.payload?.affected_files ?? [],
      })),
      cards: cards.map((c: any) => ({
        id: c.id,
        errorCode: c.payload?.error_code ?? '',
        message: c.payload?.normalized_message ?? c.payload?.raw_message ?? '',
        file: c.payload?.file_path ?? '',
        clusterId: c.payload?.cluster_id ?? '',
      })),
    };
  });

  return { stage: 'error-analysis', data, durationMs: performance.now() - t0, source: 'qdrant' };
}

/**
 * RRF (Reciprocal Rank Fusion) merge for two ranked hit lists.
 * score_rrf(d) = Σ  1 / (k + rank_i)   where k=60 (Elasticsearch default).
 *
 * Produces a single merged ranking that balances the two signals —
 * content ANN similarity and error-vector similarity — without needing
 * explicit weight tuning. Chunks appearing in both lists get a bonus.
 */
function rrfMerge(contentHits: any[], errorHits: any[], limit: number, k = 60): any[] {
  const scores = new Map<string | number, { score: number; hit: any }>();

  const addList = (hits: any[], source: string) => {
    hits.forEach((h, rank) => {
      const id = h.id;
      const prev = scores.get(id);
      const rrf = 1 / (k + rank + 1);
      if (prev) {
        prev.score += rrf;
      } else {
        scores.set(id, {
          score: rrf,
          hit: { ...h, source },
        });
      }
    });
  };

  addList(contentHits, 'content');
  addList(errorHits, 'error');

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, hit }) => ({ ...hit, rrfScore: score }));
}

/**
 * Stage 3: RAG vector search with Karpathy knowledge base fallback (Redis-memoized 10 min).
 *
 * When errorCards are provided:
 *   - Fires `searchByError()` on the error named vector in parallel with content ANN
 *   - RRF-merges both lists (k=60) — chunks similar to BOTH the query AND the error pattern
 *     rise to the top; chunks that match only one signal are still included
 *   - Cache key includes error fingerprint so error+query combos get separate slots
 */
async function stageRAGSearch(
  query: string,
  limit: number,
  errorCards: any[] = []
): Promise<PipelineResult> {
  const t0 = performance.now();

  // Cache key: hash of query + limit + top error message (error fingerprint)
  const topError = errorCards[0]?.message?.slice(0, 80) ?? '';
  const cacheKey = `gp:rag:${_ck(query + topError)}:${limit}`;

  const ragData = await cachedStage(cacheKey, RETRIEVAL_TTL.rag, async () => {
    const vector = await embedQuery(query);
    if (!vector) return { chunks: [], total: 0, source: 'embedding-failed' };

    // Fire content search + KB search + (optional) error-vector search in parallel
    const errorSearchText = topError
      ? `${errorCards[0]?.errorCode ?? 'ERR'} ${topError} ${errorCards[0]?.file ?? ''}`
      : null;

    const [codebaseHits, kbHits, errorHits] = await Promise.all([
      qdrantSearch('codebase_chunks_768', vector, Math.ceil(limit * 0.6)),
      qdrantSearch('knowledge_base', vector, Math.ceil(limit * 0.3)).catch(() => []),
      // Error-first ANN via the `error` named vector (returns [] when not populated yet)
      errorSearchText
        ? import('$lib/server/indexer/dual-embedder.js')
            .then((m) => m.searchByError(errorSearchText, Math.ceil(limit * 0.4)))
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    // Map hits to unified shape
    const mapHit = (h: any, src: string) => ({
      id: h.id,
      score: h.score,
      source: src,
      path: h.payload?.file_path ?? h.payload?.url ?? h.payload?.source ?? '',
      content: (h.payload?.content ?? '').slice(0, 400),
      tags: h.payload?.tags ?? [],
      domain: h.payload?.domain ?? '',
    });

    const contentHits = [
      ...codebaseHits.map((h: any) => mapHit(h, 'codebase')),
      ...kbHits.map((h: any) => mapHit(h, 'knowledge_base')),
    ].sort((a, b) => b.score - a.score);

    const errHits = (errorHits as any[]).map((h: any) => mapHit(h, 'error-vector'));

    // RRF merge when both lists are non-empty; otherwise fall back to pure content ranking
    const chunks =
      errHits.length > 0 ? rrfMerge(contentHits, errHits, limit) : contentHits.slice(0, limit);

    // ── RAG retrieval diagnostics ─────────────────────────────────────────
    const rrfTopSources = chunks.slice(0, 5).map((c: any) => ({
      id: c.id,
      path: c.path,
      score: c.score,
      rrfScore: c.rrfScore ?? null,
      source: c.source,
    }));

    const fusedScoreBreakdown =
      errHits.length > 0
        ? {
            contentMax: contentHits[0]?.score ?? 0,
            contentMin: contentHits[contentHits.length - 1]?.score ?? 0,
            errorMax: errHits[0]?.score ?? 0,
            errorMin: errHits[errHits.length - 1]?.score ?? 0,
            rrfK: 60,
            mergedCount: chunks.length,
          }
        : null;

    return {
      chunks,
      total: chunks.length,
      errorBoost: errHits.length > 0,
      diagnostics: {
        contentHits: codebaseHits.length,
        errorHits: errHits.length,
        kbHits: kbHits.length,
        rrfTopSources,
        fusedScoreBreakdown,
        cacheKeyFingerprint: cacheKey.slice(-16),
      },
    };
  });

  const src = (ragData as any).source === 'embedding-failed' ? 'none' : 'qdrant';
  return { stage: 'rag-search', data: ragData, durationMs: performance.now() - t0, source: src };
}

/** Stage 4: KAG graph context — evidence connections + authority scoring */
async function stageKAGContext(caseId?: string): Promise<PipelineResult> {
  const t0 = performance.now();
  if (!caseId) {
    return {
      stage: 'kag-context',
      data: { neighbors: [], message: 'no caseId' },
      durationMs: performance.now() - t0,
      source: 'skipped',
    };
  }
  try {
    const { getCaseGraphNeighborIds } = await import('$lib/server/retrieval/graph-context.js');
    const neighbors = await getCaseGraphNeighborIds(caseId);
    return {
      stage: 'kag-context',
      data: { neighbors, count: neighbors.length },
      durationMs: performance.now() - t0,
      source: 'postgresql',
    };
  } catch {
    return {
      stage: 'kag-context',
      data: { neighbors: [], degraded: true },
      durationMs: performance.now() - t0,
      source: 'error',
    };
  }
}

/** Stage 5: DAG dependency ordering — fetches legal_documents for the case from Qdrant,
 *  maps to DAGDocument[], then runs topological sort via orderByDependency. */
async function stageDAGOrder(caseId?: string): Promise<PipelineResult> {
  const t0 = performance.now();
  if (!caseId) {
    return {
      stage: 'dag-order',
      data: { order: [], message: 'no caseId' },
      durationMs: performance.now() - t0,
      source: 'skipped',
    };
  }
  try {
    const { orderByDependency } = await import('$lib/server/retrieval/document-dag.js');

    // Scroll legal_documents filtered by caseId payload field
    const hits = await qdrantScroll('legal_documents', 50, {
      must: [{ key: 'caseId', match: { value: caseId } }],
    });

    const docs = hits.map((h: any) => ({
      id: String(h.id),
      title: h.payload?.title ?? h.payload?.filename ?? String(h.id),
      score: h.payload?.relevanceScore ?? 1,
      citations: (h.payload?.citationRefs ?? h.payload?.references ?? []) as string[],
    }));

    if (!docs.length) {
      return {
        stage: 'dag-order',
        data: { order: [], docCount: 0, message: 'no documents for case' },
        durationMs: performance.now() - t0,
        source: 'qdrant-empty',
      };
    }

    const result = orderByDependency(docs);
    return {
      stage: 'dag-order',
      data: {
        order: result.ordered.map((d) => d.id),
        docCount: result.ordered.length,
        edgesDropped: result.edgesDropped,
      },
      durationMs: performance.now() - t0,
      source: 'qdrant',
    };
  } catch {
    return {
      stage: 'dag-order',
      data: { order: [], degraded: true },
      durationMs: performance.now() - t0,
      source: 'error',
    };
  }
}

// ── Prompt scaffold versioning ────────────────────────────────────────────────
// Bump ARCH_VERSION whenever the system prompt or synthesis logic changes.
// This invalidates all L1 Redis synthesis cache entries automatically so stale
// responses from previous architecture versions are never replayed.
const ARCH_VERSION = '2'; // bump when system prompt or model params change

/**
 * Stage 6: LLM synthesis via RLM token-cached path (L1→L2→L3).
 *
 * Cache key strategy — two-part composite:
 *   stableDigest  = FNV-1a( ARCH_VERSION + model + temperature + systemPrompt )
 *                   Changes only when architecture or prompt template changes.
 *                   Stable across sessions for the same codebase version.
 *   contextDigest = FNV-1a( sorted IDs of top chunks + error cards + RAG hits )
 *                   Changes when retrieved context changes (re-index, re-tag).
 *                   Same codebase state + same results → same digest.
 *
 * Result: identical retrieval context hits the L1 cache regardless of query
 * phrasing; fresh context (re-indexed codebase) always misses → correct response.
 */
async function stageLLMSynthesis(
  query: string,
  codebaseChunks: any[],
  errorCards: any[],
  ragChunks: any[]
): Promise<PipelineResult> {
  const t0 = performance.now();

  const contextParts: string[] = [];

  // Codebase context (top 10 by PageRank)
  const topChunks = codebaseChunks
    .sort((a: any, b: any) => (b.pageRank ?? 0) - (a.pageRank ?? 0))
    .slice(0, 10);
  if (topChunks.length) {
    contextParts.push(
      '## Codebase Files (by PageRank)\n' +
        topChunks
          .map(
            (c: any) =>
              `- **${c.path}** [${c.domain}] risk=${c.risk} tags=${(c.tags ?? []).join(',')}`
          )
          .join('\n')
    );
  }

  // Error context
  if (errorCards.length) {
    contextParts.push(
      '## Active Errors\n' +
        errorCards
          .slice(0, 8)
          .map((e: any) => `- [${e.errorCode}] ${e.message} (${e.file})`)
          .join('\n')
    );
  }

  // RAG hits
  if (ragChunks.length) {
    contextParts.push(
      '## RAG Retrieved Chunks\n' +
        ragChunks
          .slice(0, 5)
          .map(
            (r: any) => `- [score=${r.score?.toFixed(3)}] ${r.path}: ${r.content?.slice(0, 200)}`
          )
          .join('\n')
    );
  }

  // Stable prefix — changes only with ARCH_VERSION or model/temperature bumps
  const systemPrompt = [
    'You are an expert code analyst for a legal AI SvelteKit platform.',
    'Analyze the codebase context, errors, and retrieved knowledge below.',
    'Provide: 1) Key findings 2) Error root causes 3) Recommended fixes 4) Architecture insights.',
    'Be concise. Use bullet points. Under 800 words.',
  ].join(' ');

  const userPrompt = [`## Analysis Query: ${query}`, '', ...contextParts].join('\n');

  // ── Two-part composite cache key ──────────────────────────────────────────
  // stableDigest: hash of the parts that rarely change (prompt template + model)
  const stableDigest = _ck(`v${ARCH_VERSION}:${ENV.OLLAMA_CHAT_MODEL}:0.2:${systemPrompt}`);

  // contextDigest: hash of retrieved-item IDs — captures current codebase state
  // Using IDs (not content) keeps the hash short and content-change-sensitive
  const contextIds = [
    ...topChunks.map((c: any) => String(c.id)),
    '|e|',
    ...errorCards.slice(0, 8).map((e: any) => String(e.id ?? e.errorCode)),
    '|r|',
    ...ragChunks.slice(0, 5).map((r: any) => String(r.id)),
  ].join(':');
  const contextDigest = _ck(contextIds || query);

  const cacheKey = `gp:synth:${stableDigest}:${contextDigest}`;

  try {
    const response = await bifrostChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ENV.OLLAMA_CHAT_MODEL,
      {
        temperature: 0.2,
        maxTokens: 1000,
        cacheKey,
        entityTags: ['codebase-analysis', 'error-fix', 'architecture'],
      }
    );
    return {
      stage: 'llm-synthesis',
      data: {
        response,
        model: ENV.OLLAMA_CHAT_MODEL,
        tokenCached: true,
        cacheKey: cacheKey.slice(-16),
      },
      durationMs: performance.now() - t0,
      source: 'bifrost',
    };
  } catch (err) {
    return {
      stage: 'llm-synthesis',
      data: { response: null, error: (err as Error).message, degraded: true },
      durationMs: performance.now() - t0,
      source: 'error',
    };
  }
}

/**
 * Stage 2.5: Error vector enrichment — embed ACE error card text into the
 *  named vector slot on the matching  point.
 *
 * Enables error-first semantic search via :
 * "find all chunks semantically similar to TS2345 in +page.svelte"
 * Complementary to content/signature search which finds code by what it does.
 *
 * Fire-and-forget: each upsert is independent; one failure does not stop others.
 */
async function stageErrorVectorEnrichment(errorCards: any[]): Promise<PipelineResult> {
  const t0 = performance.now();
  if (!errorCards.length) {
    return { stage: 'error-vector', data: { upserted: 0 }, durationMs: 0, source: 'skipped' };
  }

  const { patchErrorVectorSchema, upsertErrorVector } = await import(
    '$lib/server/indexer/dual-embedder.js'
  );

  // Ensure the  vector schema exists on the collection (idempotent PATCH)
  const patched = await patchErrorVectorSchema();
  if (!patched) {
    return {
      stage: 'error-vector',
      data: { upserted: 0, degraded: true },
      durationMs: performance.now() - t0,
      source: 'schema-patch-failed',
    };
  }

  let upserted = 0;
  const scrollBase = `${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`;

  await Promise.allSettled(
    errorCards.slice(0, 20).map(async (card: any) => {
      const filePath: string = card.file ?? '';
      if (!filePath) return;

      // Find chunk IDs that match this file path
      const scrollRes = await fetch(scrollBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: { must: [{ key: 'file_path', match: { value: filePath } }] },
          limit: 3,
          with_payload: false,
          with_vector: false,
        }),
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null);

      if (!scrollRes?.ok) return;
      const scrollData = (await scrollRes.json()) as {
        result?: { points?: Array<{ id: number | string }> };
      };
      const pts = scrollData?.result?.points ?? [];

      await Promise.allSettled(
        pts.map(async (pt) => {
          const ok = await upsertErrorVector(
            pt.id,
            card.errorCode ?? 'ERR',
            card.message ?? '',
            filePath
          );
          if (ok) upserted++;
        })
      );
    })
  );

  return {
    stage: 'error-vector',
    data: { upserted, errorCards: errorCards.length },
    durationMs: performance.now() - t0,
    source: 'qdrant',
  };
}

/**
 * Stage 6.5: LangExtract — typed structured extraction on high-confidence chunks.
 *
 * 'fix' / 'lang-extract' / 'full-pipeline': extractCodeFix on top 3 error cards →
 *   returns typed CodeError objects (severity, suggestedFix, explanation).
 * Any action: extractMLMetadata on RAG hits score > 0.7 tagged 'ml-inference' →
 *   returns framework, tensorDims, CUDA kernels for the Karpathy knowledge base.
 *
 * All LLM calls via L1 Redis → L2 Bifrost → L3 Ollama (0-cost on cache hits).
 */
async function stageLangExtract(
  ragChunks: any[],
  errorCards: any[],
  action: string
): Promise<PipelineResult> {
  const t0 = performance.now();
  const { extractCodeFix, extractMLMetadata } = await import('$lib/server/ai/lang-extract.js');
  const results: { errorFixes?: unknown[]; mlMetadata?: unknown[] } = {};

  // Typed error fixes
  if (action === 'fix' || action === 'lang-extract' || action === 'full-pipeline') {
    const settled = await Promise.allSettled(
      errorCards.slice(0, 3).map(async (card: any) => {
        const fix = await extractCodeFix(card.message, card.message, card.file ?? '');
        return { id: card.id, file: card.file, fix: fix.valid ? fix.data : null };
      })
    );
    results.errorFixes = settled
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<unknown>).value);
  }

  // ML metadata on high-confidence RAG hits tagged ml-inference
  const mlChunks = ragChunks.filter(
    (c: any) => c.score > 0.7 && Array.isArray(c.tags) && c.tags.includes('ml-inference')
  );
  if (mlChunks.length > 0) {
    const settled = await Promise.allSettled(
      mlChunks.slice(0, 2).map(async (chunk: any) => {
        const ml = await extractMLMetadata(chunk.content ?? '', chunk.path ?? '');
        return { id: chunk.id, path: chunk.path, ml: ml.valid ? ml.data : null };
      })
    );
    results.mlMetadata = settled
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<unknown>).value);
  }

  return {
    stage: 'lang-extract',
    data: results,
    durationMs: performance.now() - t0,
    source: 'bifrost',
  };
}

/** Stage 7: Tag enrichment — write analysis tags back to Qdrant points */
async function stageTagEnrichment(
  chunkIds: (string | number)[],
  tags: string[]
): Promise<PipelineResult> {
  const t0 = performance.now();
  if (!chunkIds.length || !tags.length) {
    return {
      stage: 'tag-enrichment',
      data: { updated: 0 },
      durationMs: performance.now() - t0,
      source: 'skipped',
    };
  }

  const payload = {
    points: chunkIds.slice(0, 50),
    payload: {
      pipeline_tags: tags.slice(0, 10),
      pipeline_analyzed_at: new Date().toISOString(),
    },
  };

  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/payload`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    // Ensure keyword payload index on pipeline_tags for O(1) filter queries.
    // Qdrant PUT /index is idempotent — safe to call on every enrichment run.
    fetch(`${QDRANT_URL}/collections/codebase_chunks_768/index`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: 'pipeline_tags',
        field_schema: { type: 'keyword', lookup: true },
      }),
    }).catch(() => {});

    return {
      stage: 'tag-enrichment',
      data: { updated: chunkIds.length, ok: res.ok },
      durationMs: performance.now() - t0,
      source: 'qdrant',
    };
  } catch {
    return {
      stage: 'tag-enrichment',
      data: { updated: 0, degraded: true },
      durationMs: performance.now() - t0,
      source: 'error',
    };
  }
}

/** Stage 8: Obsidian vault export — generates Karpathy-style knowledge cards */
async function stageObsidianExport(
  chunks: any[],
  llmResponse: string | null,
  errorCards: any[],
  folder: string,
  fetchFn: typeof fetch
): Promise<PipelineResult> {
  const t0 = performance.now();

  // Build a markdown summary card
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const sections: string[] = [
    '---',
    `title: GPU Pipeline Analysis — ${timestamp}`,
    `date: ${timestamp}`,
    `tags: [gpu-pipeline, codebase-analysis, karpathy-kb]`,
    '---',
    '',
    '# GPU Pipeline Analysis',
    '',
  ];

  // Error summary
  if (errorCards.length) {
    sections.push('## Errors Detected');
    for (const e of errorCards.slice(0, 15)) {
      sections.push(`- **[${e.errorCode}]** ${e.message}`);
      sections.push(`  - File: \`${e.file}\``);
    }
    sections.push('');
  }

  // Top codebase files
  if (chunks.length) {
    sections.push('## Key Files (by PageRank)');
    const sorted = [...chunks].sort((a, b) => (b.pageRank ?? 0) - (a.pageRank ?? 0)).slice(0, 20);
    for (const c of sorted) {
      const tagStr = (c.tags ?? [])
        .slice(0, 5)
        .map((t: string) => `#${t}`)
        .join(' ');
      sections.push(`- [[${c.path.split('/').pop()}]] — ${c.domain} / ${c.role} ${tagStr}`);
    }
    sections.push('');
  }

  // LLM analysis
  if (llmResponse) {
    sections.push('## LLM Analysis');
    sections.push(llmResponse);
    sections.push('');
  }

  const markdown = sections.join('\n');
  const notePath = `${folder}/GPU Pipeline/${timestamp.slice(0, 10)}.md`;

  // Write to Obsidian via internal fetch
  try {
    const obsRes = await fetchFn('/api/obsidian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', path: notePath, content: markdown }),
    });
    const written = obsRes.ok;
    return {
      stage: 'obsidian-export',
      data: { written, path: notePath, noteLength: markdown.length },
      durationMs: performance.now() - t0,
      source: written ? 'obsidian' : 'generated-only',
    };
  } catch {
    return {
      stage: 'obsidian-export',
      data: { written: false, path: notePath, noteLength: markdown.length, markdown },
      durationMs: performance.now() - t0,
      source: 'obsidian-unavailable',
    };
  }
}

/**
 * Persister for GPU k-means clusters. Maps Assignments back to the Postgres mirror.
 */
async function persistGpuClusters(pool: any, assignments: any[]): Promise<number> {
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < assignments.length; i += BATCH) {
    const batch = assignments.slice(i, i + BATCH);
    const valid = batch.filter((a) => a.qdrantId || a.filePath);
    if (!valid.length) continue;

    const valuesSql = valid.map((_, idx) => `($${idx * 2 + 1}::text, $${idx * 2 + 2}::int)`).join(', ');
    const params = valid.flatMap((a) => [a.qdrantId ?? a.filePath, a.cluster]);

    const res = await pool.query(
      `UPDATE codebase_chunk_index c
          SET gpu_cluster = v.gpu_cluster,
              updated_at = NOW()
         FROM (VALUES ${valuesSql}) AS v(qdrant_id, gpu_cluster)
        WHERE c.qdrant_id = v.qdrant_id OR c.relative_path = v.qdrant_id`,
      params
    ).catch(() => ({ rowCount: 0 }));
    updated += (res.rowCount ?? 0);
  }
  return updated;
}

/**
 * Trigger cluster summary generation for all distinct clusters in the DB.
 */
async function queueClusterSummaryGeneration(pool: any) {
  try {
    const { generateClusterSummary } = await import('$lib/server/indexer/cluster-summary.js');
    const clusterRows = await pool.query(
      `SELECT DISTINCT COALESCE(gpu_cluster, som_cluster) AS cid
         FROM codebase_chunk_index
        WHERE gpu_cluster IS NOT NULL OR som_cluster IS NOT NULL
        LIMIT 100`
    );
    // Fire-and-forget
    for (const row of clusterRows.rows) {
      if (row.cid != null) generateClusterSummary(Number(row.cid), false).catch(() => {});
    }
  } catch (err) {
    console.warn('[gpu-pipeline] Failed to queue cluster summaries:', err);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals, fetch: svelteKitFetch }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = pipelineSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { action, query, clusterId, errorIds, caseId, limit, exportToObsidian, folder, recompute } =
    parsed.data;
  const pipelineStart = performance.now();
  const stages: PipelineResult[] = [];

  // ── Stage 0 (optional): GPU recomputation ─────────────────────────────────
  // When recompute=true, re-run: ts-morph AST scan → dual-embed → Qdrant upsert
  // → Neo4j graph sync → GPU k-means + PageRank → SOM topology
  // before the read-only analysis stages below.
  if (recompute) {
    const recomputeT0 = performance.now();
    const recomputeResults: Record<string, unknown> = {};

    try {
      // 0a. ts-morph AST scan → CodeChunk[] → dual-embed → Qdrant upsert
      // Dynamic imports avoid loading ts-morph on every pipeline call
      const { chunkFiles } = await import('$lib/server/indexer/ast-chunker.js');
      const { indexChunks } = await import('$lib/server/indexer/dual-embedder.js');
      const { readdir } = await import('fs/promises');
      const { resolve } = await import('path');

      const srcRoot = resolve(process.cwd(), 'src');
      const EXTS = new Set(['.ts', '.js', '.mts', '.svelte']);
      const SKIP = new Set(['node_modules', '.svelte-kit', 'archives', 'backups']);

      // Recursive file list (same pattern as orchestrate endpoint)
      async function walk(dir: string): Promise<string[]> {
        const out: string[] = [];
        for (const ent of await readdir(dir, { withFileTypes: true })) {
          if (SKIP.has(ent.name)) continue;
          const p = resolve(dir, ent.name);
          if (ent.isDirectory()) out.push(...(await walk(p)));
          else if (EXTS.has(ent.name.slice(ent.name.lastIndexOf('.')))) out.push(p);
        }
        return out;
      }

      const files = await walk(srcRoot);
      recomputeResults.filesScanned = files.length;

      // ts-morph AST → CodeChunk[] (handles .ts/.js, skips .svelte gracefully)
      const tsFiles = files.filter(
        (f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mts')
      );
      const chunks = await chunkFiles(tsFiles.slice(0, 2000), srcRoot);
      recomputeResults.chunksGenerated = chunks.length;

      // Dual-embed → Qdrant upsert (batched, adaptive GPU VRAM)
      if (chunks.length > 0) {
        const indexResult = await indexChunks(chunks);
        recomputeResults.embed = {
          stored: indexResult.storedInQdrant,
          failed: indexResult.failed,
          durationMs: indexResult.durationMs,
        };
      }

      // 0b. GPU k-means + PageRank via analyzeGraph
      const { analyzeGraph } = await import('$lib/server/graph/gpu-graph-analysis.js');
      const graphResult = await analyzeGraph({
        caseId: caseId ?? 'codebase',
        includeGpuClusters: true,
        includePageRank: true,
        includeSimilarityMatrix: false,
        maxNodes: 2000,
      });
      recomputeResults.graph = {
        nodes: graphResult.nodeCount,
        edges: graphResult.edgeCount,
        clusters: graphResult.gpuClusters?.k ?? 0,
        gpuSource: graphResult.gpuClusters?.source ?? 'none',
        gpu: graphResult.gpu,
      };

      // 0b-bis. Persist Graph GPU Clusters to Postgres codebase_chunk_index
      if (graphResult.gpuClusters?.assignments?.length) {
        const persisted = await persistGpuClusters(pgPool, graphResult.gpuClusters.assignments);
        recomputeResults.graphPersisted = persisted;
      }

      // 0b-bis. K-Means on codebase_chunks_768 → persist gpu_cluster to Qdrant + Postgres
      {
        const { runClusterAssign } = await import('$lib/server/indexer/run-cluster-assign.js');
        const clusterAssignResult = await runClusterAssign(20);
        recomputeResults.clusterAssign = {
          chunks: clusterAssignResult.chunksFound,
          updated: clusterAssignResult.updated,
          k: clusterAssignResult.k,
          source: clusterAssignResult.source,
          durationMs: clusterAssignResult.durationMs,
        };
      }

      // 0c. SOM topology → Neo4j SIMILAR_TOPOLOGY edges + Qdrant som_cluster tags
      const { runSOMTopologyPipeline } = await import('$lib/server/graph/som-topology-pipeline.js');
      const somResult = await runSOMTopologyPipeline({ maxFiles: 2000 });
      recomputeResults.som = {
        files: somResult.filesProcessed,
        grid: somResult.gridSize,
        edges: somResult.edgesCreated,
        source: somResult.source,
      };

      // 0d. Fire-and-forget: generate cluster summaries for every distinct cluster.
      if (recomputeResults.graphPersisted || (somResult?.filesProcessed ?? 0) > 0) {
        queueClusterSummaryGeneration(pgPool);
      }
    } catch (err: any) {
      recomputeResults.error = err.message ?? 'Recompute failed';
    }

    stages.push({
      stage: 'gpu-recompute',
      data: recomputeResults,
      durationMs: performance.now() - recomputeT0,
      source: 'gpu',
    });

    // Invalidate chunk cache so Stage 1 reads fresh data
    try {
      const redis = getRedis();
      const keys = await redis.keys('gp:chunks:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* Redis unavailable — chunks may be stale */
    }
  }

  // ── Stage 1: Codebase chunks ──────────────────────────────────────────────
  const codebaseResult = await stageCodebaseChunks(limit, clusterId);
  stages.push(codebaseResult);
  const codebaseChunks: any[] = (codebaseResult.data as any) ?? [];

  // ── Stage 2: Error analysis ───────────────────────────────────────────────
  let errorData: any = { clusters: [], cards: [] };
  if (action === 'fix' || action === 'analyze' || action === 'full-pipeline') {
    const errorResult = await stageErrorAnalysis(errorIds, clusterId);
    stages.push(errorResult);
    errorData = errorResult.data;

    // Stage 2.5: error vector enrichment (fire-and-forget — does not block pipeline)
    if ((errorData.cards ?? []).length > 0) {
      stageErrorVectorEnrichment(errorData.cards)
        .then((r) => stages.push(r))
        .catch(() => {});
    }
  }

  // ── Stage 3: RAG search (parallel with KAG + DAG) ─────────────────────────
  let ragChunks: any[] = [];
  let kagData: any = {};
  let dagData: any = {};
  let ragDiagnostics: any = null;

  if (query && (action === 'analyze' || action === 'full-pipeline')) {
    const [ragResult, kagResult, dagResult] = await Promise.all([
      stageRAGSearch(query, limit, errorData.cards ?? []),
      stageKAGContext(caseId),
      stageDAGOrder(caseId),
    ]);
    stages.push(ragResult, kagResult, dagResult);
    ragChunks = (ragResult.data as any)?.chunks ?? [];
    kagData = kagResult.data;
    dagData = dagResult.data;
    ragDiagnostics = (ragResult.data as any)?.diagnostics ?? null;
  }

  // ── Stage 4: LLM synthesis (RLM token-cached) ────────────────────────────
  let llmResponse: string | null = null;
  if (action === 'fix' || action === 'analyze' || action === 'full-pipeline') {
    const searchQuery = query ?? 'Analyze codebase errors and suggest fixes';
    const llmResult = await stageLLMSynthesis(
      searchQuery,
      codebaseChunks,
      errorData.cards ?? [],
      ragChunks
    );
    stages.push(llmResult);
    llmResponse = (llmResult.data as any)?.response ?? null;
  }

  // ── Stage 4.5: LangExtract (typed structured extraction) ────────────────
  let langExtractData: { errorFixes?: unknown[]; mlMetadata?: unknown[] } = {};
  if (
    action === 'fix' ||
    action === 'lang-extract' ||
    action === 'full-pipeline' ||
    ragChunks.some((c: any) => Array.isArray(c.tags) && c.tags.includes('ml-inference'))
  ) {
    const langExtractResult = await stageLangExtract(ragChunks, errorData.cards ?? [], action);
    stages.push(langExtractResult);
    langExtractData = langExtractResult.data as typeof langExtractData;
  }

  // ── Stage 5: Tag enrichment ──────────────────────────────────────────────
  if (action === 'tag' || action === 'full-pipeline') {
    const chunkIds = codebaseChunks
      .slice(0, 50)
      .map((c: any) => c.id)
      .filter(Boolean);
    const inferredTags = [
      ...(errorData.clusters ?? []).map(
        (c: any) => `error:${c.label?.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}`
      ),
      ...(ragChunks.length > 0 ? ['rag-hit'] : []),
      ...(kagData.neighbors?.length > 0 ? ['kag-connected'] : []),
      'gpu-pipeline-analyzed',
    ].slice(0, 10);

    const tagResult = await stageTagEnrichment(chunkIds, inferredTags);
    stages.push(tagResult);
  }

  // ── Stage 6: Obsidian export ─────────────────────────────────────────────
  if (exportToObsidian || action === 'export-obsidian' || action === 'full-pipeline') {
    const obsidianResult = await stageObsidianExport(
      codebaseChunks,
      llmResponse,
      errorData.cards ?? [],
      folder,
      svelteKitFetch
    );
    stages.push(obsidianResult);
  }

  const totalMs = performance.now() - pipelineStart;

  return json({
    action,
    stages: stages.map((s) => ({
      stage: s.stage,
      durationMs: Math.round(s.durationMs),
      source: s.source,
    })),
    summary: {
      recomputed: recompute,
      codebaseChunks: codebaseChunks.length,
      errorClusters: errorData.clusters?.length ?? 0,
      errorCards: errorData.cards?.length ?? 0,
      ragHits: ragChunks.length,
      kagNeighbors: kagData.neighbors?.length ?? 0,
      dagDocs: dagData.docCount ?? 0,
      llmGenerated: !!llmResponse,
      totalMs: Math.round(totalMs),
    },
    // Full data (for consumers that need it)
    codebaseChunks: codebaseChunks.slice(0, 20),
    errors: errorData,
    ragHits: ragChunks.slice(0, 10),
    kagContext: kagData,
    dagOrder: dagData,
    llmAnalysis: llmResponse,
    langExtract: langExtractData,
    ragDiagnostics,
  });
};

/** GET — pipeline health + stats overview */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	// ── ML schema Redis index query ─────────────────────────────────────────────
	// GET ?action=ml-schema&framework=libtorch  → chunk IDs indexed under that key
	// GET ?action=ml-schema&modelType=som       → chunk IDs for SOM model chunks
	// GET ?action=ml-schema&precision=fp16      → chunk IDs quantized to fp16
	const action = url.searchParams.get('action');
	if (action === 'ml-schema') {
		const framework = url.searchParams.get('framework');
		const modelType = url.searchParams.get('modelType');
		const precision = url.searchParams.get('precision');

		try {
			const redis = getRedis();
			const results: Record<string, string[]> = {};

			const queries: Array<[string, string]> = [
				...(framework ? [['framework', `ml-schema:fw:${framework}`] as [string, string]] : []),
				...(modelType ? [['modelType', `ml-schema:mt:${modelType}`]   as [string, string]] : []),
				...(precision ? [['precision', `ml-schema:prec:${precision}`] as [string, string]] : []),
			];

			if (queries.length === 0) {
				// No filter: list all known ML schema Redis keys
				const keys = await redis.keys('ml-schema:*');
				return json({ action: 'ml-schema', keys, hint: 'Use ?framework=|modelType=|precision= to query a specific index' });
			}

			await Promise.all(
				queries.map(async ([label, key]) => {
					const members = await redis.smembers(key);
					results[label] = members;
				})
			);

			// Intersection when multiple filters given
			const intersection = queries.length === 1
				? results[queries[0][0]]
				: queries
					.map(([label]) => new Set(results[label]))
					.reduce((acc, s) => new Set([...acc].filter(x => s.has(x))));

			return json({
				action:   'ml-schema',
				filter:   { framework, modelType, precision },
				chunkIds: queries.length === 1
					? results[queries[0][0]]
					: [...intersection],
				counts:   Object.fromEntries(queries.map(([label]) => [label, results[label].length])),
			});
		} catch {
			return json({ action: 'ml-schema', error: 'Redis unavailable', chunkIds: [] });
		}
	}

	// ── Default: pipeline health check ─────────────────────────────────────────
	const collections = ['codebase_chunks_768', 'phase90_error_clusters', 'phase90_error_cards', 'knowledge_base'];
	const checks = await Promise.all(
		collections.map(async (c) => {
			try {
				const res = await fetch(`${QDRANT_URL}/collections/${c}`, { signal: AbortSignal.timeout(5_000) });
				if (!res.ok) return { collection: c, status: 'error', points: 0 };
				const data = await res.json();
				return {
					collection: c,
					status:     'ok',
					points:     data.result?.points_count ?? 0,
					vectors:    data.result?.config?.params?.vectors
						? Object.keys(data.result.config.params.vectors)
						: ['anonymous'],
				};
			} catch {
				return { collection: c, status: 'unreachable', points: 0, vectors: [] };
			}
		})
	);

	return json({
		pipeline:       'gpu-codebase-index',
		version:        '2.0.0',
		collections:    checks,
		model:          ENV.OLLAMA_CHAT_MODEL,
		embeddingModel: 'embeddinggemma:latest',
		cacheStrategy:  'L1-Redis → L2-Bifrost → L3-Ollama',
		namedVectors:   { codebase_chunks_768: ['content', 'signature', 'error'] },
		rrfEnabled:     true,
		stages: [
			'1. codebase-chunks (Qdrant codebase_chunks_768 scroll)',
			'2. error-analysis (phase90_error_clusters/cards)',
			'2.5. error-vector-enrichment (embed error → codebase_chunks_768[error], fire-and-forget)',
			'3. rag-search (content ANN + error-vector RRF merge + knowledge_base)',
			'4. kag-context (PostgreSQL evidence graph)',
			'5. dag-order (citation topological sort)',
			'6. llm-synthesis (bifrostChat prompt-scaffold cache, stable+context digest)',
			'6.5. lang-extract (typed CodeError + ML metadata via LangExtract)',
			'7. tag-enrichment (Qdrant payload write-back, pipeline_tags)',
			'8. obsidian-export (Karpathy knowledge cards, optional)',
		],
		mlSchemaIndex: {
			description:  'Redis inverted index for ML chunk lookup by framework/modelType/precision',
			queryEndpoint: 'GET /api/codebase-index/gpu-pipeline?action=ml-schema&framework=libtorch',
			frameworks:   ['libtorch', 'onnx', 'webgpu', 'tensorrt'],
			modelTypes:   ['transformer', 'cnn', 'rnn', 'som', 'kmeans', 'embedding'],
		},
	});
};
