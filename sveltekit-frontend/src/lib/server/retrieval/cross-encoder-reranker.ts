/**
 * Cross-Encoder Reranker — Gemma4 pointwise scoring with Redis score cache.
 *
 * Pipeline:
 *   candidates (20–80)
 *     → L0  Redis result-set cache  (1ms — full ranked list on exact hit)
 *     → L1  Redis score batch lookup  (5ms — individual (query,doc) pair scores)
 *     → uncached pairs → Gemma4 JSON-format scoring  (sequential, exploits KV prefix cache)
 *     → write new scores to Redis (24h TTL)
 *     → sort all by score → write full ranked list to Redis (1h TTL)
 *     → return top_n
 *     → if maxScore < FALLBACK_THRESHOLD → webSearchFallback() → re-rank expanded set
 *
 * Cache tiers:
 *   L0 result-set cache  — key: rr:list:{model}:{qHash}:{setHash}:{topK}
 *                           value: JSON [{documentId, rerankScore}]  TTL: 1h
 *                           Hit means: same query AND same candidate IDs AND same topK
 *                           → reconstruct RerankResult[] from original objects, skip ALL scoring
 *   L1 per-score cache   — key: rr:{qHash}:{dHash}
 *                           value: float string  TTL: 24h
 *                           Hit means: individual (query, doc) pair score is known
 *
 * KV prefix caching (Ollama):
 *   All scoring prompts share the same `"Query: {query}\n\nDocument:\n"` prefix.
 *   Ollama's built-in prefix KV cache (Flash Attention + Q8_0 KV enabled) reuses
 *   query token states across sequential document calls — only the doc portion is
 *   fresh per pair. Effective ~40–60% TTFT reduction for batches ≥ 4.
 *
 * Fallback chain:
 *   Gemma4 JSON parse error → raw numeric extraction → 0.5 passthrough
 *   webSearch unavailable → skip (don't block synthesis)
 *   Redis unavailable → score every pair fresh (graceful degradation)
 */

import { createHash } from 'crypto';
import { ollamaFetch, VLM_MODELS } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { webSearch, type WebSearchResult } from '$lib/server/retrieval/web-search.js';
import { traceCache, traceGraph } from '$lib/server/observability/langfuse.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { fromRerankResult, type UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Rerank backend selection.
 * Env: RERANK_BACKEND = 'tensorrt' | 'triton' | 'ollama' (default: 'ollama')
 * At scoring time, the selected backend is probed once. On failure, falls back
 * through the chain: tensorrt → triton → ollama.
 */
type RerankBackend = 'tensorrt' | 'triton' | 'ollama';
const RERANK_BACKEND = (process.env.RERANK_BACKEND ?? 'ollama') as RerankBackend;

/** Below this score the reranker triggers web search ingestion */
export const RERANK_FALLBACK_THRESHOLD = 0.45;

/** Redis TTL for cached individual (query,doc) scores — deterministic, long TTL safe */
const SCORE_TTL_S = 86_400; // 24h

/** Redis TTL for full ranked result-set lists — shorter since candidate sets are query-specific */
const LIST_TTL_S = 3_600; // 1h

/** Prefix for individual score keys */
const REDIS_PREFIX = 'rr';

/** Prefix for ranked result-set list keys */
const REDIS_LIST_PREFIX = 'rr:list';

/** Model short tag embedded in list cache key (avoids cross-model collisions) */
const MODEL_TAG = 'g4l'; // gemma4-legal

/** Model used for reranking — fine-tuned legal Gemma4 */
const RERANK_MODEL = VLM_MODELS.legal; // 'gemma4-legal:latest'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RerankCandidate {
  /** Stable document/chunk identifier */
  documentId: string;
  /** Full text used for scoring (will be truncated to SCORE_MAX_CHARS) */
  content: string;
  /** Original retrieval score (preserved in result) */
  retrievalScore: number;
  [key: string]: unknown;
}

export interface RerankResult<T extends RerankCandidate = RerankCandidate> {
  doc: T;
  /** Gemma4 relevance score 0–1 */
  rerankScore: number;
  /** Whether score came from Redis cache */
  cached: boolean;
  /** Whether this result was served from the ranked result-set list cache (L0) */
  listCached?: boolean;
  /** Original retrieval rank position */
  originalRank: number;
}

