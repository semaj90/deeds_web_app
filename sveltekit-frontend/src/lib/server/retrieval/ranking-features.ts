/**
 * Ranking Feature Rows
 *
 * Extracts a fixed-shape numeric feature vector from a retrieval hit.
 * Each row maps to one candidate chunk. The boosted-reranker uses these
 * rows to compute a final score; the grpo-exporter uses them as training
 * inputs with a `selected` + `reward` label.
 *
 * Feature semantics:
 *   cosine          — embedding cosine similarity (0–1)
 *   bm25            — BM25 term-overlap score (0–1 normalized)
 *   topology        — topo-byte prefilter class match score (0–1)
 *   authority       — Karpathy blend / Neo4j PageRank authority (0–1)
 *   recency         — days-since-modified decayed to 0–1 (1 = today)
 *   cache_hit       — 1 if result came from Redis/Bifrost cache, else 0
 *   hmm_error_risk  — 0–1 penalty from HmmErrorClass labels
 *   rerank_score    — cross-encoder pointwise score if available (0–1)
 *
 * `selected` and `reward` are set after user feedback and written back
 * via reward-events.ts before the row is flushed to grpo-exporter.
 */

import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';
import type { HmmErrorClass } from '$lib/server/ace/ace-payload-selector.js';
import { hmmErrorRisk } from '$lib/server/ace/ace-payload-selector.js';

// ── Feature row ───────────────────────────────────────────────────────────────

export interface RankingFeatureRow {
  // retrieval scores (all 0–1)
  cosine: number;
  bm25: number;
  topology: number;
  authority: number;
  recency: number;
  // signal quality
  cache_hit: 0 | 1;
  hmm_error_risk: number; // 0–1: fraction of error labels that fired
  rerank_score: number;   // 0 if cross-encoder not run
  // identity (for tracing, not used in scoring)
  chunk_id: string;
  source: string;
  // labels — set after user feedback
  selected?: 0 | 1;
  reward?: number;
}

// ── Extraction context ─────────────────────────────────────────────────────────

export interface RankingContext {
  bm25Score?: number;
  topologyScore?: number;
  cacheHit?: boolean;
  hmmErrorLabels?: HmmErrorClass[];
  queryCreatedAt?: number; // ms timestamp when the query was issued
}

// ── Recency decay ─────────────────────────────────────────────────────────────

const RECENCY_HALF_LIFE_DAYS = 30;

function computeRecency(hit: UnifiedRetrievalResult, queryCreatedAt = Date.now()): number {
  const updatedAt = (hit as { updatedAt?: number }).updatedAt;
  if (!updatedAt || updatedAt <= 0) return 0.5; // unknown → neutral
  const ageMs = queryCreatedAt - updatedAt;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // Exponential decay: score = 2^(-age / half_life)
  return Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS);
}

// ── HMM error risk score ──────────────────────────────────────────────────────

// Exported from ace-payload-selector but defined here for reuse
const ERROR_WEIGHTS: Record<HmmErrorClass, number> = {
  wrong_chunk:            1.0,
  bad_intent:             0.9,
  hallucinated_file:      0.8,
  missing_dependency:     0.6,
  low_authority_source:   0.5,
  stale_context:          0.4,
  tool_timeout:           0.3,
  over_compacted_context: 0.2,
};

const MAX_ERROR_WEIGHT = Math.max(...Object.values(ERROR_WEIGHTS));

export function errorRiskScore(labels: HmmErrorClass[]): number {
  if (!labels.length) return 0;
  const total = labels.reduce((n, l) => n + (ERROR_WEIGHTS[l] ?? 0.3), 0);
  return Math.min(total / MAX_ERROR_WEIGHT, 1);
}

// ── Main extractor ─────────────────────────────────────────────────────────────

export function extractRankingFeatures(
  hit: UnifiedRetrievalResult,
  ctx: RankingContext = {}
): RankingFeatureRow {
  const errorLabels = ctx.hmmErrorLabels ?? [];
  const hmm_error_risk = errorRiskScore(errorLabels);

  return {
    cosine:         Math.max(0, Math.min(1, hit.score ?? 0)),
    bm25:           Math.max(0, Math.min(1, ctx.bm25Score ?? 0)),
    topology:       Math.max(0, Math.min(1, ctx.topologyScore ?? 0)),
    authority:      Math.max(0, Math.min(1, (hit.authorityScore ?? 0) / 10)), // normalise 0–10 → 0–1
    recency:        computeRecency(hit, ctx.queryCreatedAt),
    cache_hit:      ctx.cacheHit ? 1 : 0,
    hmm_error_risk,
    rerank_score:   Math.max(0, Math.min(1, hit.rerankScore ?? 0)),
    chunk_id:       hit.id,
    source:         hit.filePath ?? hit.sourceId ?? hit.id,
  };
}

export function extractRankingFeaturesBatch(
  hits: UnifiedRetrievalResult[],
  ctx: RankingContext = {}
): RankingFeatureRow[] {
  return hits.map(h => extractRankingFeatures(h, ctx));
}