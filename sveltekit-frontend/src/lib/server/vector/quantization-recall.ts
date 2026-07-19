/**
 * Quantization recall evaluation.
 *
 * Models Qdrant's INT8 scalar quantization and measures how much recall is
 * lost when cosine similarity is computed over quantized vectors rather than
 * the original float32 vectors.
 *
 * Qdrant INT8 scalar quantization algorithm (from Qdrant docs):
 *   1. Collect all values across all vectors in the collection.
 *   2. Find the `quantile` percentile (e.g. 0.99) of |values| → clip threshold.
 *   3. Clip each value to [-threshold, +threshold].
 *   4. Linearly map [-threshold, +threshold] → [-128, 127] (signed int8).
 *
 * This module provides:
 *   - `quantizeInt8(vector, threshold)` — quantize a single vector.
 *   - `estimateQuantile(vectors, quantile)` — calibrate threshold from corpus.
 *   - `cosineSimilarityFloat(a, b)` — exact float32 cosine.
 *   - `cosineSimilarityInt8(a, b)` — int8 dot-product cosine (no dequant).
 *   - `recallAtK(corpus, queries, k, threshold)` — recall@K evaluation.
 *   - `quantizationRecallReport(corpus, queries, k, quantile)` — full report.
 *
 * No external dependencies — fully hermetic and testable without Qdrant.
 */

// ---------------------------------------------------------------------------
// Quantization primitives
// ---------------------------------------------------------------------------

/**
 * Estimate the quantile of |values| across a flat corpus.
 * Mirrors Qdrant's per-collection calibration step.
 *
 * @param vectors  Array of float32 vectors (all same dimension).
 * @param quantile Value in (0, 1]. Default 0.99 matches VECTOR_CONFIG.
 */
export function estimateQuantile(vectors: Float32Array[], quantile: number): number {
  if (vectors.length === 0) return 1.0;

  const absValues: number[] = [];
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) {
      absValues.push(Math.abs(v[i]));
    }
  }

  absValues.sort((a, b) => a - b);
  const idx = Math.min(
    Math.floor(quantile * absValues.length),
    absValues.length - 1,
  );
  return absValues[idx] || 1.0;
}

/**
 * Quantize one float32 vector to signed int8 using Qdrant's scalar scheme.
 *
 * Values outside [-threshold, +threshold] are clipped; the linear mapping is:
 *   int8_val = round( value / threshold * 127 )
 *
 * Returns Int8Array of the same length as input.
 */
export function quantizeInt8(vector: Float32Array, threshold: number): Int8Array {
  const out = new Int8Array(vector.length);
  const scale = 127 / (threshold || 1);
  for (let i = 0; i < vector.length; i++) {
    const clipped = Math.max(-threshold, Math.min(threshold, vector[i]));
    out[i] = Math.round(clipped * scale) as number;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Similarity functions
// ---------------------------------------------------------------------------

/** Exact float32 cosine similarity. */
export function cosineSimilarityFloat(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
}

/** Int8 cosine similarity — dot product over integer values, same formula. */
export function cosineSimilarityInt8(a: Int8Array, b: Int8Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Return indices of the top-K elements in `scores`, descending. */
export function topKIndices(scores: number[], k: number): number[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(x => x.i);
}

// ---------------------------------------------------------------------------
// Recall@K evaluation
// ---------------------------------------------------------------------------

export interface RecallResult {
  /** Mean recall@K across all queries. */
  meanRecall: number;
  /** Per-query recall values (same order as `queries`). */
  perQueryRecall: number[];
  /** K used for evaluation. */
  k: number;
  /** Number of corpus vectors. */
  corpusSize: number;
  /** Number of query vectors. */
  queryCount: number;
  /** Quantile threshold used (absolute value clip point). */
  threshold: number;
}

/**
 * Measure recall@K degradation from INT8 scalar quantization.
 *
 * For each query:
 *   1. Rank corpus by exact float32 cosine → ground-truth top-K set.
 *   2. Rank quantized corpus by int8 cosine → quantized top-K set.
 *   3. recall = |intersection| / K
 *
 * @param corpus   Float32 corpus vectors.
 * @param queries  Float32 query vectors.
 * @param k        Top-K for recall.
 * @param threshold Clip threshold from `estimateQuantile`.
 */
export function recallAtK(
  corpus: Float32Array[],
  queries: Float32Array[],
  k: number,
  threshold: number,
): RecallResult {
  const quantizedCorpus = corpus.map(v => quantizeInt8(v, threshold));

  const perQueryRecall: number[] = queries.map(q => {
    const qInt8 = quantizeInt8(q, threshold);

    // Ground truth: float32 ranking
    const floatScores = corpus.map(c => cosineSimilarityFloat(q, c));
    const groundTruth = new Set(topKIndices(floatScores, k));

    // Quantized ranking
    const int8Scores = quantizedCorpus.map(c => cosineSimilarityInt8(qInt8, c));
    const quantizedTop = topKIndices(int8Scores, k);

    const hits = quantizedTop.filter(i => groundTruth.has(i)).length;
    return hits / k;
  });

  const meanRecall = perQueryRecall.reduce((s, r) => s + r, 0) / (perQueryRecall.length || 1);

  return {
    meanRecall,
    perQueryRecall,
    k,
    corpusSize: corpus.length,
    queryCount: queries.length,
    threshold,
  };
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export interface QuantizationRecallReport {
  k10: RecallResult;
  k5: RecallResult;
  /** Degradation = 1 − meanRecall (fraction of ground-truth top-K missed). */
  degradationAtK10: number;
  degradationAtK5: number;
  quantile: number;
  threshold: number;
}

/**
 * Run the full P2.5 recall evaluation at both K=5 and K=10.
 *
 * @param corpus    Float32 corpus vectors (same dimension as queries).
 * @param queries   Float32 query vectors.
 * @param quantile  Qdrant quantile setting (default 0.99 per VECTOR_CONFIG).
 */
export function quantizationRecallReport(
  corpus: Float32Array[],
  queries: Float32Array[],
  quantile = 0.99,
): QuantizationRecallReport {
  const threshold = estimateQuantile(corpus, quantile);
  const k10 = recallAtK(corpus, queries, 10, threshold);
  const k5  = recallAtK(corpus, queries,  5, threshold);

  return {
    k10,
    k5,
    degradationAtK10: 1 - k10.meanRecall,
    degradationAtK5:  1 - k5.meanRecall,
    quantile,
    threshold,
  };
}
