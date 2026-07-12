/**
 * Multi-Vector Orchestrator — RRF-Fused 4-Lane Retrieval
 *
 * Executes 4 parallel retrieval lanes and fuses results via RRF:
 * 1. Content Dense (Qdrant 768-d HNSW)
 * 2. Summary Dense (Qdrant 768-d HNSW, remapped from 'error')
 * 3. Title Dense (Qdrant 768-d HNSW, remapped from 'signature')
 * 4. Keywords Lexical (BM25 from Qdrant payload)
 *
 * Architecture:
 * - Parallel lane execution (all 4 lanes simultaneously)
 * - Top-K collection from each lane
 * - RRF fusion with configurable weights
 * - Result normalization to [0, 1]
 */

import { ENV } from '$lib/server/env.server.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import {
  fuseLanesViaRrf,
  validateRRFConfig,
  DEFAULT_RRF_CONFIG,
  type RRFConfig,
  type QdrantSearchResult,
} from './rrf-multi-vector.js';

export interface MultiVectorRequest {
  query: string;
  queryEmbedding: number[]; // 768-dim
  topK?: number;
  weights?: Partial<RRFConfig['weights']>;
  filters?: Record<string, unknown>;
}

export interface MultiVectorResult {
  candidates: Array<{
    id: string;
    score: number;
    normalized_score: number;
    content_score: number;
    summary_score: number;
    title_score: number;
    keyword_score: number;
    rrf_score: number;
    source_lanes: string[];
  }>;
  timing: {
    content_ms: number;
    summary_ms: number;
    title_ms: number;
    keywords_ms: number;
    fusion_ms: number;
    total_ms: number;
  };
  lane_stats: {
    content_count: number;
    summary_count: number;
    title_count: number;
    keywords_count: number;
  };
}

/**
 * Execute multi-vector retrieval with RRF fusion
 */