export interface RerankOptions {
  /** Maximum candidates to score (default 40). Larger = more VRAM time. */
  topN?: number;
  /** Return at most this many after reranking (default 8) */
  returnTopK?: number;
  /** Disable web search fallback (default false) */
  noFallback?: boolean;
  /** Minimum score to include in result (default 0) */
  minScore?: number;
  /** Optional user ID for Langfuse analytics */
  userId?: string;
}

/** Per-call cache statistics returned alongside rerank results */
export interface RerankStats {
  /** True when the full ranked list was served from L0 result-set cache (0 Gemma4 calls) */
  l0Hit: boolean;
  /** Number of individual (query,doc) score pairs served from L1 Redis cache */
  l1Hits: number;
  /** Number of pairs that were NOT in L1 cache (required Gemma4 scoring) */
  l1Misses: number;
  /** Number of candidates scored via Gemma4 this call */
  freshScored: number;
}

export interface RerankReturn<T extends RerankCandidate = RerankCandidate> {
  results: RerankResult<T>[];
  stats: RerankStats;
}

/**
 * Convert a batch of RerankResult<T> (from rerankWithGemma4) to UnifiedRetrievalResult[].
 * Convenience wrapper so callers don't need to import fromRerankResult directly.
 */
export function rerankToUnified<T extends RerankCandidate>(
  results: RerankResult<T>[],
): UnifiedRetrievalResult[] {
  return results.map((r) => fromRerankResult(r));
}

// ── Hash helpers ──────────────────────────────────────────────────────────────

const SCORE_MAX_CHARS = 512;

function _queryHash(query: string): string {
  return createHash('sha256').update(query).digest('hex').slice(0, 16);
}

function _docHash(content: string): string {
  return createHash('sha256').update(content.slice(0, SCORE_MAX_CHARS)).digest('hex').slice(0, 16);
}

function _scoreKey(qHash: string, dHash: string): string {
  return `${REDIS_PREFIX}:${qHash}:${dHash}`;
}

/**
 * Hash of the full candidate set — order-independent (sorted by documentId).
 * Used to identify the exact combination of candidates for list cache lookup.
 */
function _candidateSetHash(candidates: RerankCandidate[]): string {
  const parts = candidates
    .map(d => `${d.documentId}:${_docHash(d.content)}`)
    .sort();
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function _listKey(qHash: string, setHash: string, topK: number): string {
  return `${REDIS_LIST_PREFIX}:${MODEL_TAG}:${qHash}:${setHash}:${topK}`;
}

// ── L0 Result-set list cache ──────────────────────────────────────────────────

interface ListEntry {
  documentId: string;
  rerankScore: number;
  originalRank: number;
}

async function _getListCache(key: string): Promise<ListEntry[] | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    if (!raw) return null;
    const entries = fastJsonParse<ListEntry[]>(raw);
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return entries;
  } catch {
    return null;
  }
}

async function _setListCache(key: string, entries: ListEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const redis = getRedis();
    await redis.setex(key, LIST_TTL_S, JSON.stringify(entries));
  } catch {
    // Non-fatal
  }
}

// ── L1 Redis per-score cache ──────────────────────────────────────────────────

async function _batchGetCached(
  qHash: string,
  docs: RerankCandidate[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const redis = getRedis();
    const keys = docs.map(d => _scoreKey(qHash, _docHash(d.content)));
    const vals = await redis.mget(...keys);
    for (let i = 0; i < docs.length; i++) {
      const v = vals[i];
      if (v !== null) {
        const score = parseFloat(v);
        if (isFinite(score)) result.set(docs[i].documentId, score);
      }
    }
  } catch {
    // Redis unavailable — proceed without cache
  }
  return result;
}

async function _batchSetCached(
  qHash: string,
  scored: Array<{ doc: RerankCandidate; score: number }>
): Promise<void> {
  if (scored.length === 0) return;
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const { doc, score } of scored) {
      const key = _scoreKey(qHash, _docHash(doc.content));
      pipeline.setex(key, SCORE_TTL_S, score.toFixed(6));
    }
    await pipeline.exec();
  } catch {
    // Non-fatal
  }
}

// ── Gemma4 pointwise scorer ───────────────────────────────────────────────────

const SCORE_PROMPT_PREFIX = (query: string) =>
  `You are a legal relevance scorer.\n` +
  `Query: ${query}\n\n` +
  `Document:\n`;

const SCORE_PROMPT_SUFFIX =
  `\n\nRate the relevance of this document to the query.\n` +
  `Respond ONLY with JSON: {"score": <number 0.0 to 1.0>}`;

