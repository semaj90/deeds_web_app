#!/usr/bin/env node
/**
 * Phase 2F: Evaluation Metrics for Multi-Signal Retrieval
 *
 * Computes precision@K, MRR, NDCG, recall@K, and MAP metrics
 * for evaluating dense, lexical, and RRF-fused retrieval performance.
 */

export interface EvaluationMetrics {
  precision_at_5: number;
  precision_at_10: number;
  recall_at_5: number;
  recall_at_10: number;
  recall_at_20: number;
  mean_reciprocal_rank: number; // MRR
  normalized_discounted_cumulative_gain_10: number; // NDCG@10
  mean_average_precision: number; // MAP
}

export interface EvaluationResult {
  query_id: string;
  query: string;
  signal: 'dense' | 'lexical' | 'rrf'; // Which signal variant
  retrieved_count: number;
  relevant_count: number;
  metrics: EvaluationMetrics;
  top_k_results: Array<{
    rank: number;
    packet_key: string;
    relevance: number; // Ground truth relevance (0.0-1.0)
    retrieved_rank?: number; // Where it actually appeared (if retrieved)
  }>;
}

export interface EvaluationAggregates {
  signal: string;
  num_queries: number;
  avg_precision_at_5: number;
  avg_precision_at_10: number;
  avg_recall_at_5: number;
  avg_recall_at_10: number;
  avg_recall_at_20: number;
  avg_mrr: number;
  avg_ndcg_10: number;
  avg_map: number;
  std_mrr: number;
  p50_mrr: number;
  p95_mrr: number;
}

/**
 * Compute precision@K: (relevant items in top-K) / K
 */
export function computePrecisionAtK(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>, // packet_key → relevance
  k: number
): number {
  if (k <= 0) return 0;

  const topK = retrieved.slice(0, k);
  const relevant = topK.filter(r => {
    const gt = groundTruth.get(r.packet_key);
    return gt !== undefined && gt > 0; // Relevant if ground truth > 0
  }).length;

  return relevant / k;
}

/**
 * Compute recall@K: (relevant items in top-K) / (total relevant items)
 */
export function computeRecallAtK(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>,
  k: number
): number {
  const totalRelevant = Array.from(groundTruth.values()).filter(r => r > 0).length;
  if (totalRelevant === 0) return 0;

  const topK = retrieved.slice(0, k);
  const relevantInTopK = topK.filter(r => {
    const gt = groundTruth.get(r.packet_key);
    return gt !== undefined && gt > 0;
  }).length;

  return relevantInTopK / totalRelevant;
}

/**
 * Compute MRR (Mean Reciprocal Rank):
 * 1 / (rank of first relevant item)
 */
export function computeMRR(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>
): number {
  for (let i = 0; i < retrieved.length; i++) {
    const item = retrieved[i];
    const gt = groundTruth.get(item.packet_key);
    if (gt !== undefined && gt > 0) {
      return 1 / (i + 1); // rank is 1-indexed
    }
  }
  return 0; // No relevant items found
}

/**
 * Compute NDCG@K (Normalized Discounted Cumulative Gain):
 * DCG@K / IDCG@K
 *
 * DCG = Σ (gain_i / log2(i+1))
 * gain_i = relevance_score [0,1]
 */
export function computeNDCGAtK(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>,
  k: number
): number {
  const topK = retrieved.slice(0, k);

  // Compute DCG
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const item = topK[i];
    const relevance = groundTruth.get(item.packet_key) ?? 0;
    dcg += relevance / Math.log2(i + 2); // i+2 because log2(1) = 0
  }

  // Compute IDCG (ideal DCG if all items were ranked by relevance)
  const sortedRelevances = Array.from(groundTruth.values())
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < sortedRelevances.length; i++) {
    idcg += sortedRelevances[i] / Math.log2(i + 2);
  }

  if (idcg === 0) return 0;
  return dcg / idcg;
}