export async function executeMultiVectorRetrieval(
  request: MultiVectorRequest
): Promise<MultiVectorResult> {
  const startTime = performance.now();
  const qdrant = getQdrantClient();

  const config: RRFConfig = {
    weights: {
      ...DEFAULT_RRF_CONFIG.weights,
      ...(request.weights || {}),
    },
    k: DEFAULT_RRF_CONFIG.k,
    topK: request.topK || 10,
  };

  // Validate config
  const validation = validateRRFConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid RRF config: ${validation.errors.join(', ')}`);
  }

  const collection = 'codebase_chunks_768';

  // ── Lane 1: Content Dense (768-d HNSW) ──────────────────────────────────
  let contentResults: QdrantSearchResult[] = [];
  let contentMs = 0;
  try {
    const contentStart = performance.now();
    const contentResponse = await qdrant.search(collection, {
      vector: {
        name: 'content',
        vector: request.queryEmbedding,
      },
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    contentResults = contentResponse.map((point) => ({
      id: String(point.id),
      score: point.score,
      payload: point.payload,
    }));

    contentMs = performance.now() - contentStart;
  } catch (err) {
    console.warn('[multi-vector] content lane failed:', err);
    contentMs = performance.now() - performance.now();
  }

  // ── Lane 2: Summary Dense (768-d HNSW, remapped from 'error') ─────────────
  let summaryResults: QdrantSearchResult[] = [];
  let summaryMs = 0;
  try {
    const summaryStart = performance.now();
    const summaryResponse = await qdrant.search(collection, {
      vector: {
        name: 'error', // Remapped from 'error' to 'summary' semantics
        vector: request.queryEmbedding,
      },
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    summaryResults = summaryResponse.map((point) => ({
      id: String(point.id),
      score: point.score,
      payload: point.payload,
    }));

    summaryMs = performance.now() - summaryStart;
  } catch (err) {
    console.warn('[multi-vector] summary lane failed:', err);
    summaryMs = performance.now() - performance.now();
  }

  // ── Lane 3: Title Dense (768-d HNSW, remapped from 'signature') ──────────
  let titleResults: QdrantSearchResult[] = [];
  let titleMs = 0;
  try {
    const titleStart = performance.now();
    const titleResponse = await qdrant.search(collection, {
      vector: {
        name: 'signature', // Remapped from 'signature' to 'title' semantics
        vector: request.queryEmbedding,
      },
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    titleResults = titleResponse.map((point) => ({
      id: String(point.id),
      score: point.score,
      payload: point.payload,
    }));

    titleMs = performance.now() - titleStart;
  } catch (err) {
    console.warn('[multi-vector] title lane failed:', err);
    titleMs = performance.now() - performance.now();
  }

  // ── Lane 4: Keywords Lexical (BM25 via Qdrant payload filter) ─────────────
  let keywordResults: QdrantSearchResult[] = [];
  let keywordsMs = 0;
  try {
    const keywordsStart = performance.now();

    // BM25 retrieval via Qdrant full-text search on keywords payload
    // (Note: requires BM25 indexing to be enabled on 'keywords' field)
    try {
      const keywordResponse = await (qdrant as any).search(collection, {
        query: request.query, // Natural language query for BM25
        using: 'keywords', // Vector name or payload field name
        limit: config.topK,
        with_payload: true,
      });

      keywordResults = keywordResponse.map((point: any) => ({
        id: String(point.id),
        score: point.score,
        payload: point.payload,
      }));
    } catch {
      // Fallback: If BM25 not available, use empty results (non-blocking)
      keywordResults = [];
    }

    keywordsMs = performance.now() - keywordsStart;
  } catch (err) {
    console.warn('[multi-vector] keywords lane failed:', err);
    keywordsMs = performance.now() - performance.now();
  }

  // ── RRF Fusion ───────────────────────────────────────────────────────────
  const fusionStart = performance.now();
  const fused = fuseLanesViaRrf(contentResults, summaryResults, titleResults, keywordResults, config);
  const fusionMs = performance.now() - fusionStart;

  const totalMs = performance.now() - startTime;

  // ── Build response ─────────────────────────────────────────────────────────
  return {
    candidates: fused.map((candidate) => ({
      id: candidate.id,
      score: candidate.rrf_score,
      normalized_score: candidate.normalizedScore,
      content_score: candidate.contentScore,
      summary_score: candidate.summaryScore,
      title_score: candidate.titleScore,
      keyword_score: candidate.keywordScore,
      rrf_score: candidate.rrf_score,
      source_lanes: [
        candidate.contentScore > 0 ? 'content' : null,
        candidate.summaryScore > 0 ? 'summary' : null,
        candidate.titleScore > 0 ? 'title' : null,
        candidate.keywordScore > 0 ? 'keywords' : null,
      ].filter((x) => x) as string[],
    })),
    timing: {
      content_ms: contentMs,
      summary_ms: summaryMs,
      title_ms: titleMs,
      keywords_ms: keywordsMs,
      fusion_ms: fusionMs,
      total_ms: totalMs,
    },
    lane_stats: {
      content_count: contentResults.length,
      summary_count: summaryResults.length,
      title_count: titleResults.length,
      keywords_count: keywordResults.length,
    },
  };
}

/**
 * Health check for multi-vector retrieval
 */
export async function checkMultiVectorHealth(): Promise<{
  ok: boolean;
  qdrant_ok: boolean;
  vectors_available: {
    content: boolean;
    summary: boolean; // 'error' in Qdrant
    title: boolean; // 'signature' in Qdrant
  };
  keywords_indexed: boolean;
}> {
  const qdrant = getQdrantClient();

  try {
    const collInfo = await qdrant.getCollection('codebase_chunks_768');

    const vectors = collInfo.config.params.vectors || {};
    const hasContent = 'content' in vectors;
    const hasError = 'error' in vectors; // Summary lane
    const hasSignature = 'signature' in vectors; // Title lane
    const hasKeywords = 'keywords' in (collInfo.payload_schema || {});

    return {
      ok: hasContent && hasError && hasSignature,
      qdrant_ok: true,
      vectors_available: {
        content: hasContent,
        summary: hasError,
        title: hasSignature,
      },
      keywords_indexed: hasKeywords,
    };
  } catch (err) {
    return {
      ok: false,
      qdrant_ok: false,
      vectors_available: {
        content: false,
        summary: false,
        title: false,
      },
      keywords_indexed: false,
    };
  }
}
