/**
 * agent tRPC router
 *
 *   agent.runs.get    — fetch a run with its task IDs and artifact IDs
 *   agent.runs.cancel — cancel a run (delegates to agent-run-service)
 *   agent.runs.list   — keyset-paginated list of recent runs
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { agentRunStatusSchema } from '../run-status.js';
import { cancelRun } from '../agent-run-service.js';

export const agentRouter = router({
  runs: router({
    get: protectedProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        // Issue 8: correlated subqueries avoid the LEFT JOIN × LEFT JOIN
        // Cartesian multiplication. Three tasks × four artifacts would
        // previously produce twelve rows and duplicate every aggregate.
        const rows = await db.execute(sql`
          SELECT
            r.id,
            r.status,
            r.trace_id     AS "traceId",
            r.query,
            r.graph_id     AS "graphId",
            r.started_at   AS "startedAt",
            r.updated_at   AS "updatedAt",
            r.last_error_code AS "lastErrorCode",
            (
              SELECT COALESCE(jsonb_agg(t.id ORDER BY t.created_at), '[]'::jsonb)
              FROM workflow_tasks t
              WHERE t.run_id = r.id
            ) AS "taskIds",
            (
              SELECT COALESCE(jsonb_agg(a.id ORDER BY a.created_at), '[]'::jsonb)
              FROM artifacts a
              WHERE a.run_id = r.id
            ) AS "artifactIds"
          FROM workflow_runs r
          WHERE r.id = ${input.runId}::uuid
            AND r.user_id = ${ctx.userId}
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
        // Issue 11: single implementation lives in agent-run-service.
        await cancelRun(input.runId, ctx.userId);
        return { runId: input.runId, status: 'cancelled' as const };
      }),

    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
          // Issue 9: compound cursor encodes (startedAt, id) for stable keyset pagination.
          // UUID ordering has no relationship to started_at; random UUIDs cannot
          // serve as a time cursor.
          cursor: z
            .object({
              startedAt: z.string().datetime(),
              id: z.string().uuid(),
            })
            .optional(),
          status: agentRunStatusSchema.optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        // Issue 9: keyset pagination on (started_at DESC, id DESC).
        // The compound index on workflow_runs(user_id, started_at DESC) makes
        // this O(1) regardless of page depth.
        const rows = await db.execute(sql`
          SELECT
            id,
            status,
            trace_id     AS "traceId",
            query,
            graph_id     AS "graphId",
            started_at   AS "startedAt",
            updated_at   AS "updatedAt",
            last_error_code AS "lastErrorCode"
          FROM workflow_runs
          WHERE user_id = ${ctx.userId}
            ${input.status ? sql`AND status = ${input.status}` : sql``}
            ${
              input.cursor
                ? sql`AND (started_at, id) < (
                    ${input.cursor.startedAt}::timestamptz,
                    ${input.cursor.id}::uuid
                  )`
                : sql``
            }
          ORDER BY started_at DESC, id DESC
          LIMIT ${input.limit + 1}
        `);

        const items = rows.rows ?? [];
        const hasMore = items.length > input.limit;
        const page = hasMore ? items.slice(0, input.limit) : items;

        let nextCursor:
          | { startedAt: string; id: string }
          | undefined;

        if (hasMore) {
          const last = page[page.length - 1] as Record<string, unknown>;
          nextCursor = {
            startedAt: String(last.startedAt),
            id: String(last.id),
          };
        }

        return { items: page, nextCursor };
      }),
  }),
});
