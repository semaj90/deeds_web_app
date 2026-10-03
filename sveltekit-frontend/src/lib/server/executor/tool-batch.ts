export type ToolBatchEffect = 'read' | 'write';

export interface ToolBatchCall<TInput = unknown> {
  id: string;
  tool: string;
  input: TInput;
  effect: ToolBatchEffect;
  dependsOn?: readonly string[];
}

export type ToolBatchResult<TOutput = unknown> =
  | { id: string; tool: string; status: 'succeeded'; output: TOutput }
  | { id: string; tool: string; status: 'failed' | 'skipped'; error: string };

export interface ToolBatchOptions {
  maxParallel?: number;
  timeoutMs?: number;
}

export type ToolBatchExecutor<TInput, TOutput> = (
  call: ToolBatchCall<TInput>,
  signal: AbortSignal,
) => Promise<TOutput>;

type Settled<TOutput> =
  | { kind: 'succeeded'; output: TOutput }
  | { kind: 'failed'; error: string }
  | { kind: 'timeout' };

const DEFAULT_MAX_PARALLEL = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PARALLEL_LIMIT = 32;
const MAX_BATCH_CALLS = 256;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'TOOL_EXECUTION_FAILED';
}

function validateCallGraph<TInput>(calls: readonly ToolBatchCall<TInput>[]): Map<string, ToolBatchCall<TInput>> {
  const byId = new Map<string, ToolBatchCall<TInput>>();
  for (const call of calls) {
    if (!call.id.trim() || !call.tool.trim()) throw new Error('TOOL_CALL_ID_AND_NAME_REQUIRED');
    if (call.effect !== 'read' && call.effect !== 'write') throw new Error(`INVALID_TOOL_EFFECT:${call.id}`);
    if (byId.has(call.id)) throw new Error(`DUPLICATE_TOOL_CALL_ID:${call.id}`);
    byId.set(call.id, call);
  }

  for (const call of calls) {
    for (const dependency of call.dependsOn ?? []) {
      if (!byId.has(dependency)) throw new Error(`UNKNOWN_TOOL_DEPENDENCY:${call.id}:${dependency}`);
      if (dependency === call.id) throw new Error(`TOOL_CALL_SELF_DEPENDENCY:${call.id}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`TOOL_CALL_DEPENDENCY_CYCLE:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const call of calls) visit(call.id);
  return byId;
}

async function settleCall<TInput, TOutput>(
  call: ToolBatchCall<TInput>,
  executor: ToolBatchExecutor<TInput, TOutput>,
  timeoutMs: number,
): Promise<ToolBatchResult<TOutput>> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const operation: Promise<Settled<TOutput>> = Promise.resolve()
    .then(() => executor(call, controller.signal))
    .then<Settled<TOutput>, Settled<TOutput>>(
      (output) => ({ kind: 'succeeded', output }),
      (error: unknown) => ({ kind: 'failed', error: errorMessage(error) }),
    );
  const timeout = new Promise<Settled<TOutput>>((resolve) => {
    timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  try {
    const settled = await Promise.race([operation, timeout]);
    if (settled.kind === 'timeout') {
      controller.abort(new Error('TOOL_TIMEOUT'));
      // Do not release the scheduler slot or start dependent work while an
      // executor may still be running. Executors must honor AbortSignal for a
      // bounded shutdown; an uncooperative executor deliberately fails closed.
      await operation;
      return { id: call.id, tool: call.tool, status: 'failed', error: 'TOOL_TIMEOUT' };
    }
    if (settled.kind === 'failed') {
      return { id: call.id, tool: call.tool, status: 'failed', error: settled.error };
    }
    return { id: call.id, tool: call.tool, status: 'succeeded', output: settled.output };
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

/**
 * Run a bounded, dependency-aware tool batch. Reads may overlap up to
 * maxParallel; writes run exclusively so an unclassified or mutating operation
 * cannot overlap another read/write call. Dependencies unblock after their
 * individual prerequisite succeeds. Results always follow input order.
 */
export async function executeToolBatch<TInput, TOutput>(
  calls: readonly ToolBatchCall<TInput>[],
  executor: ToolBatchExecutor<TInput, TOutput>,
  options: ToolBatchOptions = {},
): Promise<ToolBatchResult<TOutput>[]> {
  const maxParallel = options.maxParallel ?? DEFAULT_MAX_PARALLEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > MAX_PARALLEL_LIMIT) {
    throw new Error(`INVALID_MAX_PARALLEL:${maxParallel}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`INVALID_TIMEOUT_MS:${timeoutMs}`);
  if (calls.length > MAX_BATCH_CALLS) throw new Error(`TOOL_BATCH_TOO_LARGE:${calls.length}`);

  validateCallGraph(calls);
  const pending = new Set(calls.map((call) => call.id));
  const completed = new Map<string, ToolBatchResult<TOutput>>();
  const running = new Map<string, Promise<ToolBatchResult<TOutput>>>();

  while (pending.size > 0 || running.size > 0) {
    // Fail dependents without invoking their executor when any prerequisite
    // failed or was itself skipped.
    for (const call of calls) {
      if (!pending.has(call.id)) continue;
      const failedDependency = (call.dependsOn ?? []).find((id) => {
        const result = completed.get(id);
        return result && result.status !== 'succeeded';
      });
      if (failedDependency) {
        completed.set(call.id, {
          id: call.id,
          tool: call.tool,
          status: 'skipped',
          error: `DEPENDENCY_FAILED:${failedDependency}`,
        });
        pending.delete(call.id);
      }
    }

    let activeWrite = [...running.keys()].some((id) => calls.find((call) => call.id === id)?.effect === 'write');
    let launched = false;
    for (const call of calls) {
      if (!pending.has(call.id) || running.size >= maxParallel || activeWrite) continue;
      const dependencies = call.dependsOn ?? [];
      if (!dependencies.every((id) => completed.get(id)?.status === 'succeeded')) continue;
      if (call.effect === 'write' && running.size !== 0) continue;

      pending.delete(call.id);
      const promise = settleCall(call, executor, timeoutMs);
      running.set(call.id, promise);
      activeWrite = call.effect === 'write';
      launched = true;
    }

    if (running.size === 0) {
      if (pending.size === 0) break;
      if (!launched) throw new Error('TOOL_CALL_DEPENDENCY_DEADLOCK');
    }

    if (running.size > 0) {
      const result = await Promise.race(running.values());
      running.delete(result.id);
      completed.set(result.id, result);
    }
  }

  return calls.map((call) => {
    const result = completed.get(call.id);
    if (!result) throw new Error(`TOOL_CALL_RESULT_MISSING:${call.id}`);
    return result;
  });
}
