/**
 * GET  /api/analytics/context-timeline — paginated read-side for the RL audit trail
 * POST /api/analytics/context-timeline — append a single event (write path)
 *
 * GET query params:
 *   cursor      — ISO 8601 timestamp (exclusive upper bound); omit for first page
 *   limit       — rows per page (default 50, max 200)
 *   eventType   — filter to one event class (feedback|rl_adapt|research|citation|...)
 *   pipeline    — filter to one pipeline (ace|rag|kag|dag|codebase)
 *   sessionId   — filter to one session
 *
 * POST body (JSON):
 *   eventType           — required; one of the event_type values
 *   pipeline            — pipeline tag (default "ace")
 *   sessionId           — session identifier (default "")
 *   summaryId           — optional UUID linking to research_summaries
 *   hyperedgeHash       — optional 8-char hash identifying hyperedge anchor
 *   signal              — optional feedback signal (thumbs_up|thumbs_down|dwell_long|...)
 *   grpoReward          — optional float reward score
 *   pipelineWeightAfter — optional float post-update weight snapshot
 *   triggeredRebuild    — whether this event triggered a hypergraph rebuild
 *   payload             — arbitrary JSON metadata
 *
 * GET response shape (degraded contract — same keys on error as on success):
 *   { events: ContextTimelineRow[], nextCursor: string | null, total: number }
 *
 * POST response:
 *   { id: string }  on success
 *   { error: string } on failure
 */

import { json }                from '@sveltejs/kit';
import { z }                   from 'zod';
import { db }                  from '$lib/server/db/client';
import { contextTimeline }     from '$lib/server/db/schema-postgres.js';
import { desc, lt, eq, and }   from 'drizzle-orm';
import type { RequestHandler } from './$types';

const MAX_LIMIT = 200;

// ─── GET ──────────────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  cursor:    z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid datetime').optional(),
  limit:     z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
  eventType: z.string().max(30).optional(),
  pipeline:  z.string().max(20).optional(),
  sessionId: z.string().max(128).optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ events: [], nextCursor: null, total: 0 }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json(
      { events: [], nextCursor: null, total: 0, error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { cursor, limit, eventType, pipeline, sessionId } = parsed.data;

  try {
    const conditions = [];

    if (cursor)    conditions.push(lt(contextTimeline.createdAt, new Date(cursor)));
    if (eventType) conditions.push(eq(contextTimeline.eventType, eventType));
    if (pipeline)  conditions.push(eq(contextTimeline.pipeline, pipeline));
    if (sessionId) conditions.push(eq(contextTimeline.sessionId, sessionId));

    const rows = await db
      .select()
      .from(contextTimeline)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contextTimeline.createdAt))
      .limit(limit + 1); // fetch one extra to detect next page

    const hasMore    = rows.length > limit;
    const events     = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? events[events.length - 1]?.createdAt?.toISOString() ?? null
      : null;

    return json({ events, nextCursor, total: events.length });
  } catch (err) {
    console.error('[context-timeline] GET failed:', (err as Error).message);
    return json({ events: [], nextCursor: null, total: 0 });
  }
};

// ─── POST ─────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PostSchema = z.object({
  eventType:           z.string().min(1).max(30),
  pipeline:            z.string().max(20).default('ace'),
  sessionId:           z.string().max(128).default(''),
  summaryId:           z.string().uuid().optional(),
  hyperedgeHash:       z.string().max(8).optional(),
  signal:              z.string().max(30).optional(),
  grpoReward:          z.number().optional(),
  pipelineWeightAfter: z.number().optional(),
  triggeredRebuild:    z.boolean().default(false),
  payload:             z.record(z.string(), z.unknown()).default({}),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  const {
    eventType, pipeline, sessionId, summaryId, hyperedgeHash,
    signal, grpoReward, pipelineWeightAfter, triggeredRebuild, payload,
  } = parsed.data;

  try {
    const [row] = await db
      .insert(contextTimeline)
      .values({
        userId:              Number(locals.user.id),
        sessionId,
        eventType,
        pipeline,
        summaryId:           summaryId ?? null,
        hyperedgeHash:       hyperedgeHash ?? null,
        signal:              signal ?? null,
        grpoReward:          grpoReward ?? null,
        pipelineWeightAfter: pipelineWeightAfter ?? null,
        triggeredRebuild,
        payload,
      })
      .returning({ id: contextTimeline.id });

    return json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[context-timeline] POST failed:', (err as Error).message);
    return json({ error: 'Failed to record event' }, { status: 500 });
  }
};
