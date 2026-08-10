export type ResourceClass = 'IO' | 'CPU_LIGHT' | 'CPU_HEAVY' | 'GPU_LIGHT' | 'GPU_HEAVY' | 'LLM';

export interface ExecutableTask<T = unknown> {
  id: string;
  priority: number;
  dependencies?: string[];
  resourceClass: ResourceClass;
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

const DEFAULT_LIMITS: ExecutorLimits = {
  maxParallelToolCalls: 3,
  perResource: { IO: 3, CPU_LIGHT: 3, CPU_HEAVY: 1, GPU_LIGHT: 2, GPU_HEAVY: 1, LLM: 1 },
};

export async function runBoundedExecutionPlan<T>(
  tasks: ExecutableTask<T>[],
  limits: ExecutorLimits = DEFAULT_LIMITS,
): Promise<ExecutionReceipt<T>[]> {
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
      throw new Error(`Execution plan has a cycle or unresolved dependency: ${[...pending.keys()].join(', ')}`);
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

  return tasks.map((task) => receipts.get(task.id) ?? { id: task.id, status: 'SKIPPED_DEPENDENCY' });
}
