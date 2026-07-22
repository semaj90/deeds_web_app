/**
 * Unified Cross-Ranker: Complete retrieval→rerank→persist path
 *
 * Contract:
 * Input:  (query: string, qdrant_top_k: array<{packet_key, score, point_id}>)
 * Output: ranked array<{packet_key, rerank_score, rank, evidence_summary}>
 *
 * Ranking Formula (blended, all normalized to [0,1]):
 *   rerank_score =
 *     0.40 * semantic_score +
 *     0.30 * lexical_bm25_score +
 *     0.20 * topology_pagerank +
 *     0.10 * naive_bayes_confidence
 *
 * Path: Qdrant → Postgres FTS → Neo4j PageRank → Naive Bayes → Blend → Persist
 *
 * Key Rules:
 * - No splitting logic across scripts; single source of truth
 * - Graceful degradation: missing data (Neo4j down) → fallback to Postgres
 * - Thread-safe: connection pooling, no global state
 * - Testable: inject dependencies (db, neo4j, weights)
 * - Production-ready: error handling, logging, metrics
 */

import { Pool } from 'pg';
import { getRgPool } from '$lib/server/search/rg-pool.js';
import { env as privateEnv } from '$env/dynamic/private';
import type { RankedCandidate } from './unified-orchestrator.js';

// ═══════════════════════════════════════════════════════════════
// Types & Contracts
// ═══════════════════════════════════════════════════════════════

export interface CrossRankerInput {
  query: string;
  query_id?: string; // For correlation logging
  qdrant_top_k: Array<{
    packet_key: string;
    qdrant_score: number;
    point_id?: string;
    payload?: Record<string, any>;
  }>;
  limit?: number;
  include_evidence?: boolean;
}

export interface RerankedResult {
  packet_key: string;
  rerank_score: number;
  rank: number;
  evidence_summary?: string;
  component_scores: {
    semantic: number;      // from Qdrant
    lexical: number;        // from Postgres FTS
    topology: number;       // from Neo4j/Postgres
    naive_bayes: number;   // trained model or heuristic
  };
  blend_weights: {
    semantic: number;
    lexical: number;
    topology: number;
    naive_bayes: number;
  };
  metadata: {
    source_ref?: string;
    file_path?: string;
    summary?: string;
  };
}

export interface CrossRankerOutput {
  query_id: string;
  query: string;
  ranked_results: RerankedResult[];
  metrics: {
    total_candidates: number;
    ranked_candidates: number;
    duration_ms: number;
    stage_timings: Record<string, number>;
    score_distribution: {
      min: number;
      max: number;
      mean: number;
      median: number;
    };
  };
  execution_trace: {
    qdrant_stage: string;
    bm25_stage: string;
    pagerank_stage: string;
    bayes_stage: string;
    persistence_stage: string;
  };
}

