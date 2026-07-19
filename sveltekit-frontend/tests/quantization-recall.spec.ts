// @vitest-environment node

/**
 * P2.5 — INT8 scalar quantization recall evaluation.
 *
 * Measures recall@K degradation when cosine similarity is computed over
 * Qdrant INT8 scalar quantized vectors vs exact float32 vectors.
 *
 * All tests are hermetic and deterministic — no network calls, no Qdrant.
 *
 * Logging pattern: assertions ARE the log.
 *   - Test name states the metric (e.g. "recall@10 ≥ 0.95").
 *   - toBeGreaterThanOrEqual threshold is the frozen regression floor.
 *   - A failing assertion prints the actual value, revealing the regression.
 *
 * Configuration under test: VECTOR_CONFIG.QDRANT_QUANTIZATION
 *   = { scalar: { type: 'int8', quantile: 0.99, always_ram: false } }
 *
 * Covers:
 *  - quantizeInt8: clipping, linear mapping, rounding, zero vector
 *  - estimateQuantile: single vector, multi-vector, extreme quantile values
 *  - cosineSimilarityFloat vs cosineSimilarityInt8: identical/orthogonal/parallel
 *  - recallAtK: perfect recall when K equals corpus size, degradation floor
 *  - Regression gate: recall@10 ≥ 0.95 on synthetic 384-dim corpus (5% max loss)
 *  - Regression gate: recall@5  ≥ 0.93 on synthetic 384-dim corpus
 *  - degradationAtK10 ≤ 0.05 (mirrors the ≥ 0.95 recall gate)
 *  - quantizationRecallReport wires both K gates in one call
 *  - Low-dimensional sanity: 4-dim corpus, k=1, top result must survive quantization
 */

import { describe, it, expect } from 'vitest';
import {
  quantizeInt8,
  estimateQuantile,
  cosineSimilarityFloat,
  cosineSimilarityInt8,
  recallAtK,
  quantizationRecallReport,
} from '../src/lib/server/vector/quantization-recall.js';

// ---------------------------------------------------------------------------
// Deterministic corpus generator
// ---------------------------------------------------------------------------

/**
 * Generate a reproducible corpus of unit-normalised 384-dim vectors.
 * Uses a simple LCG so output is identical on every run.
 */
function generateCorpus(n: number, dim: number, seed = 42): Float32Array[] {
  let s = seed;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    // Map to (-1, 1) before normalising
    return ((s >>> 0) / 0x100000000) * 2 - 1;
  };

  return Array.from({ length: n }, () => {
    const v = new Float32Array(dim);
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      v[i] = lcg();
      norm += v[i] * v[i];
    }
    const inv = 1 / (Math.sqrt(norm) || 1);
    for (let i = 0; i < dim; i++) v[i] *= inv;
    return v;
  });
}

// ---------------------------------------------------------------------------
// quantizeInt8 unit tests
// ---------------------------------------------------------------------------

