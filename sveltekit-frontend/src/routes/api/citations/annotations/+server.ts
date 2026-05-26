import {
  CITATION_ANNOTATION_EVENTS,
  CITATION_ANNOTATION_PROGRESS_STATES,
  citationAnnotationRedisKeys,
  db,
  evidenceBoardEdges,
  savedCitationAnnotations,
  savedCitations,
} from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import { and, desc, eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const listSchema = z.object({
  citationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createSchema = z.object({
  citationId: z.string().uuid(),
  annotationType: z.string().max(64).optional().default('comment'),
  body: z.string().min(1).max(20000),
  logic: z.string().max(128).optional().default('add_comment_under_saved_citation'),
  sourceRefs: z.array(z.string().max(500)).max(100).optional().default([]),
  chunkIds: z.array(z.string().max(200)).max(200).optional().default([]),
  llmOutput: z.string().max(50000).optional(),
  tokenMap: z
    .object({
      citationTokens: z.array(z.string().max(120)).max(200).optional(),
      annotationTokens: z.array(z.string().max(120)).max(200).optional(),
      relation: z.string().max(120).optional(),
    })
    .optional()
    .default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  boardId: z.string().max(200).optional(),
  fromNodeId: z.string().max(200).optional(),
  toNodeId: z.string().max(200).optional(),
  relationType: z.string().max(120).optional(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

async function publishLifecycleEvents(payload: Record<string, unknown>) {
  const exchange = 'document.processing';
  const events = [
    CITATION_ANNOTATION_EVENTS.created,
    CITATION_ANNOTATION_EVENTS.indexRedis,
    CITATION_ANNOTATION_EVENTS.embed,
    CITATION_ANNOTATION_EVENTS.distill,
    CITATION_ANNOTATION_EVENTS.memoryCardRefresh,
  ] as const;

  for (const eventName of events) {
    await rabbitmq
      .publishWhenReady(exchange, eventName, { ...payload, eventName, ts: Date.now() })
      .catch(() => undefined);
  }
}

async function publishProgress(progress: readonly string[], payload: Record<string, unknown>) {
  const redis = getRedis();
  for (const state of progress) {
    await redis
      .publish(
        'service_worker_progress',
        JSON.stringify({
          flow: 'citation_annotation',
          state,
          ts: Date.now(),
          ...payload,
        })
      )
      .catch(() => 0);
  }
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user?.id) return json({ success: false, annotations: [] }, { status: 401 });

  const parsed = listSchema.safeParse({
    citationId: url.searchParams.get('citationId'),
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return json({ success: false, annotations: [], error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { citationId, limit } = parsed.data;
  const userId = locals.user.id;

  const [citation] = await db
    .select({ id: savedCitations.id })
    .from(savedCitations)
    .where(and(eq(savedCitations.id, citationId), eq(savedCitations.userId, userId)))
    .limit(1)
    .catch(() => []);

  if (!citation) return json({ success: true, annotations: [], edges: [] });

  const [annotations, edges] = await Promise.all([
    db
      .select()
      .from(savedCitationAnnotations)
      .where(eq(savedCitationAnnotations.citationId, citationId))
      .orderBy(desc(savedCitationAnnotations.createdAt))
      .limit(limit)
      .catch(() => []),
    db
      .select()
      .from(evidenceBoardEdges)
      .where(eq(evidenceBoardEdges.citationId, citationId))
      .orderBy(desc(evidenceBoardEdges.createdAt))
      .limit(limit)
      .catch(() => []),
  ]);

  return json({ success: true, annotations, edges });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const userId = locals.user.id;
  const payload = parsed.data;

  const [citation] = await db
    .select({ id: savedCitations.id })
    .from(savedCitations)
    .where(and(eq(savedCitations.id, payload.citationId), eq(savedCitations.userId, userId)))
    .limit(1)
    .catch(() => []);

  if (!citation) {
    return json({ success: false, error: 'Citation not found' }, { status: 404 });
  }

  const annotationId = crypto.randomUUID();
  const edgeId = payload.fromNodeId && payload.toNodeId && payload.relationType ? crypto.randomUUID() : null;

  const progress: string[] = ['draft_saved_local', 'uploading'];

  const [annotation] = await db
    .insert(savedCitationAnnotations)
    .values({
      id: annotationId,
      citationId: payload.citationId,
      userId,
      annotationType: payload.annotationType,
      body: payload.body,
      logic: payload.logic,
      sourceRefs: payload.sourceRefs,
      chunkIds: payload.chunkIds,
      llmOutput: payload.llmOutput ?? null,
      tokenMap: payload.tokenMap,
      metadata: payload.metadata,
    })
    .returning();

  progress.push('postgres_saved');

  let edge: typeof evidenceBoardEdges.$inferSelect | null = null;
  if (edgeId && payload.fromNodeId && payload.toNodeId && payload.relationType) {
    [edge] = await db
      .insert(evidenceBoardEdges)
      .values({
        id: edgeId,
        boardId: payload.boardId ?? null,
        fromNodeId: payload.fromNodeId,
        toNodeId: payload.toNodeId,
        relationType: payload.relationType,
        citationId: payload.citationId,
        annotationId,
        confidence: payload.confidence,
        metadata: payload.metadata,
      })
      .returning();

    await rabbitmq
      .publishWhenReady('document.processing', CITATION_ANNOTATION_EVENTS.edgeCreated, {
        edgeId,
        annotationId,
        citationId: payload.citationId,
        userId,
        ts: Date.now(),
      })
      .catch(() => undefined);
  }

  const redis = getRedis();
  const annotationKey = citationAnnotationRedisKeys.annotation(annotationId);
  const citationAnnotationsKey = citationAnnotationRedisKeys.citationAnnotations(payload.citationId);
  const citationPacketKey = citationAnnotationRedisKeys.citationMemoryPacket(payload.citationId);
  const recentAnnotationsKey = citationAnnotationRedisKeys.userRecentAnnotations(userId);

  await Promise.all([
    redis.set(annotationKey, JSON.stringify(annotation), 'EX', 60 * 60),
    redis.lpush(citationAnnotationsKey, annotationId),
    redis.ltrim(citationAnnotationsKey, 0, 199),
    redis.expire(citationAnnotationsKey, 60 * 60),
    redis.lpush(recentAnnotationsKey, annotationId),
    redis.ltrim(recentAnnotationsKey, 0, 99),
    redis.expire(recentAnnotationsKey, 60 * 60),
    redis.set(
      citationPacketKey,
      JSON.stringify({
        citationId: payload.citationId,
        annotationId,
        edgeId,
        sourceRefs: payload.sourceRefs,
        chunkIds: payload.chunkIds,
        llmOutput: payload.llmOutput ?? null,
        tokenMap: payload.tokenMap,
        memoryPacketType: 'saved_citation_annotation',
        updatedAt: new Date().toISOString(),
      }),
      'EX',
      60 * 60
    ),
  ]).catch(() => undefined);

  progress.push('redis_indexed');

  const eventPayload = {
    annotationId,
    citationId: payload.citationId,
    userId,
    sourceRefs: payload.sourceRefs,
    chunkIds: payload.chunkIds,
    boardId: payload.boardId ?? null,
  };

  await publishLifecycleEvents(eventPayload);

  progress.push('embedded', 'memory_card_refreshed', 'complete');

  await publishProgress(progress, eventPayload).catch(() => undefined);

  return json({
    success: true,
    annotation,
    edge,
    redisKeys: {
      annotation: annotationKey,
      citationAnnotations: citationAnnotationsKey,
      citationMemoryPacket: citationPacketKey,
      userRecentAnnotations: recentAnnotationsKey,
      evidenceBoardEdges: payload.boardId
        ? citationAnnotationRedisKeys.evidenceBoardEdges(payload.boardId)
        : null,
    },
    queueEvents: CITATION_ANNOTATION_EVENTS,
    progress,
    progressStates: CITATION_ANNOTATION_PROGRESS_STATES,
  });
};
