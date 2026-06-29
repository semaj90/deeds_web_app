/**
 * retrieval-metrics.ts — GPU acceleration lane measurement
 *
 * Captures end-to-end retrieval latency (Qdrant ANN → TurboVec rerank → final result)
 * and accuracy metrics (recall@K, MRR, NDCG) for Karpathy blended ranking.
 *
 * Stores in Redis `retrieval:metrics:*` keys (TTL 30 days) and Postgres `retrieval_eval_runs`.
 */

import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client.js';
import { retrievalEvalRuns } from '$lib/server/db/schema-postgres.js';

export interface RetrievalMetrics {
  query: string;
  queryEmbedding?: number[];
  queryHash: string;

  // Qdrant ANN stage
  qdrantLatencyMs: number;
  qdrantCandidateCount: number;

  // TurboVec rerank stage (if enabled)
  turbovecLatencyMs?: number;
  turbovecUsed: boolean;
  turbovecFallback: boolean;

  // Karpathy blend stage
  karphathyLatencyMs?: number;
  karphathyUsed: boolean;

  // Final result
  totalLatencyMs: number;
  finalCandidateCount: number;
  finalTopK: Array<{ id: string; score: number; rank: number }>;

  // Accuracy (if gold standard provided)
  recall?: number; // fraction of gold docs in top-K
  mrr?: number;    // mean reciprocal rank
  ndcg?: number;   // normalized discounted cumulative gain

  // Context
  userId?: string;
  sessionId?: string;
  timestamp: number;
  branch: string; // 'qdrant-only', 'turbovec-enabled', 'karpathy-blend'
}

export async function recordRetrievalMetrics(metrics: RetrievalMetrics): Promise<void> {
  const redis = await getRedis();

  // Redis: per-query metrics for live dashboarding
  const key = `retrieval:metrics:${metrics.queryHash}:${metrics.branch}`;
  await redis.setex(
    key,
    30 * 24 * 60 * 60, // 30 days TTL
    JSON.stringify({
      latencyMs: metrics.totalLatencyMs,
      qdrantMs: metrics.qdrantLatencyMs,
      turbovecMs: metrics.turbovecLatencyMs,
      karphathyMs: metrics.karphathyLatencyMs,
      recall: metrics.recall,
      mrr: metrics.mrr,
      ndcg: metrics.ndcg,
      branch: metrics.branch,
      timestamp: metrics.timestamp
    })
  );

  // Postgres: batch aggregation for statistical analysis
  try {
    await db.insert(retrievalEvalRuns).values({
      queryHash: metrics.queryHash,
      query: metrics.query,
      branch: metrics.branch,
      qdrantLatencyMs: metrics.qdrantLatencyMs,
      turbovecLatencyMs: metrics.turbovecLatencyMs,
      totalLatencyMs: metrics.totalLatencyMs,
      finalCandidateCount: metrics.finalCandidateCount,
      recall: metrics.recall ?? null,
      mrr: metrics.mrr ?? null,
      ndcg: metrics.ndcg ?? null,
      userId: metrics.userId ?? null,
      sessionId: metrics.sessionId ?? null,
      timestamp: new Date(metrics.timestamp)
    }).catch(() => {
      // Non-blocking if DB unavailable
    });
  } catch {
    // Silently continue
  }

  await redis.quit();
}

export async function getRetrievalMetricsSummary(
  branch?: string,
  hours = 24
): Promise<{
  branch: string;
  sampleCount: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  qdrantLatencyAvg: number;
  turbovecLatencyAvg: number;
  recallAvg?: number;
  mrrAvg?: number;
  ndcgAvg?: number;
}> {
  const redis = await getRedis();

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const pattern = branch
    ? `retrieval:metrics:*:${branch}`
    : `retrieval:metrics:*`;

  const keys = await redis.keys(pattern);
  const values = keys.length > 0 ? await redis.mget(...keys) : [];

  const metrics = values
    .map((v) => {
      try {
        const m = JSON.parse(v || '{}');
        return m.timestamp > cutoff ? m : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (metrics.length === 0) {
    await redis.quit();
    return {
      branch: branch || 'all',
      sampleCount: 0,
      latencyP50: 0,
      latencyP95: 0,
      latencyP99: 0,
      qdrantLatencyAvg: 0,
      turbovecLatencyAvg: 0
    };
  }

  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const recalls = metrics.filter((m) => m.recall !== undefined).map((m) => m.recall);
  const mrrs = metrics.filter((m) => m.mrr !== undefined).map((m) => m.mrr);
  const ndcgs = metrics.filter((m) => m.ndcg !== undefined).map((m) => m.ndcg);

  const percentile = (arr: number[], p: number) => {
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)];
  };

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  await redis.quit();

  return {
    branch: branch || 'all',
    sampleCount: metrics.length,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    qdrantLatencyAvg: avg(metrics.map((m) => m.qdrantMs)),
    turbovecLatencyAvg: avg(metrics.filter((m) => m.turbovecMs).map((m) => m.turbovecMs)),
    recallAvg: recalls.length > 0 ? avg(recalls) : undefined,
    mrrAvg: mrrs.length > 0 ? avg(mrrs) : undefined,
    ndcgAvg: ndcgs.length > 0 ? avg(ndcgs) : undefined
  };
}