describe('quantizeInt8', () => {
  it('maps +threshold to +127', () => {
    const v = new Float32Array([1.0, 0, 0]);
    const q = quantizeInt8(v, 1.0);
    expect(q[0]).toBe(127);
  });

  it('maps -threshold to -127', () => {
    const v = new Float32Array([-1.0, 0, 0]);
    const q = quantizeInt8(v, 1.0);
    expect(q[0]).toBe(-127);
  });

  it('maps zero to 0', () => {
    const v = new Float32Array([0, 0, 0]);
    const q = quantizeInt8(v, 1.0);
    expect(Array.from(q)).toEqual([0, 0, 0]);
  });

  it('clips values exceeding threshold', () => {
    const v = new Float32Array([2.0, -3.0]);
    const q = quantizeInt8(v, 1.0);
    expect(q[0]).toBe(127);
    expect(q[1]).toBe(-127);
  });

  it('produces output of the same length as input', () => {
    const v = new Float32Array(384).fill(0.5);
    const q = quantizeInt8(v, 1.0);
    expect(q.length).toBe(384);
  });

  it('all values are in [-127, 127]', () => {
    const corpus = generateCorpus(10, 384);
    const threshold = 0.5;
    for (const v of corpus) {
      const q = quantizeInt8(v, threshold);
      for (let i = 0; i < q.length; i++) {
        expect(q[i]).toBeGreaterThanOrEqual(-127);
        expect(q[i]).toBeLessThanOrEqual(127);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// estimateQuantile unit tests
// ---------------------------------------------------------------------------

describe('estimateQuantile', () => {
  it('returns 1.0 for empty input', () => {
    expect(estimateQuantile([], 0.99)).toBe(1.0);
  });

  it('99th percentile of a constant vector is the constant', () => {
    const v = new Float32Array(100).fill(0.5);
    expect(estimateQuantile([v], 0.99)).toBeCloseTo(0.5, 3);
  });

  it('threshold is always positive (takes absolute value)', () => {
    const v = new Float32Array([-0.8, 0.3, -0.1]);
    const t = estimateQuantile([v], 0.99);
    expect(t).toBeGreaterThan(0);
  });

  it('quantile=1.0 returns the maximum absolute value', () => {
    const v = new Float32Array([0.1, 0.9, 0.5]);
    const t = estimateQuantile([v], 1.0);
    expect(t).toBeCloseTo(0.9, 3);
  });

  it('quantile=0.5 returns the median absolute value across corpus', () => {
    const v = new Float32Array([0.1, 0.3, 0.7, 0.9]);
    const t = estimateQuantile([v], 0.5);
    // Sorted abs values: [0.1, 0.3, 0.7, 0.9], 50th percentile index = 2 → 0.7
    expect(t).toBeCloseTo(0.7, 3);
  });
});

// ---------------------------------------------------------------------------
// Similarity function sanity checks
// ---------------------------------------------------------------------------

describe('cosineSimilarityFloat', () => {
  it('identical vectors score 1.0', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarityFloat(v, v)).toBeCloseTo(1.0, 5);
  });

  it('orthogonal vectors score 0.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarityFloat(a, b)).toBeCloseTo(0.0, 5);
  });

  it('opposite vectors score -1.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarityFloat(a, b)).toBeCloseTo(-1.0, 5);
  });
});

describe('cosineSimilarityInt8', () => {
  it('identical int8 vectors score 1.0', () => {
    const v = new Int8Array([10, 20, 30]);
    expect(cosineSimilarityInt8(v, v)).toBeCloseTo(1.0, 5);
  });

  it('orthogonal int8 vectors score 0.0', () => {
    const a = new Int8Array([100, 0, 0]);
    const b = new Int8Array([0, 100, 0]);
    expect(cosineSimilarityInt8(a, b)).toBeCloseTo(0.0, 5);
  });
});

// ---------------------------------------------------------------------------
// recallAtK — structural guarantees
// ---------------------------------------------------------------------------

describe('recallAtK — structural guarantees', () => {
  it('recall is 1.0 when K equals corpus size (full ranking)', () => {
    const corpus = generateCorpus(10, 32, 1);
    const queries = generateCorpus(3, 32, 99);
    const threshold = estimateQuantile(corpus, 0.99);

    const result = recallAtK(corpus, queries, 10, threshold);

    // When K = corpus size, every element is in both top-K sets
    result.perQueryRecall.forEach(r => expect(r).toBeCloseTo(1.0, 5));
  });

  it('perQueryRecall length matches queries length', () => {
    const corpus = generateCorpus(20, 32, 2);
    const queries = generateCorpus(7, 32, 77);
    const threshold = estimateQuantile(corpus, 0.99);

    const result = recallAtK(corpus, queries, 5, threshold);

    expect(result.perQueryRecall).toHaveLength(7);
  });

  it('all per-query recall values are in [0, 1]', () => {
    const corpus = generateCorpus(50, 64, 3);
    const queries = generateCorpus(10, 64, 300);
    const threshold = estimateQuantile(corpus, 0.99);

    const result = recallAtK(corpus, queries, 10, threshold);

    result.perQueryRecall.forEach(r => {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  it('corpusSize and queryCount match input arrays', () => {
    const corpus = generateCorpus(30, 32, 4);
    const queries = generateCorpus(5, 32, 55);
    const threshold = estimateQuantile(corpus, 0.99);

    const result = recallAtK(corpus, queries, 5, threshold);

    expect(result.corpusSize).toBe(30);
    expect(result.queryCount).toBe(5);
    expect(result.k).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Regression gate — 384-dim synthetic corpus (matches production dimension)
// ---------------------------------------------------------------------------

describe('quantization recall — 384-dim regression gate', () => {
  // 200 corpus vectors, 20 queries, matches production collection scale
  // for a single-shard local eval.
  const CORPUS  = generateCorpus(200, 384, 7);
  const QUERIES = generateCorpus(20, 384, 13);

  it('recall@10 ≥ 0.95 at quantile=0.99 (≤ 5% top-10 miss rate)', () => {
    const report = quantizationRecallReport(CORPUS, QUERIES, 0.99);
    expect(report.k10.meanRecall).toBeGreaterThanOrEqual(0.95);
  });

  it('recall@5 ≥ 0.93 at quantile=0.99', () => {
    const report = quantizationRecallReport(CORPUS, QUERIES, 0.99);
    expect(report.k5.meanRecall).toBeGreaterThanOrEqual(0.93);
  });

  it('degradationAtK10 ≤ 0.05', () => {
    const report = quantizationRecallReport(CORPUS, QUERIES, 0.99);
    expect(report.degradationAtK10).toBeLessThanOrEqual(0.05);
  });

  it('degradationAtK5 ≤ 0.07', () => {
    const report = quantizationRecallReport(CORPUS, QUERIES, 0.99);
    expect(report.degradationAtK5).toBeLessThanOrEqual(0.07);
  });

  it('report wires both K results with matching threshold', () => {
    const report = quantizationRecallReport(CORPUS, QUERIES, 0.99);
    expect(report.k10.threshold).toBe(report.k5.threshold);
    expect(report.threshold).toBe(report.k10.threshold);
    expect(report.quantile).toBe(0.99);
  });
});

// ---------------------------------------------------------------------------
// Low-dimensional sanity: k=1 top result must survive quantization
// ---------------------------------------------------------------------------

describe('quantization recall — k=1 sanity (top result survives)', () => {
  it('nearest neighbour is preserved after INT8 quantization (4-dim, k=1)', () => {
    // Corpus: 5 vectors with clear distance separation
    const corpus = [
      new Float32Array([1, 0, 0, 0]),
      new Float32Array([0, 1, 0, 0]),
      new Float32Array([0, 0, 1, 0]),
      new Float32Array([0, 0, 0, 1]),
      new Float32Array([-1, 0, 0, 0]),
    ];
    // Query nearly identical to corpus[2]
    const queries = [new Float32Array([0.01, 0.01, 0.99, 0.01])];
    const threshold = estimateQuantile(corpus, 0.99);

    const result = recallAtK(corpus, queries, 1, threshold);

    expect(result.perQueryRecall[0]).toBe(1.0);
  });
});
