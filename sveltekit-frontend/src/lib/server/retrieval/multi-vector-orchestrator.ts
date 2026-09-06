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
    packetKey?: string;
    sourceRef?: string;
    symbolVersionId?: string;
    qdrantPointId?: string;
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
    const contentResponse = await qdrant.query(collection, {
      query: request.queryEmbedding,
      using: 'content',
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    contentResults = contentResponse.points
      .map((point) => {
        const payload = (point.payload ?? {}) as Record<string, any>;
        const packetKey = payload['packet_key'] ?? payload['symbol_version_id'];
        const sourceRef = payload['source_ref'];
        if (typeof packetKey !== 'string' || packetKey.length === 0) return null;
        if (typeof sourceRef !== 'string' || sourceRef.length === 0) return null;
        return {
          id: String(point.id),
          score: point.score,
          payload,
          packetKey,
          sourceRef,
          symbolVersionId: typeof payload['symbol_version_id'] === 'string' ? payload['symbol_version_id'] : undefined,
          qdrantPointId: String(point.id),
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null) as QdrantSearchResult[];

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
    const summaryResponse = await qdrant.query(collection, {
      query: request.queryEmbedding,
      using: 'error', // Remapped from 'error' to 'summary' semantics
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    summaryResults = summaryResponse.points
      .map((point) => {
        const payload = (point.payload ?? {}) as Record<string, any>;
        const packetKey = payload['packet_key'] ?? payload['symbol_version_id'];
        const sourceRef = payload['source_ref'];
        if (typeof packetKey !== 'string' || packetKey.length === 0) return null;
        if (typeof sourceRef !== 'string' || sourceRef.length === 0) return null;
        return {
          id: String(point.id),
          score: point.score,
          payload,
          packetKey,
          sourceRef,
          symbolVersionId: typeof payload['symbol_version_id'] === 'string' ? payload['symbol_version_id'] : undefined,
          qdrantPointId: String(point.id),
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

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
    const titleResponse = await qdrant.query(collection, {
      query: request.queryEmbedding,
      using: 'signature', // Remapped from 'signature' to 'title' semantics
      limit: config.topK,
      with_payload: true,
      score_threshold: 0.5,
    });

    titleResults = titleResponse.points
      .map((point) => {
        const payload = (point.payload ?? {}) as Record<string, any>;
        const packetKey = payload['packet_key'] ?? payload['symbol_version_id'];
        const sourceRef = payload['source_ref'];
        if (typeof packetKey !== 'string' || packetKey.length === 0) return null;
        if (typeof sourceRef !== 'string' || sourceRef.length === 0) return null;
        return {
          id: String(point.id),
          score: point.score,
          payload,
          packetKey,
          sourceRef,
          symbolVersionId: typeof payload['symbol_version_id'] === 'string' ? payload['symbol_version_id'] : undefined,
          qdrantPointId: String(point.id),
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

    titleMs = performance.now() - titleStart;
  } catch (err) {
    console.warn('[multi-vector] title lane failed:', err);
    titleMs = performance.now() - performance.now();
  }

  // ── Lane 4: Keywords Lexical ──────────────────────────────────────────────
  // Qdrant's Query Points API accepts vector/query objects here, not raw
  // natural-language text. The live 768 collections expose only the dense
  // named vectors content/error/signature and no keywords vector or BM25
  // payload index. Keep lexical ownership in the PostgreSQL FTS/BM25 lane;
  // this lane remains an explicit empty compatibility slot until a real sparse
  // Qdrant vector contract is provisioned and receipted.
  let keywordResults: QdrantSearchResult[] = [];
  let keywordsMs = 0;
  try {
    const keywordsStart = performance.now();
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
        packetKey: candidate.packetKey,
        sourceRef: candidate.sourceRef,
        symbolVersionId: candidate.symbolVersionId,
        qdrantPointId: candidate.qdrantPointId,
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
