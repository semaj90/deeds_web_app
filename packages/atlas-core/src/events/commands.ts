/**
 * WorkCommand envelope — the "command" half of the two-envelope model.
 *
 * Commands mean: "Please perform this work."
 * Events mean:  "This fact occurred."
 *
 * Never reuse one envelope ambiguously for both.
 *
 * Rule: a Postgres task row MUST exist before any WorkCommand is published
 * to RabbitMQ. The outbox pattern (insert task + outbox row in the same
 * transaction) enforces this — see queue/outbox.ts.
 *
 * Rule: the message payload carries query-specific context.
 *       The queue/routing-key name does NOT. Never derive a queue name
 *       from raw query text.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Registered task types (finite registry — do not add without a bound queue)
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
// Generic WorkCommand<T>
// ---------------------------------------------------------------------------

export const workCommandBaseSchema = z.object({
  /** UUID — unique per command issuance */
  commandId: z.string().uuid(),

  commandType: taskTypeSchema,

  /** ISO-8601 */
  issuedAt: z.string().datetime(),

  // ── Correlation ────────────────────────────────────────────────────────

  /** OTel / NATS propagated trace */
  traceId: z.string().min(1).optional(),

  /** Which HTTP/tRPC request originated this */
  requestId: z.string().uuid(),

  /** LangGraph run */
  runId: z.string().uuid(),

  /** Postgres workflow_tasks.id */
  taskId: z.string().uuid(),

  // ── Routing ────────────────────────────────────────────────────────────

  /** e.g. "code.audit", "retrieval" — used for policy checks */
  capability: z.string().min(1),

  /** e.g. "atlas.worker.opencode.v1" — bound queue name */
  targetWorkerClass: z.string().min(1),

  // ── Delivery guarantees ────────────────────────────────────────────────

  /** 0-based — incremented by the retry lane */
  attempt: z.number().int().nonnegative(),

  timeoutMs: z.number().int().positive().max(7_200_000),

  /**
   * SHA-256 of (taskId + attempt + commandType + a stable hash of payload).
   * The worker checks this in Postgres before executing to reject duplicates.
   */
  idempotencyKey: z.string().min(1),
});

export type WorkCommandBase = z.infer<typeof workCommandBaseSchema>;

/** Typed WorkCommand<T> — payload is validated separately by the handler */
export type WorkCommand<T = unknown> = WorkCommandBase & { payload: T };

/** Construct a WorkCommand with an unvalidated payload (handler validates) */
export function makeWorkCommand<T>(
  base: WorkCommandBase,
  payload: T,
): WorkCommand<T> {
  return { ...base, payload };
}
