export const DAG_TIME_BUDGET_V1_SCHEMA = 'parent-atlas.dag-time-budget.v1' as const;

export interface DagNodeTimingV1 {
  nodeId: string;
  stage:
    | 'EXACT_MEMORY'
    | 'METADATA'
    | 'STRUCTURAL'
    | 'SEMANTIC'
    | 'GRAPH'
    | 'VALIDATION'
    | 'SYNTHESIS';
  predictedMs: number;
  p95Ms?: number;
  dependsOn: readonly string[];
  optional: boolean;
}

export interface DagTimeBudgetV1 {
  schema: typeof DAG_TIME_BUDGET_V1_SCHEMA;
  budgetRevision: string;
  wallClockBudgetMs: number;
  nodes: readonly DagNodeTimingV1[];
  criticalPathMs: number;
}

export interface DagProgressV1 {
  completedNodeIds: readonly string[];
  elapsedMs: number;
  predictedRemainingMs: number;
  progress01: number;
}

function criticalPath(nodes: readonly DagNodeTimingV1[]): number {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const memo = new Map<string, number>();

  const visit = (id: string, stack = new Set<string>()): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) throw new Error(`DAG cycle detected at ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown DAG dependency ${id}`);

    const nextStack = new Set(stack);
    nextStack.add(id);
    const parent = node.dependsOn.length
      ? Math.max(...node.dependsOn.map((dep) => visit(dep, nextStack)))
      : 0;
    const value = parent + Math.max(0, node.predictedMs);
    memo.set(id, value);
    return value;
  };

  return nodes.length ? Math.max(...nodes.map((n) => visit(n.nodeId))) : 0;
}

export function buildDagTimeBudgetV1(input: {
  budgetRevision: string;
  wallClockBudgetMs: number;
  nodes: readonly DagNodeTimingV1[];
}): DagTimeBudgetV1 {
  return {
    schema: DAG_TIME_BUDGET_V1_SCHEMA,
    budgetRevision: input.budgetRevision,
    wallClockBudgetMs: input.wallClockBudgetMs,
    nodes: [...input.nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    criticalPathMs: criticalPath(input.nodes)
  };
}

/**
 * Recompute the critical path over ONLY the unfinished nodes (treating a
 * completed node's own predictedMs as already paid for, but still respecting
 * dependency edges into unfinished nodes from completed ones).
 *
 * FIXED 2026-09-06 (review before bringing this pack into the repo, per
 * openspec/changes/parent-atlas-memory-architecture-freeze addendum 9): the
 * original `predictedRemainingMs = criticalPathMs - elapsedMs` is only
 * correct if every node runs strictly sequentially in critical-path order.
 * Once parallel DAG branches exist, a branch can finish early while the
 * critical path is actually determined by a different, still-running
 * branch - the naive subtraction either overestimates (double-counts
 * finished parallel work) or underestimates (ignores that the true
 * bottleneck branch may have barely started) remaining time. Recomputing
 * over the unfinished-node subgraph is the correct fix.
 */
function remainingCriticalPath(nodes: readonly DagNodeTimingV1[], completedNodeIds: ReadonlySet<string>): number {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const memo = new Map<string, number>();

  const visit = (id: string, stack: ReadonlySet<string>): number => {
    if (completedNodeIds.has(id)) return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) throw new Error(`DAG cycle detected at ${id}`);
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown DAG dependency ${id}`);

    const nextStack = new Set(stack);
    nextStack.add(id);
    // A dependency's own remaining cost only matters if it isn't complete;
    // a completed dependency contributes 0 (its own remaining work is done),
    // but an unfinished node still waits on it structurally via dependsOn.
    const parent = node.dependsOn.length
      ? Math.max(...node.dependsOn.map((dep) => visit(dep, nextStack)))
      : 0;
    const value = parent + Math.max(0, node.predictedMs);
    memo.set(id, value);
    return value;
  };

  const unfinished = nodes.filter((n) => !completedNodeIds.has(n.nodeId));
  return unfinished.length ? Math.max(...unfinished.map((n) => visit(n.nodeId, new Set()))) : 0;
}

export function estimateDagProgressV1(
  budget: DagTimeBudgetV1,
  completedNodeIds: readonly string[],
  elapsedMs: number
): DagProgressV1 {
  const done = new Set(completedNodeIds);
  const totalWork = budget.nodes.reduce((s, n) => s + Math.max(0, n.predictedMs), 0);
  const doneWork = budget.nodes
    .filter((n) => done.has(n.nodeId))
    .reduce((s, n) => s + Math.max(0, n.predictedMs), 0);
  const progress01 = totalWork > 0 ? Math.max(0, Math.min(1, doneWork / totalWork)) : 1;

  return {
    completedNodeIds: [...done].sort(),
    elapsedMs,
    predictedRemainingMs: remainingCriticalPath(budget.nodes, done),
    progress01
  };
}