/**
 * Compute MAP (Mean Average Precision):
 * Average of precision values at each relevant item
 */
export function computeMAP(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>
): number {
  let apSum = 0;
  let relevantCount = 0;
  let relevantRetrieved = 0;

  for (let i = 0; i < retrieved.length; i++) {
    const item = retrieved[i];
    const gt = groundTruth.get(item.packet_key);

    if (gt !== undefined && gt > 0) {
      relevantRetrieved++;
      const precisionAtI = relevantRetrieved / (i + 1);
      apSum += precisionAtI;
    }
  }

  // Count total relevant items in ground truth
  const totalRelevant = Array.from(groundTruth.values()).filter(r => r > 0).length;
  if (totalRelevant === 0) return 0;

  return apSum / totalRelevant;
}

/**
 * Compute all metrics for a single query result
 */
export function computeMetricsForQuery(
  retrieved: { packet_key: string; rank: number }[],
  groundTruth: Map<string, number>
): EvaluationMetrics {
  return {
    precision_at_5: computePrecisionAtK(retrieved, groundTruth, 5),
    precision_at_10: computePrecisionAtK(retrieved, groundTruth, 10),
    recall_at_5: computeRecallAtK(retrieved, groundTruth, 5),
    recall_at_10: computeRecallAtK(retrieved, groundTruth, 10),
    recall_at_20: computeRecallAtK(retrieved, groundTruth, 20),
    mean_reciprocal_rank: computeMRR(retrieved, groundTruth),
    normalized_discounted_cumulative_gain_10: computeNDCGAtK(retrieved, groundTruth, 10),
    mean_average_precision: computeMAP(retrieved, groundTruth),
  };
}

/**
 * Aggregate metrics across multiple queries
 */
export function aggregateMetrics(
  results: EvaluationResult[]
): EvaluationAggregates {
  if (results.length === 0) {
    return {
      signal: 'unknown',
      num_queries: 0,
      avg_precision_at_5: 0,
      avg_precision_at_10: 0,
      avg_recall_at_5: 0,
      avg_recall_at_10: 0,
      avg_recall_at_20: 0,
      avg_mrr: 0,
      avg_ndcg_10: 0,
      avg_map: 0,
      std_mrr: 0,
      p50_mrr: 0,
      p95_mrr: 0,
    };
  }

  const signal = results[0].signal;
  const metrics = results.map(r => r.metrics);

  // Compute averages
  const avgPrecisionAt5 = metrics.reduce((sum, m) => sum + m.precision_at_5, 0) / results.length;
  const avgPrecisionAt10 = metrics.reduce((sum, m) => sum + m.precision_at_10, 0) / results.length;
  const avgRecallAt5 = metrics.reduce((sum, m) => sum + m.recall_at_5, 0) / results.length;
  const avgRecallAt10 = metrics.reduce((sum, m) => sum + m.recall_at_10, 0) / results.length;
  const avgRecallAt20 = metrics.reduce((sum, m) => sum + m.recall_at_20, 0) / results.length;
  const avgMRR = metrics.reduce((sum, m) => sum + m.mean_reciprocal_rank, 0) / results.length;
  const avgNDCG10 = metrics.reduce((sum, m) => sum + m.normalized_discounted_cumulative_gain_10, 0) / results.length;
  const avgMAP = metrics.reduce((sum, m) => sum + m.mean_average_precision, 0) / results.length;

  // Compute MRR statistics
  const mrrs = metrics.map(m => m.mean_reciprocal_rank).sort((a, b) => a - b);
  const mrrMean = avgMRR;
  const mrrVariance = metrics.reduce((sum, m) => sum + Math.pow(m.mean_reciprocal_rank - mrrMean, 2), 0) / results.length;
  const stdMRR = Math.sqrt(mrrVariance);
  const p50MRR = mrrs[Math.floor(mrrs.length * 0.5)];
  const p95MRR = mrrs[Math.floor(mrrs.length * 0.95)];

  return {
    signal,
    num_queries: results.length,
    avg_precision_at_5: avgPrecisionAt5,
    avg_precision_at_10: avgPrecisionAt10,
    avg_recall_at_5: avgRecallAt5,
    avg_recall_at_10: avgRecallAt10,
    avg_recall_at_20: avgRecallAt20,
    avg_mrr: avgMRR,
    avg_ndcg_10: avgNDCG10,
    avg_map: avgMAP,
    std_mrr: stdMRR,
    p50_mrr: p50MRR,
    p95_mrr: p95MRR,
  };
}