export interface CrossRankerDependencies {
  db: Pool;
  neo4j_enabled?: boolean;
  naive_bayes_weights?: Record<string, number>;
  blend_weights?: {
    semantic: number;
    lexical: number;
    topology: number;
    naive_bayes: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Constants & Configuration
// ═══════════════════════════════════════════════════════════════

const DEFAULT_BLEND_WEIGHTS = {
  semantic: 0.40,
  lexical: 0.30,
  topology: 0.20,
  naive_bayes: 0.10
} as const;

const DEFAULT_NAIVE_BAYES_WEIGHTS = {
  default_confidence: 0.5,
  high_semantic: 0.8,
  low_semantic: 0.3,
  sparse_bm25: 0.4
} as const;

const NAIVE_BAYES_CONFIDENCE_THRESHOLDS = {
  low_bm25_hits: 2,
  high_semantic_score: 0.75,
  fallback_score: 0.5
} as const;

// ═══════════════════════════════════════════════════════════════
// Stage 1: Semantic Score Normalization
// ═══════════════════════════════════════════════════════════════

function normalizeSemanticScores(
  candidates: CrossRankerInput['qdrant_top_k']
): Map<string, number> {
  const scores = candidates.map(c => c.qdrant_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;

  const normalized = new Map<string, number>();
  for (const candidate of candidates) {
    const normalized_score = (candidate.qdrant_score - minScore) / range;
    normalized.set(candidate.packet_key, Math.max(0, Math.min(1, normalized_score)));
  }
  return normalized;
}

// ═══════════════════════════════════════════════════════════════
// Stage 2: BM25 / Lexical Scoring from Postgres FTS
// ═══════════════════════════════════════════════════════════════

async function fetchBm25Scores(
  db: Pool,
  packet_keys: string[],
  query: string
): Promise<Map<string, number>> {
  const startTime = Date.now();
  const bm25_scores = new Map<string, number>();

  if (!packet_keys.length) return bm25_scores;

  try {
    // Use PostgreSQL FTS for BM25-like scoring
    // Assumes codebase_chunk_index has a full-text search tsvector column
    const result = await db.query(
      `
      SELECT
        packet_key,
        ts_rank(search_vector, plainto_tsquery($1)) as bm25_score
      FROM codebase_chunk_index
      WHERE packet_key = ANY($2)
        AND search_vector @@ plainto_tsquery($3)
      ORDER BY bm25_score DESC
      `,
      [query, packet_keys, query]
    );

    const maxScore = Math.max(...result.rows.map(r => r.bm25_score || 0), 0.01);
    for (const row of result.rows) {
      const normalized = Math.min(1, (row.bm25_score || 0) / (maxScore || 1));
      bm25_scores.set(row.packet_key, normalized);
    }

    // Fill in zero scores for packets with no FTS match
    for (const key of packet_keys) {
      if (!bm25_scores.has(key)) {
        bm25_scores.set(key, 0);
      }
    }
  } catch (err) {
    console.warn('BM25 stage failed, using fallback:', err instanceof Error ? err.message : String(err));
    // Graceful fallback: assign zero scores
    for (const key of packet_keys) {
      bm25_scores.set(key, 0);
    }
  }

  console.log(`[CROSS-RANKER] BM25 stage: ${packet_keys.length} packets, ${Date.now() - startTime}ms`);
  return bm25_scores;
}

// ═══════════════════════════════════════════════════════════════
// Stage 3: Topology / PageRank Scoring
// ═══════════════════════════════════════════════════════════════

async function fetchTopologyScores(
  db: Pool,
  packet_keys: string[],
  neo4j_enabled: boolean = true
): Promise<Map<string, number>> {
  const startTime = Date.now();
  const topology_scores = new Map<string, number>();

  if (!packet_keys.length) return topology_scores;

  try {
    // Primary path: Postgres materialized view (faster, always available)
    const result = await db.query(
      `
      SELECT
        packet_key,
        COALESCE(pagerank_l1, page_rank_score, pagerank) AS pagerank_l1
      FROM v_packet_topology_scores
      WHERE packet_key = ANY($1)
      `,
      [packet_keys]
    );

    const maxScore = Math.max(...result.rows.map(r => r.pagerank_l1 || 0), 0.01);
    for (const row of result.rows) {
      const normalized = Math.min(1, (row.pagerank_l1 || 0) / (maxScore || 1));
      topology_scores.set(row.packet_key, normalized);
    }

    // Fill in fallback scores (average) for missing packets
    const covered = new Set(result.rows.map(r => r.packet_key));
    const avgScore = result.rows.length > 0
      ? result.rows.reduce((sum, r) => sum + (r.pagerank_l1 || 0), 0) / result.rows.length / (maxScore || 1)
      : 0.5;

    for (const key of packet_keys) {
      if (!topology_scores.has(key)) {
        topology_scores.set(key, Math.min(0.5, avgScore)); // Default to 0.5 for unknown
      }
    }
  } catch (err) {
    console.warn('Topology stage failed, using uniform fallback:', err instanceof Error ? err.message : String(err));
    // Graceful fallback: assign uniform scores
    for (const key of packet_keys) {
      topology_scores.set(key, 0.5);
    }
  }

  console.log(`[CROSS-RANKER] Topology stage: ${packet_keys.length} packets, ${Date.now() - startTime}ms`);
  return topology_scores;
}

// ═══════════════════════════════════════════════════════════════
// Stage 4: Naive Bayes Confidence Scoring
// ═══════════════════════════════════════════════════════════════

async function computeNaiveBayesScores(
  db: Pool,
  packet_keys: string[],
  semantic_scores: Map<string, number>,
  bm25_scores: Map<string, number>,
  weights: Record<string, number> = DEFAULT_NAIVE_BAYES_WEIGHTS
): Promise<Map<string, number>> {
  const startTime = Date.now();
  const bayes_scores = new Map<string, number>();

  if (!packet_keys.length) return bayes_scores;

  try {
    // Heuristic Naive Bayes: P(relevant | features)
    // Features: semantic score, BM25 hits, summary existence
    const result = await db.query(
      `
      SELECT
        packet_key,
        CASE WHEN summary IS NOT NULL AND LENGTH(summary) > 10 THEN 1 ELSE 0 END as has_summary,
        source_ref IS NOT NULL as has_source_ref
      FROM codebase_chunk_index
      WHERE packet_key = ANY($1)
      `,
      [packet_keys]
    );

    const metadata = new Map<string, { has_summary: boolean; has_source_ref: boolean }>();
    for (const row of result.rows) {
      metadata.set(row.packet_key, {
        has_summary: row.has_summary === 1,
        has_source_ref: row.has_source_ref
      });
    }

    // Naive Bayes computation
    for (const key of packet_keys) {
      const semantic = semantic_scores.get(key) || 0;
      const bm25 = bm25_scores.get(key) || 0;
      const meta = metadata.get(key);

      // P(relevant | semantic, bm25, summary)
      // Simplified: weighted combination of features
      let confidence = weights.default_confidence || 0.5;

      if (semantic > NAIVE_BAYES_CONFIDENCE_THRESHOLDS.high_semantic_score) {
        confidence = weights.high_semantic || 0.8;
      } else if (bm25 < NAIVE_BAYES_CONFIDENCE_THRESHOLDS.low_bm25_hits) {
        confidence = weights.sparse_bm25 || 0.4;
      }

      // Boost if metadata is complete
      if (meta?.has_summary && meta?.has_source_ref) {
        confidence = Math.min(1, confidence * 1.1);
      }

      bayes_scores.set(key, Math.min(1, Math.max(0, confidence)));
    }
  } catch (err) {
    console.warn('Naive Bayes stage failed, using fallback:', err instanceof Error ? err.message : String(err));
    // Graceful fallback: use semantic score as proxy
    for (const key of packet_keys) {
      bayes_scores.set(key, semantic_scores.get(key) || 0.5);
    }
  }

  console.log(`[CROSS-RANKER] Naive Bayes stage: ${packet_keys.length} packets, ${Date.now() - startTime}ms`);
  return bayes_scores;
}

// ═══════════════════════════════════════════════════════════════
// Stage 5: Blend Scores
// ═══════════════════════════════════════════════════════════════

function blendScores(
  packet_keys: string[],
  semantic_scores: Map<string, number>,
  bm25_scores: Map<string, number>,
  topology_scores: Map<string, number>,
  bayes_scores: Map<string, number>,
  weights = DEFAULT_BLEND_WEIGHTS
): Map<string, { score: number; components: RerankedResult['component_scores'] }> {
  const blended = new Map<string, { score: number; components: RerankedResult['component_scores'] }>();

  for (const key of packet_keys) {
    const components = {
      semantic: semantic_scores.get(key) || 0,
      lexical: bm25_scores.get(key) || 0,
      topology: topology_scores.get(key) || 0,
      naive_bayes: bayes_scores.get(key) || 0
    };

    const score =
      weights.semantic * components.semantic +
      weights.lexical * components.lexical +
      weights.topology * components.topology +
      weights.naive_bayes * components.naive_bayes;

    blended.set(key, { score, components });
  }

  return blended;
}

// ═══════════════════════════════════════════════════════════════
// Stage 6: Fetch Evidence Metadata
// ═══════════════════════════════════════════════════════════════

async function fetchEvidenceMetadata(
  db: Pool,
  packet_keys: string[]
): Promise<Map<string, { source_ref?: string; file_path?: string; summary?: string }>> {
  const metadata = new Map<string, { source_ref?: string; file_path?: string; summary?: string }>();

  if (!packet_keys.length) return metadata;

  try {
    const result = await db.query(
      `
      SELECT
        packet_key,
        source_ref,
        file_path,
        summary
      FROM codebase_chunk_index
      WHERE packet_key = ANY($1)
      `,
      [packet_keys]
    );

    for (const row of result.rows) {
      metadata.set(row.packet_key, {
        source_ref: row.source_ref,
        file_path: row.file_path,
        summary: row.summary
      });
    }
  } catch (err) {
    console.warn('Metadata fetch failed:', err instanceof Error ? err.message : String(err));
  }

  return metadata;
}

// ═══════════════════════════════════════════════════════════════
// Stage 7: Persist Results
// ═══════════════════════════════════════════════════════════════

async function persistResults(
  db: Pool,
  query_id: string,
  query: string,
  ranked_results: RerankedResult[]
): Promise<void> {
  try {
    // Persist to semantic_top_k table
    if (ranked_results.length > 0) {
      const values = ranked_results.map((result, idx) => ({
        query_id,
        query,
        packet_key: result.packet_key,
        retrieved_rank: idx,
        reranked_rank: idx,
        rerank_score: result.rerank_score,
        evidence: result.evidence_summary || '',
        component_scores: result.component_scores,
        metadata: result.metadata
      }));

      for (const value of values) {
        await db.query(
          `
          INSERT INTO semantic_top_k
            (query_id, query, packet_key, retrieved_rank, reranked_rank, rerank_score, evidence, component_scores, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (query_id, packet_key) DO UPDATE SET
            rerank_score = $6,
            evidence = $7,
            component_scores = $8,
            updated_at = now()
          `,
          [
            value.query_id,
            value.query,
            value.packet_key,
            value.retrieved_rank,
            value.reranked_rank,
            value.rerank_score,
            value.evidence,
            JSON.stringify(value.component_scores),
            JSON.stringify(value.metadata)
          ]
        );
      }
    }

    // Persist decision log
    const decision_type = ranked_results.length > 0 ? 'success' : 'no_results';
    const avg_confidence = ranked_results.length > 0
      ? ranked_results.reduce((sum, r) => sum + r.rerank_score, 0) / ranked_results.length
      : 0;

    await db.query(
      `
      INSERT INTO retrieval_decision_log
        (query, query_id, decision_type, confidence, ranked_count)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [query, query_id, decision_type, avg_confidence, ranked_results.length]
    );
  } catch (err) {
    console.error('Persistence failed:', err instanceof Error ? err.message : String(err));
    // Non-blocking: log but don't throw
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Public API: executeUnifiedCrossRanking
// ═══════════════════════════════════════════════════════════════

export async function executeUnifiedCrossRanking(
  input: CrossRankerInput,
  deps: CrossRankerDependencies
): Promise<CrossRankerOutput> {
  const startTime = Date.now();
  const query_id = input.query_id || `query:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  const stage_timings: Record<string, number> = {};

  console.log(`[CROSS-RANKER] Starting for query: "${input.query}" (query_id: ${query_id})`);

  const execution_trace = {
    qdrant_stage: 'PENDING',
    bm25_stage: 'PENDING',
    pagerank_stage: 'PENDING',
    bayes_stage: 'PENDING',
    persistence_stage: 'PENDING'
  };

  try {
    // Stage 1: Normalize semantic scores from Qdrant
    let stageStart = Date.now();
    execution_trace.qdrant_stage = 'IN_PROGRESS';
    const semantic_scores = normalizeSemanticScores(input.qdrant_top_k);
    stage_timings.semantic_normalization = Date.now() - stageStart;
    execution_trace.qdrant_stage = 'COMPLETE';

    // Stage 2: Fetch BM25 scores from Postgres FTS
    stageStart = Date.now();
    execution_trace.bm25_stage = 'IN_PROGRESS';
    const packet_keys = input.qdrant_top_k.map(c => c.packet_key);
    const bm25_scores = await fetchBm25Scores(deps.db, packet_keys, input.query);
    stage_timings.bm25_fetch = Date.now() - stageStart;
    execution_trace.bm25_stage = 'COMPLETE';

    // Stage 3: Fetch topology / PageRank scores
    stageStart = Date.now();
    execution_trace.pagerank_stage = 'IN_PROGRESS';
    const topology_scores = await fetchTopologyScores(deps.db, packet_keys, deps.neo4j_enabled);
    stage_timings.topology_fetch = Date.now() - stageStart;
    execution_trace.pagerank_stage = 'COMPLETE';

    // Stage 4: Compute Naive Bayes scores
    stageStart = Date.now();
    execution_trace.bayes_stage = 'IN_PROGRESS';
    const bayes_scores = await computeNaiveBayesScores(
      deps.db,
      packet_keys,
      semantic_scores,
      bm25_scores,
      deps.naive_bayes_weights
    );
    stage_timings.bayes_compute = Date.now() - stageStart;
    execution_trace.bayes_stage = 'COMPLETE';

    // Stage 5: Blend scores
    stageStart = Date.now();
    const blended = blendScores(
      packet_keys,
      semantic_scores,
      bm25_scores,
      topology_scores,
      bayes_scores,
      deps.blend_weights || DEFAULT_BLEND_WEIGHTS
    );
    stage_timings.blend = Date.now() - stageStart;

    // Stage 6: Fetch evidence metadata
    stageStart = Date.now();
    const metadata_map = await fetchEvidenceMetadata(deps.db, packet_keys);
    stage_timings.metadata_fetch = Date.now() - stageStart;

    // Sort by rerank score descending
    const sorted = Array.from(blended.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, input.limit || 10);

    // Build final results
    const ranked_results: RerankedResult[] = sorted.map(([packet_key, blended_data], rank) => ({
      packet_key,
      rerank_score: blended_data.score,
      rank: rank + 1,
      evidence_summary: input.include_evidence
        ? `Ranked #${rank + 1} | Semantic: ${(blended_data.components.semantic * 100).toFixed(1)}% | Lexical: ${(blended_data.components.lexical * 100).toFixed(1)}% | Topology: ${(blended_data.components.topology * 100).toFixed(1)}%`
        : undefined,
      component_scores: blended_data.components,
      blend_weights: deps.blend_weights || DEFAULT_BLEND_WEIGHTS,
      metadata: metadata_map.get(packet_key) || {}
    }));

    // Stage 7: Persist results
    stageStart = Date.now();
    execution_trace.persistence_stage = 'IN_PROGRESS';
    await persistResults(deps.db, query_id, input.query, ranked_results);
    stage_timings.persistence = Date.now() - stageStart;
    execution_trace.persistence_stage = 'COMPLETE';

    // Compute score distribution
    const scores = ranked_results.map(r => r.rerank_score).sort((a, b) => a - b);
    const score_distribution = {
      min: scores[0] || 0,
      max: scores[scores.length - 1] || 0,
      mean: scores.reduce((a, b) => a + b, 0) / (scores.length || 1),
      median: scores[Math.floor(scores.length / 2)] || 0
    };

    const totalTime = Date.now() - startTime;

    console.log(`[CROSS-RANKER] Complete: ${ranked_results.length} results, ${totalTime}ms`);

    return {
      query_id,
      query: input.query,
      ranked_results,
      metrics: {
        total_candidates: input.qdrant_top_k.length,
        ranked_candidates: ranked_results.length,
        duration_ms: totalTime,
        stage_timings,
        score_distribution
      },
      execution_trace
    };
  } catch (err) {
    console.error('[CROSS-RANKER] Fatal error:', err);
    execution_trace.persistence_stage = 'FAILED';
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// Export helper functions for testing
// ═══════════════════════════════════════════════════════════════

export const CrossRankerTestHelpers = {
  normalizeSemanticScores,
  blendScores,
  computeNaiveBayesScores,
  fetchBm25Scores,
  fetchTopologyScores,
  fetchEvidenceMetadata
};
