/**
 * analytics tRPC router
 *
 *   analytics.events.list — paginated event list from analytics_events table
 *   analytics.stream.token — reserved (SSE via dedicated endpoint, not tRPC)
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../init.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { AnalyticsEventTypeSchema } from '$lib/server/analytics/analytics-event-envelope.js';

export const analyticsRouter = router({
  events: router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(200).default(50),
          cursor: z.string().optional(),
          eventType: AnalyticsEventTypeSchema.optional(),
          traceId: z.string().optional(),
          sessionId: z.string().optional(),
          since: z.string().datetime().optional(),
        })
      )
      .query(async ({ input }) => {
        const rows = await db.execute(sql`
          SELECT
            id,
            event_type AS "eventType",
            user_id AS "userId",
            session_id AS "sessionId",
            payload,
            created_at AS "createdAt"
          FROM analytics_events
          WHERE TRUE
            ${input.eventType ? sql`AND event_type = ${input.eventType}` : sql``}
            ${input.traceId ? sql`AND payload->>'traceId' = ${input.traceId}` : sql``}
            ${input.sessionId ? sql`AND session_id = ${input.sessionId}` : sql``}
            ${input.since ? sql`AND created_at >= ${input.since}::timestamptz` : sql``}
            ${input.cursor ? sql`AND id < ${input.cursor}::uuid` : sql``}
          ORDER BY created_at DESC
          LIMIT ${input.limit + 1}
        `);

        const items = rows.rows ?? [];
        const hasMore = items.length > input.limit;
        const page = hasMore ? items.slice(0, input.limit) : items;
        const nextCursor = hasMore
          ? String((page[page.length - 1] as Record<string, unknown>).id)
          : undefined;

        return { items: page, nextCursor };
      }),
  }),

  recommendation: router({
    feedback: protectedProcedure
      .input(
        z.object({
          traceId: z.string().min(1),
          packetKey: z.string().min(1),
          action: z.enum(['impression', 'click', 'accept', 'dismiss']),
          rank: z.number().int().positive().optional(),
          score: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { emit, makeEvent } = await import('$lib/server/analytics/analytics-sink.js');

        const eventTypeMap = {
          impression: 'recommendation.impression',
          click: 'recommendation.click',
          accept: 'recommendation.accept',
          dismiss: 'recommendation.dismiss',
        } as const;

        emit(
          makeEvent({
            eventType: eventTypeMap[input.action],
            traceId: input.traceId,
            userId: ctx.userId,
            sessionId: ctx.sessionId,
            packetKey: input.packetKey,
            rank: input.rank,
            score: input.score,
          })
        );

        return { recorded: true };
      }),
  }),
});
