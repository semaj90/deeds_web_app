import { z } from 'zod';

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

export const workCommandBaseSchema = z.object({
  commandId: z.string().uuid(),
  commandType: taskTypeSchema,
  issuedAt: z.string().datetime(),
  traceId: z.string().min(1).optional(),
  requestId: z.string().uuid(),
  runId: z.string().uuid(),
  taskId: z.string().uuid(),
  capability: z.string().min(1),
  targetWorkerClass: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  timeoutMs: z.number().int().positive().max(7_200_000),
  idempotencyKey: z.string().min(1),
});

export type WorkCommandBase = z.infer<typeof workCommandBaseSchema>;

export type WorkCommand<T = unknown> = WorkCommandBase & { payload: T };
