/**
 * GET  /api/clusters/cards
 * POST /api/clusters/cards  (upsert)
 *
 * Cluster Card API — serves the denormalized routing-tier cluster cards used
 * by the ACE pipeline for fast candidate retrieval before full Qdrant ANN.
 *
 * GET params:
 *   collection   — filter by Qdrant collection (e.g. "codebase_chunks")
 *   limit        — max cards to return (default 20, max 100)
 *   min_score    — minimum authorityScore threshold (0-1, default 0)
 *   centroid_id  — fetch a single card by centroid_id (UUID)
 *
 * Redis hot path: cluster:card:{centroid_id} → JSON string (TTL 3600s)
 * Postgres fallback: cluster_cards table (Drizzle)
 *
 * POST body (JSON): NewClusterCard — upsert a cluster card and warm Redis.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { clusterCards } from '$lib/server/db/schema-postgres.js';
import { eq, gte, and, desc } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

// ── Redis helpers ─────────────────────────────────────────────────────────────

const CARD_TTL = 3600; // 1 hour

async function warmCardToRedis(card: typeof clusterCards.$inferSelect): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      `cluster:card:${card.centroidId}`,
      CARD_TTL,
      JSON.stringify(card)
    );
  } catch {
    // Redis unavailable — Postgres is fallback, not fatal
  }
}

async function getCardFromRedis(centroidId: string): Promise<typeof clusterCards.$inferSelect | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`cluster:card:${centroidId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
  const centroidId = url.searchParams.get('centroid_id');
  const collection  = url.searchParams.get('collection') ?? undefined;
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const minScore    = parseFloat(url.searchParams.get('min_score') ?? '0');

  // ── Single card lookup (Redis → Postgres) ────────────────────────────────
  if (centroidId) {
    // 1. Redis L1
    const cached = await getCardFromRedis(centroidId);
    if (cached) {
      return json({ card: cached, source: 'redis' });
    }

    // 2. Postgres L2
    const rows = await db
      .select()
      .from(clusterCards)
      .where(eq(clusterCards.centroidId, centroidId))
      .limit(1);

    if (!rows.length) {
      return json({ card: null, source: 'postgres' }, { status: 404 });
    }

    const card = rows[0];
    await warmCardToRedis(card);
    return json({ card, source: 'postgres' });
  }

  // ── Collection listing ─────────────────────────────────────────────────────
  const conditions = [];
  if (collection) conditions.push(eq(clusterCards.collection, collection));
  if (minScore > 0) conditions.push(gte(clusterCards.authorityScore, minScore));

  const rows = await db
    .select()
    .from(clusterCards)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(clusterCards.authorityScore))
    .limit(limit);

  // Warm all results to Redis in the background
  void Promise.allSettled(rows.map(warmCardToRedis));

  return json({
    cards: rows,
    count: rows.length,
    collection: collection ?? 'all',
    source: 'postgres',
  });
};

// ── POST (upsert) ─────────────────────────────────────────────────────────────

const UpsertSchema = z.object({
  centroidId:              z.string().uuid(),
  collection:              z.string().min(1).max(100),
  topChunkIds:             z.array(z.string().uuid()).default([]),
  topFilePaths:            z.array(z.string()).default([]),
  topTags:                 z.array(z.string()).default([]),
  clusterSummary:          z.string().max(4000).optional(),
  authorityScore:          z.number().min(0).max(1).default(0),
  memberCount:             z.number().int().min(0).default(0),
  representativeEmbedding: z.array(z.number()).length(768).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  // Require authenticated user or internal service key
  const user = locals.user;
  const serviceKey = request.headers.get('x-service-key');
  const validServiceKey = process.env.INTERNAL_SERVICE_KEY;

  if (!user && !(validServiceKey && serviceKey === validServiceKey)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // Upsert into Postgres
  const row = await db
    .insert(clusterCards)
    .values({
      centroidId:     data.centroidId,
      collection:     data.collection,
      topChunkIds:    data.topChunkIds,
      topFilePaths:   data.topFilePaths,
      topTags:        data.topTags,
      clusterSummary: data.clusterSummary ?? null,
      authorityScore: data.authorityScore,
      memberCount:    data.memberCount,
      lastRebuiltAt:  new Date(),
    })
    .onConflictDoUpdate({
      target: clusterCards.centroidId,
      set: {
        collection:     data.collection,
        topChunkIds:    data.topChunkIds,
        topFilePaths:   data.topFilePaths,
        topTags:        data.topTags,
        clusterSummary: data.clusterSummary ?? null,
        authorityScore: data.authorityScore,
        memberCount:    data.memberCount,
        lastRebuiltAt:  new Date(),
      },
    })
    .returning();

  const saved = row[0];

  // Warm Redis
  await warmCardToRedis(saved);

  return json({ card: saved, upserted: true }, { status: 201 });
};
