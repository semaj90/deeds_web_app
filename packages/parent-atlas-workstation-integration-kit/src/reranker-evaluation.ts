export type RankedJudgment = {
  queryId: string;
  packetId: string;
  relevance: number;
  baselineRank: number;
  rerankedRank: number;
  latencyMs?: number;
  domain?: string;
};

export type RerankerEvaluation = {
  queryCount: number;
  ndcgAt5Baseline: number;
  ndcgAt5Reranked: number;
  improvement: number;
  medianLatencyMs: number | null;
  pass: boolean;
  reasons: string[];
};

export function evaluateReranker(
  judgments: readonly RankedJudgment[],
  options: { minimumNdcgImprovement?: number; maximumMedianLatencyMs?: number } = {},
): RerankerEvaluation {
  const minimumImprovement = options.minimumNdcgImprovement ?? 0.02;
  const maximumLatency = options.maximumMedianLatencyMs ?? 250;
  const queryIds = [...new Set(judgments.map((item) => item.queryId))];

  const baseline = average(queryIds.map((queryId) => ndcgAt(judgments.filter((item) => item.queryId === queryId), 'baselineRank', 5)));
  const reranked = average(queryIds.map((queryId) => ndcgAt(judgments.filter((item) => item.queryId === queryId), 'rerankedRank', 5)));
  const latencies = judgments.flatMap((item) => item.latencyMs === undefined ? [] : [item.latencyMs]);
  const medianLatencyMs = latencies.length > 0 ? median(latencies) : null;
  const improvement = reranked - baseline;
  const reasons: string[] = [];

  if (improvement < minimumImprovement) reasons.push(`NDCG@5 improvement ${improvement.toFixed(4)} is below ${minimumImprovement.toFixed(4)}`);
  if (medianLatencyMs !== null && medianLatencyMs > maximumLatency) reasons.push(`Median latency ${medianLatencyMs.toFixed(1)}ms exceeds ${maximumLatency}ms`);

  return {
    queryCount: queryIds.length,
    ndcgAt5Baseline: baseline,
    ndcgAt5Reranked: reranked,
    improvement,
    medianLatencyMs,
    pass: reasons.length === 0,
    reasons,
  };
}

function ndcgAt(items: readonly RankedJudgment[], rankField: 'baselineRank' | 'rerankedRank', k: number): number {
  const ranked = [...items].sort((a, b) => a[rankField] - b[rankField]).slice(0, k);
  const dcg = ranked.reduce((sum, item, index) => sum + gain(item.relevance) / Math.log2(index + 2), 0);
  const ideal = [...items].sort((a, b) => b.relevance - a.relevance).slice(0, k);
  const idcg = ideal.reduce((sum, item, index) => sum + gain(item.relevance) / Math.log2(index + 2), 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

function gain(relevance: number): number {
  return Math.pow(2, relevance) - 1;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
