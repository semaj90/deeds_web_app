import {
  validateWorkflowDag,
  type WorkflowDagBudgetV1,
  type WorkflowDagReceiptV1,
} from './workflow-dag.js';

export type ResourceClass = 'IO' | 'CPU_LIGHT' | 'CPU_HEAVY' | 'GPU_LIGHT' | 'GPU_HEAVY' | 'LLM';

export interface ExecutableTask<T = unknown> {
  id: string;
  priority: number;
  dependencies?: string[];
  resourceClass: ResourceClass;
  logicalActionId?: string;
  attempt?: number;
  estimatedCost?: {
    compute?: number;
    toolCalls?: number;
    contextTokens?: number;
    gpuBytes?: number;
    elapsedMs?: number;
  };
  run: () => Promise<T>;
}

export interface ExecutorLimits {
  maxParallelToolCalls: number;
  perResource: Partial<Record<ResourceClass, number>>;
}

export interface ExecutionReceipt<T = unknown> {
  id: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED_DEPENDENCY';
  value?: T;
  error?: string;
}

export interface BoundedExecutionOptions {
  workflowRevision?: number;
  dagBudget?: Partial<WorkflowDagBudgetV1>;
}

export interface BoundedExecutionResult<T = unknown> {
  dagReceipt: WorkflowDagReceiptV1;
  taskReceipts: ExecutionReceipt<T>[];
}

const DEFAULT_LIMITS: ExecutorLimits = {
  maxParallelToolCalls: 3,
  perResource: { IO: 3, CPU_LIGHT: 3, CPU_HEAVY: 1, GPU_LIGHT: 2, GPU_HEAVY: 1, LLM: 1 },
};

const DEFAULT_DAG_BUDGET: WorkflowDagBudgetV1 = {
  maxNodes: 64,
  maxEdges: 128,
  maxDepth: 24,
  maxWidth: 8,
  maxCompute: 256,
  maxToolCalls: 32,
  maxContextTokens: 32_000,
  maxGpuBytes: 2 * 1024 ** 3,
  maxElapsedMs: 30_000,
};

export function validateExecutableTasks<T>(
  tasks: ExecutableTask<T>[],
  options: BoundedExecutionOptions = {},
): WorkflowDagReceiptV1 {
  return validateWorkflowDag({
    schema: 'atlas.workflow-dag-plan.v1',
    workflowRevision: options.workflowRevision ?? 0,
    budget: { ...DEFAULT_DAG_BUDGET, ...(options.dagBudget ?? {}) },
    nodes: tasks.map((task) => ({
      id: task.id,
      dependencies: task.dependencies ?? [],
      kind: task.resourceClass,
      logicalActionId: task.logicalActionId,
      attempt: task.attempt,
      cost: task.estimatedCost,
    })),
  });
}

/**
 * Executes only a previously admissible forward-only task DAG.
 *
 * This preserves the old bounded scheduler semantics but moves cycle/missing
 * dependency and finite-envelope checks BEFORE any task runs. Retries must be
 * represented as new nodes with increasing attempts; no backward dependency
 * edge is ever added to an already-executed node.
 */
export async function runBoundedExecutionPlanWithReceipt<T>(
  tasks: ExecutableTask<T>[],
  limits: ExecutorLimits = DEFAULT_LIMITS,
  options: BoundedExecutionOptions = {},
): Promise<BoundedExecutionResult<T>> {
  const dagReceipt = validateExecutableTasks(tasks, options);
  if (!dagReceipt.admissible) {
    throw new Error(`Execution plan rejected before execution: ${dagReceipt.violations.join(', ') || 'not_admissible'}`);
  }

  const pending = new Map(tasks.map((task) => [task.id, task]));
  const receipts = new Map<string, ExecutionReceipt<T>>();

  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter((task) => (task.dependencies ?? []).every((id) => receipts.get(id)?.status === 'SUCCEEDED'))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

    const blocked = [...pending.values()].filter((task) =>
      (task.dependencies ?? []).some((id) => ['FAILED', 'SKIPPED_DEPENDENCY'].includes(receipts.get(id)?.status ?? '')),
    );
    for (const task of blocked) {
      receipts.set(task.id, { id: task.id, status: 'SKIPPED_DEPENDENCY' });
      pending.delete(task.id);
    }

    if (ready.length === 0) {
      if (pending.size === 0) break;
      // Defensive assertion. validateExecutableTasks() should make this branch
      // unreachable for a static plan.
      throw new Error(`Validated execution plan became unresolved: ${[...pending.keys()].join(', ')}`);
    }

    const resourceUse: Partial<Record<ResourceClass, number>> = {};
    const batch: ExecutableTask<T>[] = [];
    for (const task of ready) {
      if (batch.length >= limits.maxParallelToolCalls) break;
      const used = resourceUse[task.resourceClass] ?? 0;
      const max = limits.perResource[task.resourceClass] ?? limits.maxParallelToolCalls;
      if (used >= max) continue;
      resourceUse[task.resourceClass] = used + 1;
      batch.push(task);
    }
    if (batch.length === 0) throw new Error('No task fits the current executor resource limits.');

    for (const task of batch) pending.delete(task.id);
    const settled = await Promise.allSettled(batch.map((task) => task.run()));
    settled.forEach((result, index) => {
      const task = batch[index];
      if (result.status === 'fulfilled') receipts.set(task.id, { id: task.id, status: 'SUCCEEDED', value: result.value });
      else receipts.set(task.id, { id: task.id, status: 'FAILED', error: String(result.reason) });
    });
  }

  return {
    dagReceipt,
    taskReceipts: tasks.map((task) => receipts.get(task.id) ?? { id: task.id, status: 'SKIPPED_DEPENDENCY' }),
  };
}

/** Backward-compatible facade for current callers. */
export async function runBoundedExecutionPlan<T>(
  tasks: ExecutableTask<T>[],
  limits: ExecutorLimits = DEFAULT_LIMITS,
): Promise<ExecutionReceipt<T>[]> {
  const result = await runBoundedExecutionPlanWithReceipt(tasks, limits);
  return result.taskReceipts;
}
