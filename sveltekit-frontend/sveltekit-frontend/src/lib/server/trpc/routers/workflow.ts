import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function _assertRunOwner(runId: string, userId: string): Promise<void> {
  const rows = await db.execute(sql`
    SELECT id FROM agent_runs
    WHERE id = ${runId}::uuid AND user_id = ${Number(userId)}
  `);
  if (!rows.rows?.length) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Run ${runId} not found or not yours` });
  }
}

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

      await db.execute(sql`
        INSERT INTO agent_runs (id, user_id, status, trace_id, query, graph_id, started_at, updated_at)
        VALUES (
          ${runId}::uuid,
          ${Number(ctx.userId)},
          'received',
          ${traceId},
          ${input.query},
          ${input.graphId},
          NOW(),
          NOW()
        )
      `);

      await db.execute(sql`
        INSERT INTO workflow_outbox (
          id, run_id, task_id, event_type, payload, routing_key, exchange, attempt, created_at
        ) VALUES (
          gen_random_uuid(),
          ${runId}::uuid,
          ${runId}::uuid,
          'workflow.started',
          ${JSON.stringify({ runId, traceId, query: input.query, graphId: input.graphId })}::jsonb,
          'workflow.started',
          'atlas.tasks.v1',
          0,
          NOW()
        )
      `);

      return { runId, traceId, status: 'received' as const };
    }),

  resume: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await _assertRunOwner(input.runId, ctx.userId);

      const result = await db.execute(sql`
        UPDATE agent_runs
        SET status = 'executing', updated_at = NOW()
        WHERE id = ${input.runId}::uuid
          AND user_id = ${Number(ctx.userId)}
          AND status = 'blocked'
        RETURNING id
      `);

      if (!result.rows?.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Run ${input.runId} is not in 'blocked' status`,
        });
      }

      await db.execute(sql`
        INSERT INTO workflow_outbox (
          id, run_id, task_id, event_type, payload, routing_key, exchange, attempt, created_at
        ) VALUES (
          gen_random_uuid(),
          ${input.runId}::uuid,
          ${input.runId}::uuid,
          'workflow.resumed',
          ${JSON.stringify({ runId: input.runId })}::jsonb,
          'workflow.resumed',
          'atlas.tasks.v1',
          0,
          NOW()
        )
      `);

      return { runId: input.runId, resumed: true };
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
      await _assertRunOwner(input.runId, ctx.userId);

      await db.execute(sql`
        INSERT INTO workflow_approvals (
          id, run_id, approval_id, decision, note, decided_by, decided_at
        ) VALUES (
          gen_random_uuid(),
          ${input.runId}::uuid,
          ${input.approvalId}::uuid,
          ${input.decision},
          ${input.note ?? null},
          ${Number(ctx.userId)},
          NOW()
        )
      `);

      const newStatus = input.decision === 'approved' ? 'executing' : 'failed';
      await db.execute(sql`
        UPDATE agent_runs
        SET status = ${newStatus}, updated_at = NOW()
        WHERE id = ${input.runId}::uuid AND user_id = ${Number(ctx.userId)}
      `);

      await db.execute(sql`
        INSERT INTO workflow_outbox (
          id, run_id, task_id, event_type, payload, routing_key, exchange, attempt, created_at
        ) VALUES (
          gen_random_uuid(),
          ${input.runId}::uuid,
          ${input.runId}::uuid,
          'workflow.approval_decided',
          ${JSON.stringify({ runId: input.runId, approvalId: input.approvalId, decision: input.decision })}::jsonb,
          'workflow.approval_decided',
          'atlas.tasks.v1',
          0,
          NOW()
        )
      `);

      return { runId: input.runId, decision: input.decision };
    }),

  get: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const rows = await db.execute(sql`
        SELECT
          id, status, trace_id AS "traceId", query, graph_id AS "graphId",
          started_at AS "startedAt", updated_at AS "updatedAt", last_error_code AS "lastErrorCode"
        FROM agent_runs
        WHERE id = ${input.runId}::uuid AND user_id = ${Number(ctx.userId)}
      `);

      const run = rows.rows?.[0];
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Run ${input.runId} not found` });
      }
      return run;
    }),

  cancel: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.execute(sql`
        UPDATE agent_runs
        SET status = 'failed', last_error_code = 'cancelled_by_user', updated_at = NOW()
        WHERE id = ${input.runId}::uuid
          AND user_id = ${Number(ctx.userId)}
          AND status NOT IN ('completed', 'failed')
        RETURNING id
      `);

      if (!result.rows?.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Run ${input.runId} not found, not yours, or already terminal`,
        });
      }

      return { runId: input.runId, cancelled: true };
    }),
});
