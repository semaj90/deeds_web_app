/**
 * Cross-Ranker Unit & Integration Tests
 * Tests all stages: semantic normalization, BM25, topology, Naive Bayes, blending, persistence
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import {
  executeUnifiedCrossRanking,
  CrossRankerTestHelpers,
  type CrossRankerInput,
  type CrossRankerDependencies,
  type RerankedResult
} from '../cross-ranker';

// ═══════════════════════════════════════════════════════════════
// Mock Setup
// ═══════════════════════════════════════════════════════════════

const mockDb: Partial<Pool> = {
  query: vi.fn()
};

const mockDependencies: CrossRankerDependencies = {
  db: mockDb as Pool,
  neo4j_enabled: false,
  naive_bayes_weights: {
    default_confidence: 0.5,
    high_semantic: 0.8,
    low_semantic: 0.3,
    sparse_bm25: 0.4
  },
  blend_weights: {
    semantic: 0.40,
    lexical: 0.30,
    topology: 0.20,
    naive_bayes: 0.10
  }
};

// ═══════════════════════════════════════════════════════════════
// Test Suite: Semantic Score Normalization
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: Semantic Score Normalization', () => {
  it('should normalize scores to [0,1] range', () => {
    const candidates = [
      { packet_key: 'p1', qdrant_score: 0.8, point_id: '1' },
      { packet_key: 'p2', qdrant_score: 0.5, point_id: '2' },
      { packet_key: 'p3', qdrant_score: 0.3, point_id: '3' }
    ];

    const normalized = CrossRankerTestHelpers.normalizeSemanticScores(candidates);

    expect(normalized.get('p1')).toBe(1.0); // max
    expect(normalized.get('p2')).toBe(0.5); // mid
    expect(normalized.get('p3')).toBe(0.0); // min
  });

  it('should handle single candidate (zero range)', () => {
    const candidates = [
      { packet_key: 'p1', qdrant_score: 0.5, point_id: '1' }
    ];

    const normalized = CrossRankerTestHelpers.normalizeSemanticScores(candidates);

    expect(normalized.get('p1')).toBe(0.5); // normalized to itself
  });

  it('should handle identical scores', () => {
    const candidates = [
      { packet_key: 'p1', qdrant_score: 0.5, point_id: '1' },
      { packet_key: 'p2', qdrant_score: 0.5, point_id: '2' },
      { packet_key: 'p3', qdrant_score: 0.5, point_id: '3' }
    ];

    const normalized = CrossRankerTestHelpers.normalizeSemanticScores(candidates);

    expect(normalized.get('p1')).toBe(0.5);
    expect(normalized.get('p2')).toBe(0.5);
    expect(normalized.get('p3')).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: BM25 Scoring
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: BM25 Scoring (Postgres FTS)', () => {
  it('should fetch BM25 scores for packets', async () => {
    const mockQueryResult = {
      rows: [
        { packet_key: 'p1', bm25_score: 2.5 },
        { packet_key: 'p2', bm25_score: 1.2 },
        { packet_key: 'p3', bm25_score: 0.8 }
      ]
    };

    (mockDb.query as any).mockResolvedValueOnce(mockQueryResult);

    const scores = await CrossRankerTestHelpers.fetchBm25Scores(
      mockDb as Pool,
      ['p1', 'p2', 'p3'],
      'test query'
    );

    expect(scores.size).toBe(3);
    expect(scores.get('p1')).toBe(1.0); // normalized: 2.5 / 2.5
    expect(scores.get('p2')).toBeCloseTo(0.48, 2); // 1.2 / 2.5
    expect(scores.get('p3')).toBeCloseTo(0.32, 2); // 0.8 / 2.5
  });

  it('should handle missing BM25 hits (zero scores)', async () => {
    const mockQueryResult = { rows: [] };

    (mockDb.query as any).mockResolvedValueOnce(mockQueryResult);

    const scores = await CrossRankerTestHelpers.fetchBm25Scores(
      mockDb as Pool,
      ['p1', 'p2'],
      'no matches query'
    );

    expect(scores.get('p1')).toBe(0);
    expect(scores.get('p2')).toBe(0);
  });

  it('should gracefully handle database errors', async () => {
    (mockDb.query as any).mockRejectedValueOnce(new Error('Connection failed'));

    const scores = await CrossRankerTestHelpers.fetchBm25Scores(
      mockDb as Pool,
      ['p1'],
      'query'
    );

    expect(scores.get('p1')).toBe(0); // fallback
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: Topology Scoring
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: Topology / PageRank Scoring', () => {
  it('should fetch topology scores from Postgres view', async () => {
    const mockQueryResult = {
      rows: [
        { packet_key: 'p1', page_rank_score: 5.0 },
        { packet_key: 'p2', page_rank_score: 3.0 }
      ]
    };

    (mockDb.query as any).mockResolvedValueOnce(mockQueryResult);

    const scores = await CrossRankerTestHelpers.fetchTopologyScores(
      mockDb as Pool,
      ['p1', 'p2', 'p3']
    );

    expect(scores.get('p1')).toBe(1.0); // normalized
    expect(scores.get('p2')).toBe(0.6); // 3.0 / 5.0
    expect(scores.get('p3')).toBeLessThanOrEqual(0.5); // fallback (average)
  });

  it('should use fallback scores when Neo4j unavailable', async () => {
    (mockDb.query as any).mockRejectedValueOnce(new Error('View not found'));

    const scores = await CrossRankerTestHelpers.fetchTopologyScores(
      mockDb as Pool,
      ['p1', 'p2'],
      false
    );

    expect(scores.get('p1')).toBe(0.5); // uniform fallback
    expect(scores.get('p2')).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: Naive Bayes Scoring
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: Naive Bayes Confidence', () => {
  it('should compute confidence based on semantic score', async () => {
    const mockQueryResult = {
      rows: [
        { packet_key: 'p1', has_summary: 1, has_source_ref: true },
        { packet_key: 'p2', has_summary: 0, has_source_ref: false }
      ]
    };

    (mockDb.query as any).mockResolvedValueOnce(mockQueryResult);

    const semantic = new Map([
      ['p1', 0.9], // high semantic
      ['p2', 0.2]  // low semantic
    ]);
    const bm25 = new Map([
      ['p1', 0.5],
      ['p2', 0.1]
    ]);

    const scores = await CrossRankerTestHelpers.computeNaiveBayesScores(
      mockDb as Pool,
      ['p1', 'p2'],
      semantic,
      bm25
    );

    expect(scores.get('p1')).toBeGreaterThan(0.7); // high confidence
    expect(scores.get('p2')).toBeLessThan(0.5);   // low confidence
  });

  it('should gracefully fallback to semantic score on error', async () => {
    (mockDb.query as any).mockRejectedValueOnce(new Error('Query failed'));

    const semantic = new Map([['p1', 0.8]]);
    const bm25 = new Map([['p1', 0.5]]);

    const scores = await CrossRankerTestHelpers.computeNaiveBayesScores(
      mockDb as Pool,
      ['p1'],
      semantic,
      bm25
    );

    expect(scores.get('p1')).toBe(0.8); // fallback to semantic
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: Score Blending
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: Score Blending', () => {
  it('should blend scores with default weights', () => {
    const semantic = new Map([['p1', 1.0]]);
    const lexical = new Map([['p1', 0.0]]);
    const topology = new Map([['p1', 0.5]]);
    const bayes = new Map([['p1', 1.0]]);

    const blended = CrossRankerTestHelpers.blendScores(
      ['p1'],
      semantic,
      lexical,
      topology,
      bayes
    );

    const result = blended.get('p1');
    expect(result).toBeDefined();
    if (result) {
      // 0.40 * 1.0 + 0.30 * 0.0 + 0.20 * 0.5 + 0.10 * 1.0 = 0.60
      expect(result.score).toBeCloseTo(0.60, 2);
    }
  });

  it('should use custom weights if provided', () => {
    const semantic = new Map([['p1', 0.8]]);
    const lexical = new Map([['p1', 0.2]]);
    const topology = new Map([['p1', 0.5]]);
    const bayes = new Map([['p1', 0.6]]);

    const customWeights = {
      semantic: 0.5,
      lexical: 0.2,
      topology: 0.2,
      naive_bayes: 0.1
    };

    const blended = CrossRankerTestHelpers.blendScores(
      ['p1'],
      semantic,
      lexical,
      topology,
      bayes,
      customWeights
    );

    const result = blended.get('p1');
    expect(result).toBeDefined();
    if (result) {
      // 0.5 * 0.8 + 0.2 * 0.2 + 0.2 * 0.5 + 0.1 * 0.6 = 0.56
      expect(result.score).toBeCloseTo(0.56, 2);
    }
  });

  it('should include all component scores in result', () => {
    const semantic = new Map([['p1', 0.9]]);
    const lexical = new Map([['p1', 0.4]]);
    const topology = new Map([['p1', 0.7]]);
    const bayes = new Map([['p1', 0.5]]);

    const blended = CrossRankerTestHelpers.blendScores(
      ['p1'],
      semantic,
      lexical,
      topology,
      bayes
    );

    const result = blended.get('p1');
    expect(result?.components).toEqual({
      semantic: 0.9,
      lexical: 0.4,
      topology: 0.7,
      naive_bayes: 0.5
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: End-to-End Execution
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: End-to-End Execution', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('should execute complete ranking pipeline', async () => {
    // Mock all database calls
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })  // BM25
      .mockResolvedValueOnce({ rows: [] })  // Topology
      .mockResolvedValueOnce({ rows: [] })  // Naive Bayes metadata
      .mockResolvedValueOnce({ rows: [] })  // Evidence metadata
      .mockResolvedValueOnce({ rows: [] }); // Persistence (semantic_top_k)

    const input: CrossRankerInput = {
      query: 'test query',
      query_id: 'test-query-1',
      qdrant_top_k: [
        { packet_key: 'p1', qdrant_score: 0.9, point_id: '1' },
        { packet_key: 'p2', qdrant_score: 0.7, point_id: '2' },
        { packet_key: 'p3', qdrant_score: 0.5, point_id: '3' }
      ],
      limit: 10,
      include_evidence: true
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.query_id).toBe('test-query-1');
    expect(result.query).toBe('test query');
    expect(result.ranked_results).toHaveLength(3);
    expect(result.metrics.total_candidates).toBe(3);
    expect(result.metrics.ranked_candidates).toBe(3);
    expect(result.execution_trace.qdrant_stage).toBe('COMPLETE');
    expect(result.execution_trace.bm25_stage).toBe('COMPLETE');
    expect(result.execution_trace.pagerank_stage).toBe('COMPLETE');
    expect(result.execution_trace.bayes_stage).toBe('COMPLETE');
    expect(result.execution_trace.persistence_stage).toBe('COMPLETE');
  });

  it('should sort results by rerank score descending', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: [
        { packet_key: 'p1', qdrant_score: 0.3 },
        { packet_key: 'p2', qdrant_score: 0.9 },
        { packet_key: 'p3', qdrant_score: 0.6 }
      ]
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    // Should be sorted by rerank_score descending
    expect(result.ranked_results[0].rerank_score).toBeGreaterThanOrEqual(
      result.ranked_results[1].rerank_score
    );
    expect(result.ranked_results[1].rerank_score).toBeGreaterThanOrEqual(
      result.ranked_results[2].rerank_score
    );
  });

  it('should respect limit parameter', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: Array.from({ length: 20 }, (_, i) => ({
        packet_key: `p${i}`,
        qdrant_score: 1 - i * 0.05
      })),
      limit: 5
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.ranked_results).toHaveLength(5);
  });

  it('should compute score distribution metrics', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: [
        { packet_key: 'p1', qdrant_score: 0.1 },
        { packet_key: 'p2', qdrant_score: 0.5 },
        { packet_key: 'p3', qdrant_score: 0.9 }
      ]
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.metrics.score_distribution.min).toBeLessThanOrEqual(
      result.metrics.score_distribution.max
    );
    expect(result.metrics.score_distribution.mean).toBeGreaterThanOrEqual(
      result.metrics.score_distribution.min
    );
    expect(result.metrics.score_distribution.mean).toBeLessThanOrEqual(
      result.metrics.score_distribution.max
    );
  });

  it('should include stage timings in metrics', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: [
        { packet_key: 'p1', qdrant_score: 0.8 }
      ]
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.metrics.stage_timings.semantic_normalization).toBeGreaterThanOrEqual(0);
    expect(result.metrics.stage_timings.bm25_fetch).toBeGreaterThanOrEqual(0);
    expect(result.metrics.stage_timings.topology_fetch).toBeGreaterThanOrEqual(0);
    expect(result.metrics.stage_timings.bayes_compute).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Test Suite: Error Handling & Robustness
// ═══════════════════════════════════════════════════════════════

describe('Cross-Ranker: Error Handling', () => {
  it('should handle empty qdrant_top_k', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: []
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.ranked_results).toHaveLength(0);
    expect(result.metrics.score_distribution.min).toBe(0);
  });

  it('should handle database connection errors gracefully', async () => {
    (mockDb.query as any).mockRejectedValueOnce(new Error('Connection lost'));

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: [{ packet_key: 'p1', qdrant_score: 0.8 }]
    };

    await expect(executeUnifiedCrossRanking(input, mockDependencies)).rejects.toThrow();
  });

  it('should include generated query_id if not provided', async () => {
    (mockDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const input: CrossRankerInput = {
      query: 'test',
      qdrant_top_k: [{ packet_key: 'p1', qdrant_score: 0.8 }]
      // No query_id provided
    };

    const result = await executeUnifiedCrossRanking(input, mockDependencies);

    expect(result.query_id).toBeDefined();
    expect(result.query_id).toMatch(/^query:/);
  });
});
