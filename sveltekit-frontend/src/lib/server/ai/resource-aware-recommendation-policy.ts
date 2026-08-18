export type RecommendationLane =
  | 'semantic'
  | 'ast'
  | 'pagerank'
  | 'hypergraph'
  | 'som'
  | 'hypersphere'
  | 'exact_promotion';

export interface RecommendationBudget {
  maxCandidates: number;
  maxGraphHops: number;
  maxToolCalls: number;
  maxContextTokens: number;
  maxGpuBytes: number;
  maxLatencyMs: number;
}

export interface RecommendationRequestHints {
  queryKind?: 'lookup' | 'code_navigation' | 'graph_reasoning' | 'file_mutation' | 'repair' | 'unknown';
  requiresExactEvidence?: boolean;
  targetExists?: boolean;
  structuredTarget?: boolean;
  candidateCount?: number;
  availableGpuBytes?: number;
  requestedGraphHops?: number;
  toolArgs?: Record<string, unknown>;
}

export interface LaneEstimate {
  lane: RecommendationLane;
  utility: number;
  latencyMs: number;
  gpuBytes: number;
  toolCalls: number;
  contextTokens: number;
  graphHops: number;
  required?: boolean;
}

export interface RecommendationPlan {
  selected: RecommendationLane[];
  rejected: Array<{ lane: RecommendationLane; reason: string }>;
  totals: {
    utility: number;
    latencyMs: number;
    gpuBytes: number;
    toolCalls: number;
    contextTokens: number;
    graphHops: number;
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/**
 * Deterministic utility-per-cost selector for optional recommendation lanes.
 *
 * Canonical ownership stays elsewhere: this function only decides which derived
 * evidence lanes are worth executing under the current finite resource envelope.
 * Required lanes are admitted first, then optional lanes are greedily selected by
 * utility / normalized-cost. Exact promotion should be marked required whenever
 * the request can mutate files or otherwise needs proof-grade evidence.
 */
export function selectRecommendationLanes(
  budget: RecommendationBudget,
  estimates: LaneEstimate[],
): RecommendationPlan {
  const selected: RecommendationLane[] = [];
  const rejected: RecommendationPlan['rejected'] = [];
  const totals = {
    utility: 0,
    latencyMs: 0,
    gpuBytes: 0,
    toolCalls: 0,
    contextTokens: 0,
    graphHops: 0,
  };

  const canFit = (e: LaneEstimate) =>
    totals.latencyMs + e.latencyMs <= budget.maxLatencyMs &&
    totals.gpuBytes + e.gpuBytes <= budget.maxGpuBytes &&
    totals.toolCalls + e.toolCalls <= budget.maxToolCalls &&
    totals.contextTokens + e.contextTokens <= budget.maxContextTokens &&
    Math.max(totals.graphHops, e.graphHops) <= budget.maxGraphHops;

  const admit = (e: LaneEstimate) => {
    selected.push(e.lane);
    totals.utility += clamp01(e.utility);
    totals.latencyMs += Math.max(0, e.latencyMs);
    totals.gpuBytes += Math.max(0, e.gpuBytes);
    totals.toolCalls += Math.max(0, e.toolCalls);
    totals.contextTokens += Math.max(0, e.contextTokens);
    totals.graphHops = Math.max(totals.graphHops, Math.max(0, e.graphHops));
  };

  const required = estimates.filter((e) => e.required);
  const optional = estimates.filter((e) => !e.required);

  for (const e of required) {
    if (!canFit(e)) {
      rejected.push({ lane: e.lane, reason: 'required_lane_exceeds_budget' });
      continue;
    }
    admit(e);
  }

  const normalizedCost = (e: LaneEstimate) => {
    const ratios = [
      budget.maxLatencyMs > 0 ? e.latencyMs / budget.maxLatencyMs : 0,
      budget.maxGpuBytes > 0 ? e.gpuBytes / budget.maxGpuBytes : 0,
      budget.maxToolCalls > 0 ? e.toolCalls / budget.maxToolCalls : 0,
      budget.maxContextTokens > 0 ? e.contextTokens / budget.maxContextTokens : 0,
      budget.maxGraphHops > 0 ? e.graphHops / budget.maxGraphHops : 0,
    ];
    return Math.max(1e-6, ratios.reduce((a, b) => a + Math.max(0, b), 0));
  };

  optional
    .map((e) => ({ e, valueDensity: clamp01(e.utility) / normalizedCost(e) }))
    .sort((a, b) => b.valueDensity - a.valueDensity || a.e.lane.localeCompare(b.e.lane))
    .forEach(({ e }) => {
      if (canFit(e)) admit(e);
      else rejected.push({ lane: e.lane, reason: 'budget_exceeded' });
    });

  return { selected, rejected, totals };
}

/**
 * Conservative defaults for Parent Atlas. Values are estimates, not truth;
 * callers should replace them with telemetry-backed estimates when available.
 */
export function defaultLaneEstimates(hints: RecommendationRequestHints = {}): LaneEstimate[] {
  const graphHeavy = hints.queryKind === 'graph_reasoning';
  const mutation = hints.queryKind === 'file_mutation' || hints.queryKind === 'repair';
  const structural = mutation || hints.queryKind === 'code_navigation' || hints.structuredTarget;
  const exactRequired = Boolean(hints.requiresExactEvidence || mutation);
  const requestedHops = Math.max(0, Math.min(4, hints.requestedGraphHops ?? (graphHeavy ? 2 : 1)));

  return [
    { lane: 'semantic', utility: 0.95, latencyMs: 12, gpuBytes: 0, toolCalls: 0, contextTokens: 0, graphHops: 0, required: true },
    { lane: 'ast', utility: structural ? 0.95 : 0.45, latencyMs: 18, gpuBytes: 0, toolCalls: 0, contextTokens: 80, graphHops: 0, required: structural },
    { lane: 'pagerank', utility: graphHeavy ? 0.78 : 0.48, latencyMs: 3, gpuBytes: 0, toolCalls: 0, contextTokens: 8, graphHops: 0 },
    { lane: 'hypergraph', utility: graphHeavy ? 0.95 : 0.55, latencyMs: 24, gpuBytes: 0, toolCalls: 1, contextTokens: 180, graphHops: requestedHops },
    { lane: 'som', utility: 0.28, latencyMs: 2, gpuBytes: 0, toolCalls: 0, contextTokens: 4, graphHops: 0 },
    { lane: 'hypersphere', utility: 0.32, latencyMs: 1, gpuBytes: 4096, toolCalls: 0, contextTokens: 0, graphHops: 0 },
    { lane: 'exact_promotion', utility: exactRequired ? 1.0 : 0.72, latencyMs: 30, gpuBytes: 0, toolCalls: 1, contextTokens: 240, graphHops: 0, required: exactRequired },
  ];
}
