/**
 * workflow tRPC router
 *
 *   workflow.start   — create a run and enqueue its first dispatch event
 *   workflow.resume  — unblock a run (must be in 'blocked' state)
 *   workflow.approve — record a human-in-the-loop approval decision
 *   workflow.get     — fetch a run by ID
 *   workflow.cancel  — cancel any non-terminal run
 *
 * All state mutations are atomic: the Postgres row update and the
 * workflow_outbox INSERT commit in the same transaction. If the process
 * crashes after commit, the outbox publisher retries delivery to RabbitMQ.
 * If it crashes before commit, nothing was dispatched — safe to retry.
 *
 * Run-level outbox events use task_id = NULL (issue 10).
 * Task-level events use the actual workflow_tasks.id.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
  assertRunOwner,
  transitionRun,
  cancelRun,
  recordApproval,
  type DbExecutor,
} from '../agent-run-service.js';

export const workflowRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(4000),
        graphId: z.string().min(1),
        traceId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const runId = crypto.randomUUID();
      const traceId = input.traceId ?? crypto.randomUUID();

      // Issue 3: run insert and outbox insert are atomic.
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO workflow_runs (
            id, user_id, status, trace_id, query, graph_id, started_at, updated_at
          ) VALUES (
            ${runId}::uuid,
            ${ctx.userId},
            'received',
            ${traceId},
            ${input.query},
            ${input.graphId},
            NOW(),
            NOW()
          )
        `);

        // Issue 10: run-level event — task_id is NULL (no workflow_task yet).
        await tx.execute(sql`
          INSERT INTO workflow_outbox (
            id, run_id, task_id, event_type, payload,
            routing_key, exchange, attempt, created_at
          ) VALUES (
            gen_random_uuid(),
            ${runId}::uuid,
            NULL,
            'workflow.run.started',
            ${JSON.stringify({
              runId,
              traceId,
              query: input.query,
              graphId: input.graphId,
            })}::jsonb,
            'workflow.started',
            'atlas.tasks.v1',
            0,
            NOW()
          )
        `);
      });

      return { runId, traceId, status: 'received' as const };
    }),

  resume: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        resumePayload: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Issue 4: transitionRun enforces WHERE status = 'blocked'.
      await db.transaction(async (tx) => {
        const exec = tx as DbExecutor;
        await assertRunOwner(input.runId, ctx.userId, exec);
        await transitionRun({
          runId: input.runId,
          userId: ctx.userId,
          from: 'blocked',
          to: 'executing',
          reason: 'resumed',
          extraOutboxPayload: { resumePayload: input.resumePayload ?? {} },
          executor: exec,
        });
      });

      return { runId: input.runId, status: 'executing' as const };
    }),

  approve: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        approvalId: z.string().uuid(),
        decision: z.enum(['approved', 'rejected']),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Issue 5: idempotent via UNIQUE(run_id, approval_id) ON CONFLICT DO NOTHING.
      // Issue 4: transition guard rejects approval on non-blocked run.
      // Issue 12: rejected → 'cancelled', not 'failed'.
      const result = await recordApproval({
        runId: input.runId,
        userId: ctx.userId,
        approvalId: input.approvalId,
        decision: input.decision,
        note: input.note,
      });

      return { runId: input.runId, decision: result.decision };
    }),

  get: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return assertRunOwner(input.runId, ctx.userId);
    }),

  cancel: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Issue 11: delegate to shared service.
      // Issue 12: emits cancellation outbox event; uses 'cancelled' not 'failed'.
      await cancelRun(input.runId, ctx.userId);
      return { runId: input.runId, status: 'cancelled' as const };
    }),
});
