/**
 * Work command contracts — the finite set of task types the system can route.
 *
 * Hard rule: NEVER derive a routing key from a query string or free-form text.
 * Route by taskType only. Adding new task types requires a matching queue
 * binding in topology.ts and a consumer registration.
 *
 * Two-envelope model:
 *   WorkCommand<T>   — commands directed at a specific worker capability
 *   AnalyticsEvent   — observability events; never drive state from these
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Finite task type registry — extend here, not at call sites
// ---------------------------------------------------------------------------

export const taskTypeSchema = z.enum([
  'code.inspect',
  'code.patch',
  'code.test',
  'retrieval.evaluate',
  'retrieval.materialize',
  'graph.project',
  'embedding.backfill',
  'document.parse',
  'agent.execute',
  'agent.execute.opencode',
]);

export type TaskType = z.infer<typeof taskTypeSchema>;

// ---------------------------------------------------------------------------
// WorkCommand envelope — all fields required by the worker contract
// ---------------------------------------------------------------------------

export const workCommandBaseSchema = z.object({
  commandId: z.string().uuid(),
  commandType: taskTypeSchema,
  issuedAt: z.string().datetime(),
  traceId: z.string().optional(),
  requestId: z.string().uuid(),
  runId: z.string().uuid(),
  taskId: z.string().uuid(),
  capability: z.string().min(1),
  targetWorkerClass: z.string().min(1),
  attempt: z.number().int().min(0),
  timeoutMs: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

export type WorkCommandBase = z.infer<typeof workCommandBaseSchema>;

export type WorkCommand<T = unknown> = WorkCommandBase & { payload: T };