/**
 * Format metrics for console output
 */
export function formatMetricsForConsole(
  agg: EvaluationAggregates
): string {
  return `
📊 Evaluation Results: ${agg.signal.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Queries tested:        ${agg.num_queries}

Precision:
  @5:  ${(agg.avg_precision_at_5 * 100).toFixed(2)}%
  @10: ${(agg.avg_precision_at_10 * 100).toFixed(2)}%

Recall:
  @5:  ${(agg.avg_recall_at_5 * 100).toFixed(2)}%
  @10: ${(agg.avg_recall_at_10 * 100).toFixed(2)}%
  @20: ${(agg.avg_recall_at_20 * 100).toFixed(2)}%

Ranking Quality:
  MRR (Mean Reciprocal Rank):          ${agg.avg_mrr.toFixed(4)}
    Std Dev:  ${agg.std_mrr.toFixed(4)}
    P50:      ${agg.p50_mrr.toFixed(4)}
    P95:      ${agg.p95_mrr.toFixed(4)}

  NDCG@10:  ${agg.avg_ndcg_10.toFixed(4)}
  MAP:      ${agg.avg_map.toFixed(4)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Compare metrics across multiple signals
 */
export function compareSignals(
  results: Map<string, EvaluationAggregates>
): string {
  const signals = Array.from(results.values());

  if (signals.length === 0) return 'No results to compare';

  let output = '\n🔄 Cross-Signal Comparison\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  output += 'Precision@10:\n';
  for (const sig of signals) {
    output += `  ${sig.signal.padEnd(10)}: ${(sig.avg_precision_at_10 * 100).toFixed(2)}%\n`;
  }

  output += '\nRecall@20:\n';
  for (const sig of signals) {
    output += `  ${sig.signal.padEnd(10)}: ${(sig.avg_recall_at_20 * 100).toFixed(2)}%\n`;
  }

  output += '\nNDCG@10:\n';
  for (const sig of signals) {
    output += `  ${sig.signal.padEnd(10)}: ${sig.avg_ndcg_10.toFixed(4)}\n`;
  }

  output += '\nMRR:\n';
  for (const sig of signals) {
    output += `  ${sig.signal.padEnd(10)}: ${sig.avg_mrr.toFixed(4)}\n`;
  }

  output += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  // Find best performer for each metric
  const precisionWinner = signals.reduce((best, s) => s.avg_precision_at_10 > best.avg_precision_at_10 ? s : best);
  const recallWinner = signals.reduce((best, s) => s.avg_recall_at_20 > best.avg_recall_at_20 ? s : best);
  const ndcgWinner = signals.reduce((best, s) => s.avg_ndcg_10 > best.avg_ndcg_10 ? s : best);

  output += `\n🏆 Winners:\n`;
  output += `  Precision@10: ${precisionWinner.signal} (${(precisionWinner.avg_precision_at_10 * 100).toFixed(2)}%)\n`;
  output += `  Recall@20:    ${recallWinner.signal} (${(recallWinner.avg_recall_at_20 * 100).toFixed(2)}%)\n`;
  output += `  NDCG@10:      ${ndcgWinner.signal} (${ndcgWinner.avg_ndcg_10.toFixed(4)})\n`;

  return output;
}