async function _scoreOne(query: string, doc: RerankCandidate): Promise<number> {
  const docText = doc.content.slice(0, SCORE_MAX_CHARS);
  const prompt = SCORE_PROMPT_PREFIX(query) + docText + SCORE_PROMPT_SUFFIX;

  try {
    const res = await ollamaFetch(
      `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: RERANK_MODEL,
          prompt,
          format: 'json',
          stream: false,
          keep_alive: '10m',
          options: {
            temperature: 0,
            num_predict: 24, // {"score": 0.87} is ~12 tokens, headroom for whitespace
            top_k: 1,
          },
        }),
      }
    );

    if (!res.ok) return 0.5;

    const raw = await res.text();
    const body = fastJsonParse<{ response?: string }>(raw);
    const json = fastJsonParse<{ score?: number }>(body?.response ?? '{}');

    if (typeof json?.score === 'number' && isFinite(json.score)) {
      return Math.max(0, Math.min(1, json.score));
    }

    // Fallback: extract first float from response text
    const match = (body?.response ?? '').match(/\d+(?:\.\d+)?/);
    if (match) return Math.max(0, Math.min(1, parseFloat(match[0])));

    return 0.5; // neutral on parse failure
  } catch {
    return 0.5;
  }
}

/**
 * Score via TensorRT-LLM generate endpoint (same prompt format as Ollama).
 * Returns null on failure so caller can fall through to next backend.
 */
async function _scoreTensorRT(query: string, doc: RerankCandidate): Promise<number | null> {
  const trtUrl = process.env.TENSORRT_URL ?? 'http://localhost:8099';
  const docText = doc.content.slice(0, SCORE_MAX_CHARS);
  const prompt = SCORE_PROMPT_PREFIX(query) + docText + SCORE_PROMPT_SUFFIX;
  try {
    const res = await fetch(`${trtUrl}/v2/models/ensemble/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_input: prompt,
        max_tokens: 24,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { text_output?: string };
    const json = fastJsonParse<{ score?: number }>(body?.text_output ?? '{}');
    if (typeof json?.score === 'number' && isFinite(json.score)) {
      return Math.max(0, Math.min(1, json.score));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Score via Triton Inference Server (HTTP predict endpoint).
 * Returns null on failure.
 */
async function _scoreTriton(query: string, doc: RerankCandidate): Promise<number | null> {
  const tritonUrl = process.env.TRITON_URL ?? 'http://localhost:8000';
  const docText = doc.content.slice(0, SCORE_MAX_CHARS);
  const prompt = SCORE_PROMPT_PREFIX(query) + docText + SCORE_PROMPT_SUFFIX;
  try {
    const res = await fetch(`${tritonUrl}/v2/models/ensemble/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_input: prompt,
        parameters: { max_tokens: 24, temperature: 0 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { text_output?: string };
    const json = fastJsonParse<{ score?: number }>(body?.text_output ?? '{}');
    if (typeof json?.score === 'number' && isFinite(json.score)) {
      return Math.max(0, Math.min(1, json.score));
    }
    return null;
  } catch {
    return null;
  }
}

/** Cached backend availability — avoids repeated failed health checks */
const _backendHealth: Record<RerankBackend, { ok: boolean; checkedAt: number }> = {
  tensorrt: { ok: true, checkedAt: 0 },
  triton: { ok: true, checkedAt: 0 },
  ollama: { ok: true, checkedAt: 0 },
};
const HEALTH_RECHECK_MS = 60_000; // re-probe failed backends every 60s

/**
 * Score with backend fallback chain.
 * Order: configured RERANK_BACKEND → fallback through chain.
 */
async function scoreWithBackendFallback(query: string, doc: RerankCandidate): Promise<number> {
  const chain: RerankBackend[] =
    RERANK_BACKEND === 'tensorrt' ? ['tensorrt', 'triton', 'ollama']
    : RERANK_BACKEND === 'triton' ? ['triton', 'ollama']
    : ['ollama'];

  for (const backend of chain) {
    const health = _backendHealth[backend];
    if (!health.ok && Date.now() - health.checkedAt < HEALTH_RECHECK_MS) continue;

    let score: number | null = null;
    if (backend === 'tensorrt') score = await _scoreTensorRT(query, doc);
    else if (backend === 'triton') score = await _scoreTriton(query, doc);
    else score = await _scoreOne(query, doc);

    if (score !== null) {
      health.ok = true;
      health.checkedAt = Date.now();
      return score;
    }

    // Mark backend as down
    health.ok = false;
    health.checkedAt = Date.now();
  }

  return 0.5; // all backends failed
}

// ── Web search fallback ───────────────────────────────────────────────────────

/**
 * When top score < RERANK_FALLBACK_THRESHOLD, search the web and convert
 * results to synthetic RerankCandidates for a second rerank pass.
 *
 * Returned candidates should also be queued to RabbitMQ document.embed
 * for durable Qdrant ingestion (caller's responsibility).
 */
async function _webSearchFallback(query: string, maxResults = 5): Promise<RerankCandidate[]> {
  try {
    const { results } = await webSearch(query, maxResults);
    return results.map((r: WebSearchResult, i) => ({
      documentId: `web:${createHash('sha256').update(r.url).digest('hex').slice(0, 12)}`,
      content: `${r.title}\n\n${r.snippet}`,
      retrievalScore: 0.3, // synthetic — lower than Qdrant hits
      source: r.source,
      url: r.url,
      title: r.title,
      _webResult: true,
      _rank: i,
    }));
  } catch {
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Rerank retrieval candidates using Gemma4 pointwise scoring.
 *
 * Two-tier Redis cache:
 *   L0 result-set list — exact (query, candidates, topK) hit → reconstruct from list, 0 Gemma4 calls
 *   L1 per-score        — individual (query, doc) hits → only score uncached pairs
 *
 * Flow:
 *   1. L0 result-set cache lookup — if hit, reconstruct + return immediately
 *   2. L1 Redis batch lookup for per-score cache
 *   3. Sequential Gemma4 calls for uncached pairs (exploits Ollama prefix KV cache)
 *   4. Write new scores to L1 Redis
 *   5. Sort full result set, write to L0 result-set cache
 *   6. If maxScore < RERANK_FALLBACK_THRESHOLD → web search → score web results
 *   7. Return sorted results, top returnTopK
 *
 * @param query      User query string (used verbatim in scoring prompt)
 * @param candidates Retrieval results (from Qdrant / graph expansion)
 * @param opts       Tuning options
 */
export async function rerankWithGemma4<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  opts: RerankOptions = {}
): Promise<RerankReturn<T>> {
  const topN = opts.topN ?? 40;
  const returnTopK = opts.returnTopK ?? 8;
  const minScore = opts.minScore ?? 0;

  if (candidates.length === 0) {
    return { results: [], stats: { l0Hit: false, l1Hits: 0, l1Misses: 0, freshScored: 0 } };
  }

  return traceGraph(
    'rerank:gemma4',
    { query: query.slice(0, 80), candidateCount: candidates.length, userId: opts.userId },
    async () => {
      const pool = candidates.slice(0, topN);
      const qHash = _queryHash(query);
      const setHash = _candidateSetHash(pool);
      const listKey = _listKey(qHash, setHash, returnTopK);

      // ── L0: Result-set list cache ──────────────────────────────────────
      // Exact hit means same query + same candidate set + same topK — skip all scoring
      const listHit = await traceCache(
        'rerank:list-cache-lookup',
        { qHash, setHash, topK: returnTopK },
        () => _getListCache(listKey)
      );

      if (listHit) {
        // Reconstruct RerankResult<T>[] from the cached list + original objects
        const idMap = new Map<string, T>(pool.map(d => [d.documentId, d]));
        const reconstructed: RerankResult<T>[] = [];
        for (const entry of listHit) {
          const doc = idMap.get(entry.documentId);
          if (doc) {
            reconstructed.push({
              doc,
              rerankScore: entry.rerankScore,
              cached: true,
              listCached: true,
              originalRank: entry.originalRank,
            });
          }
        }
        if (reconstructed.length > 0) {
          const filtered = reconstructed.filter(r => r.rerankScore >= minScore);
          return {
            results: filtered,
            stats: { l0Hit: true, l1Hits: 0, l1Misses: 0, freshScored: 0 },
          };
        }
        // If IDs don't match (stale set), fall through to full scoring
      }

      // ── L1: Per-score Redis batch lookup ─────────────────────────────
      const cachedScores = await traceCache(
        'rerank:redis-lookup',
        { qHash, count: pool.length },
        async () => _batchGetCached(qHash, pool)
      );

      const uncached = pool.filter(d => !cachedScores.has(d.documentId));
      const toWrite: Array<{ doc: T; score: number }> = [];

      // ── Gemma4 scoring for uncached pairs (sequential — prefix KV cache) ──
      // Sequential (not parallel) so Ollama keeps the model hot and the
      // query-prefix KV states are warm across all doc calls.
      const freshScores = new Map<string, number>();
      for (const doc of uncached) {
        const score = await scoreWithBackendFallback(query, doc);
        freshScores.set(doc.documentId, score);
        toWrite.push({ doc, score });
      }

      // ── Write fresh scores to L1 Redis ──────────────────────────────
      await _batchSetCached(qHash, toWrite);

      // ── Assemble full result set ─────────────────────────────────────
      let results: RerankResult<T>[] = pool.map((doc, i) => ({
        doc,
        rerankScore:
          cachedScores.get(doc.documentId) ??
          freshScores.get(doc.documentId) ??
          0.5,
        cached: cachedScores.has(doc.documentId),
        listCached: false,
        originalRank: i,
      }));

      results.sort((a, b) => b.rerankScore - a.rerankScore);

      // ── Web search fallback when top score too low ───────────────────
      const maxScore = results[0]?.rerankScore ?? 0;
      if (!opts.noFallback && maxScore < RERANK_FALLBACK_THRESHOLD) {
        const webCandidates = (await _webSearchFallback(query)) as unknown as T[];
        if (webCandidates.length > 0) {
          const webCached = await _batchGetCached(qHash, webCandidates);
          const webUncached = webCandidates.filter(d => !webCached.has(d.documentId));
          const webToWrite: Array<{ doc: T; score: number }> = [];

          for (const doc of webUncached) {
            const score = await scoreWithBackendFallback(query, doc);
            freshScores.set(doc.documentId, score);
            webToWrite.push({ doc, score });
          }
          await _batchSetCached(qHash, webToWrite);

          const webResults: RerankResult<T>[] = webCandidates.map((doc, i) => ({
            doc,
            rerankScore:
              webCached.get(doc.documentId) ??
              freshScores.get(doc.documentId) ??
              0.3,
            cached: webCached.has(doc.documentId),
            listCached: false,
            originalRank: pool.length + i,
          }));

          results = [...results, ...webResults].sort((a, b) => b.rerankScore - a.rerankScore);

          // Queue web results for durable ingestion into knowledge_base (non-blocking)
          import('./web-ingest.js').then(({ queueWebResultsForIngestion }) => {
            const rawResults = webCandidates.map(d => ({
              url: (d as any).url ?? '',
              title: (d as any).title ?? '',
              snippet: (d as any).content ?? '',
              source: (d as any).source,
            })).filter(r => r.url);
            const scoreMap = new Map<string, number>();
            for (const wr of webResults) {
              scoreMap.set(wr.doc.documentId, wr.rerankScore);
            }
            queueWebResultsForIngestion(rawResults, query, scoreMap).catch(() => {});
          }).catch(() => {});
        }
      }

      const finalResults = results.filter(r => r.rerankScore >= minScore).slice(0, returnTopK);

      // ── Write final ranked list to L0 result-set cache ───────────────
      // Only cache if we have real Gemma4 scores (not all passthrough 0.5s)
      const hasRealScores = finalResults.some(r => r.rerankScore !== 0.5);
      if (hasRealScores && !opts.noFallback) {
        const listEntries: ListEntry[] = finalResults.map(r => ({
          documentId: r.doc.documentId,
          rerankScore: r.rerankScore,
          originalRank: r.originalRank,
        }));
        _setListCache(listKey, listEntries).catch(() => {}); // fire-and-forget
      }

      return {
        results: finalResults,
        stats: {
          l0Hit: false,
          l1Hits: cachedScores.size,
          l1Misses: uncached.length,
          freshScored: toWrite.length,
        },
      };
    }
  );
}

/**
 * Lightweight reranker status — for /api/health or audit gates.
 */
export function getRerankStatus(): {
  model: string;
  cacheBackend: 'redis';
  fallback: 'web-search';
  listCacheTtlS: number;
  scoreCacheTtlS: number;
} {
  return {
    model: RERANK_MODEL,
    cacheBackend: 'redis',
    fallback: 'web-search',
    listCacheTtlS: LIST_TTL_S,
    scoreCacheTtlS: SCORE_TTL_S,
  };
}
