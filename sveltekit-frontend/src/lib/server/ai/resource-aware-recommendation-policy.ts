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
  /** Shared candidate frontier consumed by this lane; not additive across lanes. */
  candidateCount?: number;
  required?: boolean;
}

export interface RecommendationPlan {
  /** False means at least one required proof lane could not fit the envelope. */
  admissible: boolean;
  selected: RecommendationLane[];
  rejected: Array<{ lane: RecommendationLane; reason: string }>;
  blockingReasons: string[];
  totals: {
    utility: number;
    latencyMs: number;
    gpuBytes: number;
    toolCalls: number;
    contextTokens: number;
    graphHops: number;
    /** Maximum shared frontier observed, never a sum across executors/lanes. */
    candidateCount: number;
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const nonNegativeInt = (x: unknown, fallback = 0) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : fallback;

/**
 * Deterministically derive policy hints from the key/value shape already present
 * at a tool boundary. This is deliberately rule-based: learned classifiers may
 * add soft evidence later, but tool semantics remain inspectable and replayable.
 */
export function inferRecommendationHintsFromToolArgs(
  toolArgs: Record<string, unknown> = {},
  base: RecommendationRequestHints = {},
): RecommendationRequestHints {
  const operation = String(
    toolArgs.operation ?? toolArgs.action ?? toolArgs.op ?? toolArgs.kind ?? '',
  ).toLowerCase();
  const pathLike =
    typeof toolArgs.path === 'string' ||
    typeof toolArgs.filePath === 'string' ||
    typeof toolArgs.file_path === 'string' ||
    typeof toolArgs.symbolId === 'string' ||
    typeof toolArgs.symbol_id === 'string';
  const mutation = /^(create|write|edit|patch|update|delete|rename|move|refactor|repair|fix)$/.test(operation);
  const repair = /^(repair|fix)$/.test(operation);
  const graphRequested =
    /graph|pagerank|neighbor|neighbour|hyperedge|travers|dependency|fanout|fan-out/.test(operation) ||
    toolArgs.graph === true ||
    toolArgs.graphReasoning === true ||
    toolArgs.graph_reasoning === true;

  const requestedGraphHops = nonNegativeInt(
    toolArgs.maxGraphHops ?? toolArgs.max_hops ?? toolArgs.hops,
    base.requestedGraphHops ?? 0,
  );
  const candidateCount = nonNegativeInt(
    toolArgs.candidateCount ?? toolArgs.candidate_count ?? toolArgs.topK ?? toolArgs.top_k,
    base.candidateCount ?? 0,
  );

  let queryKind = base.queryKind;
  if (!queryKind || queryKind === 'unknown') {
    if (repair) queryKind = 'repair';
    else if (mutation) queryKind = 'file_mutation';
    else if (graphRequested || requestedGraphHops > 0) queryKind = 'graph_reasoning';
    else if (pathLike) queryKind = 'code_navigation';
    else queryKind = 'lookup';
  }

  return {
    ...base,
    queryKind,
    requiresExactEvidence: base.requiresExactEvidence ?? mutation,
    structuredTarget: base.structuredTarget ?? pathLike,
    candidateCount: candidateCount || base.candidateCount,
    requestedGraphHops: requestedGraphHops || base.requestedGraphHops,
    toolArgs,
  };
}

/**
 * Deterministic utility-per-cost selector for optional recommendation lanes.
 *
 * Canonical ownership stays elsewhere: this function only decides which derived
 * evidence lanes are worth executing under the current finite resource envelope.
 * Required lanes are admitted first. If any required lane does not fit, the plan
 * is NON-ADMISSIBLE; a mutation caller must block rather than silently degrade.
 * Optional lanes are greedily selected by utility / normalized-cost.
 */
export function selectRecommendationLanes(
  budget: RecommendationBudget,
  estimates: LaneEstimate[],
): RecommendationPlan {
  const selected: RecommendationLane[] = [];
  const rejected: RecommendationPlan['rejected'] = [];
  const blockingReasons: string[] = [];
  const totals = {
    utility: 0,
    latencyMs: 0,
    gpuBytes: 0,
    toolCalls: 0,
    contextTokens: 0,
    graphHops: 0,
    candidateCount: 0,
  };

  const exceeds = (e: LaneEstimate): string | null => {
    if (Math.max(totals.candidateCount, Math.max(0, e.candidateCount ?? 0)) > budget.maxCandidates) return 'candidate_budget_exceeded';
    if (totals.latencyMs + e.latencyMs > budget.maxLatencyMs) return 'latency_budget_exceeded';
    if (totals.gpuBytes + e.gpuBytes > budget.maxGpuBytes) return 'gpu_budget_exceeded';
    if (totals.toolCalls + e.toolCalls > budget.maxToolCalls) return 'tool_call_budget_exceeded';
    if (totals.contextTokens + e.contextTokens > budget.maxContextTokens) return 'context_budget_exceeded';
    if (Math.max(totals.graphHops, e.graphHops) > budget.maxGraphHops) return 'graph_hop_budget_exceeded';
    return null;
  };

  const admit = (e: LaneEstimate) => {
    selected.push(e.lane);
    totals.utility += clamp01(e.utility);
    totals.latencyMs += Math.max(0, e.latencyMs);
    totals.gpuBytes += Math.max(0, e.gpuBytes);
    totals.toolCalls += Math.max(0, e.toolCalls);
    totals.contextTokens += Math.max(0, e.contextTokens);
    totals.graphHops = Math.max(totals.graphHops, Math.max(0, e.graphHops));
    totals.candidateCount = Math.max(totals.candidateCount, Math.max(0, e.candidateCount ?? 0));
  };

  const required = estimates.filter((e) => e.required);
  const optional = estimates.filter((e) => !e.required);

  for (const e of required) {
    const reason = exceeds(e);
    if (reason) {
      rejected.push({ lane: e.lane, reason: `required_${reason}` });
      blockingReasons.push(`${e.lane}:${reason}`);
      continue;
    }
    admit(e);
  }

  // Do not spend optional resources once proof-required execution is impossible.
  if (blockingReasons.length > 0) {
    for (const e of optional) rejected.push({ lane: e.lane, reason: 'blocked_by_required_lane' });
    return { admissible: false, selected, rejected, blockingReasons, totals };
  }

  const normalizedCost = (e: LaneEstimate) => {
    const ratios = [
      budget.maxCandidates > 0 ? (e.candidateCount ?? 0) / budget.maxCandidates : 0,
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
      const reason = exceeds(e);
      if (!reason) admit(e);
      else rejected.push({ lane: e.lane, reason });
    });

  return { admissible: true, selected, rejected, blockingReasons, totals };
}

/**
 * Conservative priors for Parent Atlas. They are receipts/configuration inputs,
 * not universal constants; replace them with telemetry-backed estimates when
 * enough execution history exists.
 */
export function defaultLaneEstimates(rawHints: RecommendationRequestHints = {}): LaneEstimate[] {
  const hints = rawHints.toolArgs
    ? inferRecommendationHintsFromToolArgs(rawHints.toolArgs, rawHints)
    : rawHints;
  const graphHeavy = hints.queryKind === 'graph_reasoning';
  const mutation = hints.queryKind === 'file_mutation' || hints.queryKind === 'repair';
  const structural = mutation || hints.queryKind === 'code_navigation' || hints.structuredTarget;
  const exactRequired = Boolean(hints.requiresExactEvidence || mutation);
  const requestedHops = Math.max(0, Math.min(4, hints.requestedGraphHops ?? (graphHeavy ? 2 : 1)));
  const candidates = Math.max(1, hints.candidateCount ?? 20);

  return [
    { lane: 'semantic', utility: 0.95, latencyMs: 12, gpuBytes: 0, toolCalls: 0, contextTokens: 0, graphHops: 0, candidateCount: candidates, required: true },
    { lane: 'ast', utility: structural ? 0.95 : 0.45, latencyMs: 18, gpuBytes: 0, toolCalls: 0, contextTokens: 80, graphHops: 0, candidateCount: candidates, required: structural },
    { lane: 'pagerank', utility: graphHeavy ? 0.78 : 0.48, latencyMs: 3, gpuBytes: 0, toolCalls: 0, contextTokens: 8, graphHops: 0, candidateCount: candidates },
    { lane: 'hypergraph', utility: graphHeavy ? 0.95 : 0.55, latencyMs: 24, gpuBytes: 0, toolCalls: 1, contextTokens: 180, graphHops: requestedHops, candidateCount: candidates },
    { lane: 'som', utility: 0.28, latencyMs: 2, gpuBytes: 0, toolCalls: 0, contextTokens: 4, graphHops: 0, candidateCount: candidates },
    { lane: 'hypersphere', utility: 0.32, latencyMs: 1, gpuBytes: 4096, toolCalls: 0, contextTokens: 0, graphHops: 0, candidateCount: candidates },
    { lane: 'exact_promotion', utility: exactRequired ? 1.0 : 0.72, latencyMs: 30, gpuBytes: 0, toolCalls: 1, contextTokens: 240, graphHops: 0, candidateCount: candidates, required: exactRequired },
  ];
}
