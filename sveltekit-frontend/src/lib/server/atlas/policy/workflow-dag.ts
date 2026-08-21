import { createHash } from 'node:crypto';

export interface WorkflowNodeCostV1 {
  compute?: number;
  toolCalls?: number;
  contextTokens?: number;
  gpuBytes?: number;
  elapsedMs?: number;
}

export interface WorkflowDagNodeV1 {
  id: string;
  dependencies?: string[];
  kind?: string;
  logicalActionId?: string;
  attempt?: number;
  cost?: WorkflowNodeCostV1;
}

export interface WorkflowDagBudgetV1 {
  maxNodes: number;
  maxEdges: number;
  maxDepth: number;
  maxWidth: number;
  maxCompute: number;
  maxToolCalls: number;
  maxContextTokens: number;
  maxGpuBytes: number;
  maxElapsedMs: number;
}

export interface WorkflowDagPlanV1 {
  schema: 'atlas.workflow-dag-plan.v1';
  workflowRevision: number;
  nodes: WorkflowDagNodeV1[];
  budget: WorkflowDagBudgetV1;
}

export interface WorkflowDagMetricsV1 {
  nodes: number;
  edges: number;
  depth: number;
  width: number;
  compute: number;
  toolCalls: number;
  contextTokens: number;
  gpuBytes: number;
  elapsedMs: number;
}

export interface WorkflowDagReceiptV1 {
  schema: 'atlas.workflow-dag-receipt.v1';
  workflowRevision: number;
  planHash: string;
  referenceEngine: 'typescript-kahn';
  executorRole: 'INLINE_VALIDATOR';
  isDag: boolean;
  admissible: boolean;
  topologicalOrder: string[];
  generations: string[][];
  metrics: WorkflowDagMetricsV1;
  budget: WorkflowDagBudgetV1;
  missingDependencies: string[];
  cycleNodes: string[];
  violations: string[];
  retryLineage: Record<string, Array<{ id: string; attempt: number; kind: string }>>;
  receiptHash: string;
}

const nonnegative = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function assertInputShape(plan: WorkflowDagPlanV1): void {
  for (const raw of plan.nodes) {
    const id = raw.id.trim();
    if (!id) throw new Error('Workflow node id is required');
    const dependencies = (raw.dependencies ?? []).map((dep) => dep.trim());
    if (dependencies.some((dep) => !dep)) throw new Error(`Node ${id}: dependency ids must be non-empty`);
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error(`Node ${id}: duplicate dependencies are not allowed`);
    }
    if (dependencies.includes(id)) throw new Error(`Node ${id}: self dependency is not allowed`);
  }
}

