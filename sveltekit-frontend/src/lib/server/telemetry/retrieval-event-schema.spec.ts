import { describe, expect, it } from 'vitest';

import {
  RetrievalEventSchema,
  RRFFusionResultSchema,
  RetrievalStageResultSchema,
} from './retrieval-event-schema.js';

describe('retrieval-event-schema lineage', () => {
  it('accepts lane-aware vector stage results', () => {
    const parsed = RetrievalStageResultSchema.parse({
      score: 0.91,
      packet_key: 'packet:1',
      rank: 1,
      embedding_lane: 'dense_384',
      embedding_status: 'ACTIVE',
      projection_version: 'atlas-embeddinggemma-direct-slice384-v1',
    });

    expect(parsed.embedding_lane).toBe('dense_384');
  });

  it('accepts split dense sources in RRF fusion results', () => {
    const parsed = RRFFusionResultSchema.parse({
      score: 0.87,
      packet_key: 'packet:2',
      sources: ['qdrant_384', 'bm25'],
    });

    expect(parsed.sources).toContain('qdrant_384');
  });

  it('builds a retrieval event with explicit query lane lineage', () => {
    const parsed = RetrievalEventSchema.parse({
      query_id: '123e4567-e89b-42d3-a456-426614174000',
      timestamp: new Date('2026-07-27T00:00:00Z'),
      query_text: 'hybrid retrieval',
      embedding_model: 'embeddinggemma:latest',
      query_embedding_dim: 384,
      query_embedding_lane: 'dense_384',
      query_embedding_status: 'ACTIVE',
      query_projection_version: 'atlas-embeddinggemma-direct-slice384-v1',
      vector_lane_latency_ms: 10,
      vector_lane_top_k: 1,
      vector_lane_results: [{
        score: 0.91,
        packet_key: 'packet:1',
        rank: 1,
        embedding_lane: 'dense_384',
      }],
      bm25_latency_ms: 4,
      bm25_top_k: 1,
      bm25_results: [{
        score: 0.7,
        packet_key: 'packet:1',
        rank: 1,
      }],
      ast_latency_ms: 2,
      ast_results: [{
        score: 0.6,
        packet_key: 'packet:1',
        rank: 1,
      }],
      rrf_latency_ms: 1,
      rrf_results: [{
        score: 0.89,
        packet_key: 'packet:1',
        sources: ['qdrant_384', 'bm25'],
      }],
      selected_packet_key: 'packet:1',
      final_score: 0.89,
      total_latency_ms: 17,
      cache_hit: false,
      gpu_memory_used_mb: 0,
    });

    expect(parsed.query_embedding_lane).toBe('dense_384');
    expect(parsed.rrf_results[0]?.sources).toContain('qdrant_384');
  });
});
