/**
 * POST /api/retrieval/executor-tree-test
 *
 * Integration test endpoint for executor tree routing.
 * Uses controlled lazy loaders to prove:
 * - Tree wiring without real backends
 * - Context propagation (queryId, traceId, abort signals)
 * - Failure classification (retryable vs fatal)
 * - Trace logging
 *
 * DO NOT USE IN PRODUCTION. For development/testing only.
 * Wire the tree into production routes only after real backends are bound.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const ExecutorTreeTestRequestSchema = z.object({
  mode: z.enum(['crossEncoder', 'langExtract', 'trace']),
  input: z.record(z.unknown()).optional(),
  simulateFailure: z.boolean().optional(),
  failureRetryable: z.boolean().optional(),
  delayMs: z.number().int().min(0).max(5000).optional(),
});

/**
 * Controlled lazy executor for testing.
 * Tracks initialization and execution count.
 */
function createTestExecutor(mode: string) {
  let executionCount = 0;
  let initialized = false;

  return {
    id: mode,
    async execute(input: any, context: any) {
      if (!initialized) {
        initialized = true;
        console.log(`[TEST] Executor '${mode}' initialized`);
      }
      executionCount++;
      console.log(
        `[TEST] Executor '${mode}' execution #${executionCount}, queryId=${context.queryId}, traceId=${context.traceId}`,
      );

      if (context.signal?.aborted) {
        return {
          status: 'failure',
          error: new Error('Execution aborted'),
          retryable: false,
          executorPath: [mode],
        };
      }

      if (input?.simulateFailure) {
        return {
          status: 'failure',
          error: new Error(`${mode} intentional failure for testing`),
          retryable: input.failureRetryable ?? true,
          executorPath: [mode],
        };
      }

      if (input?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      }

      if (context.signal?.aborted) {
        return {
          status: 'failure',
          error: new Error('Execution aborted after delay'),
          retryable: false,
          executorPath: [mode],
        };
      }

      return {
        status: 'success',
        value: {
          mode,
          executionCount,
          queryId: context.queryId,
          traceId: context.traceId,
          input,
        },
        executorPath: [mode],
      };
    },
  };
}

/**
 * Minimal executor tree for testing.
 * Mirrors the structure from executor-tree.runtime.spec.ts.
 */
class TestExecutorTree {
  private executors = new Map<string, any>();
  private initPromises = new Map<string, Promise<any>>();

  register(mode: string) {
    const executor = createTestExecutor(mode);
    this.executors.set(mode, null);
    this.initPromises.set(
      mode,
      Promise.resolve().then(() => {
        this.executors.set(mode, executor);
        return executor;
      }),
    );
  }

  async execute(mode: string, input: any, context: any) {
    if (!this.initPromises.has(mode)) {
      return {
        status: 'failure',
        error: { message: `Unknown executor mode: ${mode}` },
        retryable: false,
        executorPath: [],
      };
    }

    try {
      const executor = await this.initPromises.get(mode);
      const result = await executor.execute(input, context);

      return {
        ...result,
        executorPath: [mode, ...result.executorPath],
      };
    } catch (err) {
      return {
        status: 'failure',
        error: { message: String(err) },
        retryable: false,
        executorPath: [mode],
      };
    }
  }
}

// Global test tree instance
const testTree = new TestExecutorTree();
testTree.register('crossEncoder');
testTree.register('langExtract');
testTree.register('trace');

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = ExecutorTreeTestRequestSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid executor tree test request',
        },
        { status: 400 },
      );
    }

    const { mode, input, simulateFailure, failureRetryable, delayMs } = parsed.data;

    // Create context with identity and abort signal
    const queryId = `query-${crypto.randomUUID()}`;
    const traceId = `trace-${crypto.randomUUID()}`;
    const controller = new AbortController();

    // Abort after delay if specified (simulates timeout)
    const abortTimeoutMs = 2000;
    const timeoutHandle = setTimeout(() => controller.abort(), abortTimeoutMs);

    try {
      const testInput = {
        simulateFailure,
        failureRetryable,
        delayMs,
        ...input,
      };

      const result = await testTree.execute(mode, testInput, {
        queryId,
        traceId,
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      return json({
        success: true,
        queryId,
        traceId,
        mode,
        result,
        testMetadata: {
          simulateFailure: !!simulateFailure,
          delayMs: delayMs ?? 0,
          abortTimeoutMs,
        },
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  } catch (err) {
    console.error('Executor tree test error:', err);
    return json(
      {
        error: 'Executor tree test failed',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
};