function normalizePlan(plan: WorkflowDagPlanV1) {
  return {
    schema: plan.schema,
    workflowRevision: Math.max(0, Math.trunc(plan.workflowRevision)),
    nodes: plan.nodes
      .map((node) => ({
        id: node.id.trim(),
        dependencies: (node.dependencies ?? []).map((id) => id.trim()).sort(),
        kind: node.kind ?? 'task',
        logicalActionId: node.logicalActionId ?? null,
        attempt: Math.max(0, Math.trunc(node.attempt ?? 0)),
        cost: {
          compute: nonnegative(node.cost?.compute),
          toolCalls: nonnegative(node.cost?.toolCalls),
          contextTokens: nonnegative(node.cost?.contextTokens),
          gpuBytes: nonnegative(node.cost?.gpuBytes),
          elapsedMs: nonnegative(node.cost?.elapsedMs),
        },
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    budget: { ...plan.budget },
  };
}

/**
 * Inline deterministic validator matching the NetworkX reference oracle.
 * NetworkX remains the readable cross-runtime oracle; this Kahn implementation
 * is used in the Node hot path to prevent invalid plans from reaching execution.
 */
export function validateWorkflowDag(plan: WorkflowDagPlanV1): WorkflowDagReceiptV1 {
  if (plan.schema !== 'atlas.workflow-dag-plan.v1') {
    throw new Error('Unsupported workflow DAG schema');
  }
  assertInputShape(plan);

  const normalized = normalizePlan(plan);
  const ids = normalized.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) throw new Error('Workflow node ids must be unique');

  const byId = new Map(normalized.nodes.map((node) => [node.id, node]));
  const missingDependencies = [...new Set(
    normalized.nodes.flatMap((node) => node.dependencies.filter((dep) => !byId.has(dep))),
  )].sort();

  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  let edgeCount = 0;
  for (const node of normalized.nodes) {
    for (const dep of node.dependencies) {
      if (!byId.has(dep)) continue;
      outgoing.get(dep)!.push(node.id);
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      edgeCount++;
    }
  }
  for (const children of outgoing.values()) children.sort();

  let frontier = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const topologicalOrder: string[] = [];
  const generations: string[][] = [];
  while (frontier.length) {
    const generation = [...frontier].sort();
    generations.push(generation);
    const next = new Set<string>();
    for (const id of generation) {
      topologicalOrder.push(id);
      for (const child of outgoing.get(id) ?? []) {
        const degree = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, degree);
        if (degree === 0) next.add(child);
      }
    }
    frontier = [...next].sort();
  }

  const cycleNodes = ids.filter((id) => !topologicalOrder.includes(id)).sort();
  const isDag = missingDependencies.length === 0 && cycleNodes.length === 0;
  const metrics: WorkflowDagMetricsV1 = {
    nodes: normalized.nodes.length,
    edges: edgeCount,
    depth: isDag ? generations.length : 0,
    width: isDag ? Math.max(0, ...generations.map((generation) => generation.length)) : 0,
    compute: normalized.nodes.reduce((sum, node) => sum + node.cost.compute, 0),
    toolCalls: normalized.nodes.reduce((sum, node) => sum + node.cost.toolCalls, 0),
    contextTokens: normalized.nodes.reduce((sum, node) => sum + node.cost.contextTokens, 0),
    gpuBytes: normalized.nodes.reduce((sum, node) => sum + node.cost.gpuBytes, 0),
    elapsedMs: normalized.nodes.reduce((sum, node) => sum + node.cost.elapsedMs, 0),
  };

  const budgetPairs: Array<[keyof WorkflowDagMetricsV1, keyof WorkflowDagBudgetV1]> = [
    ['nodes', 'maxNodes'], ['edges', 'maxEdges'], ['depth', 'maxDepth'], ['width', 'maxWidth'],
    ['compute', 'maxCompute'], ['toolCalls', 'maxToolCalls'], ['contextTokens', 'maxContextTokens'],
    ['gpuBytes', 'maxGpuBytes'], ['elapsedMs', 'maxElapsedMs'],
  ];
  const violations: string[] = [];
  if (missingDependencies.length) violations.push('missing_dependencies');
  if (!isDag) violations.push('cycle_or_invalid_dependency_graph');
  for (const [metric, max] of budgetPairs) {
    if (metrics[metric] > normalized.budget[max]) violations.push(`${metric}_budget_exceeded`);
  }

  const retryLineage: WorkflowDagReceiptV1['retryLineage'] = {};
  for (const node of normalized.nodes) {
    if (!node.logicalActionId) continue;
    (retryLineage[node.logicalActionId] ??= []).push({ id: node.id, attempt: node.attempt, kind: node.kind });
  }
  for (const rows of Object.values(retryLineage)) {
    rows.sort((a, b) => a.attempt - b.attempt || a.id.localeCompare(b.id));
  }

  const planHash = sha256(normalized);
  const withoutHash = {
    schema: 'atlas.workflow-dag-receipt.v1' as const,
    workflowRevision: normalized.workflowRevision,
    planHash,
    referenceEngine: 'typescript-kahn' as const,
    executorRole: 'INLINE_VALIDATOR' as const,
    isDag,
    admissible: isDag && violations.length === 0,
    topologicalOrder,
    generations,
    metrics,
    budget: normalized.budget,
    missingDependencies,
    cycleNodes,
    violations,
    retryLineage,
  };
  return { ...withoutHash, receiptHash: sha256(withoutHash) };
}
