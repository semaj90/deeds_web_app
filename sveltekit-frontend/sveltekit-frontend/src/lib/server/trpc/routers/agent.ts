import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

export const agentRouter = router({
  runs: router({
    get: protectedProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const rows = await db.execute(sql`
          SELECT
            r.id,
            r.status,
            r.trace_id,
            r.query,
            r.graph_id,
            r.started_at,
            r.updated_at,
            r.last_error_code,
            COALESCE(
              json_agg(t.id ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL),
              '[]'
            ) AS task_ids,
            COALESCE(
              json_agg(a.id ORDER BY a.created_at) FILTER (WHERE a.id IS NOT NULL),
              '[]'
            ) AS artifact_ids
          FROM agent_runs r
          LEFT JOIN workflow_tasks t ON t.run_id = r.id
          LEFT JOIN artifacts a ON a.run_id = r.id
          WHERE r.id = ${input.runId}::uuid
            AND r.user_id = ${Number(ctx.userId)}
          GROUP BY r.id
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

    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
          cursor: z.string().uuid().optional(),
          status: z.enum(['received', 'planning', 'executing', 'validating', 'blocked', 'completed', 'failed']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const rows = await db.execute(sql`
          SELECT id, status, trace_id, query, graph_id, started_at, updated_at, last_error_code
          FROM agent_runs
          WHERE user_id = ${Number(ctx.userId)}
            ${input.status ? sql`AND status = ${input.status}` : sql``}
            ${input.cursor ? sql`AND id < ${input.cursor}::uuid` : sql``}
          ORDER BY started_at DESC
          LIMIT ${input.limit + 1}
        `);

        const items = rows.rows ?? [];
        const hasMore = items.length > input.limit;
        const page = hasMore ? items.slice(0, input.limit) : items;
        const nextCursor = hasMore ? String((page[page.length - 1] as Record<string, unknown>).id) : undefined;

        return { items: page, nextCursor };
      }),
  }),
});
