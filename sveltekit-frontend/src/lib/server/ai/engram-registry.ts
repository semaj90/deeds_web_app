import { z } from 'zod';
import type Redis from 'ioredis';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';
import { rankIntent } from '$lib/intent/regex-intent.js';
import { getDidYouMeanFromEngram } from '$lib/server/ai/engram-memory.js';
import {
  contextTimeline,
  engramCards,
  intentEvalRuns,
  memoryRegistry,
} from '$lib/server/db/schema.js';

function summarizeText(input: string, max = 280): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter(Boolean);
}

function tf(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function cosineText(a: string, b: string): number {
  const av = tf(tokenize(a));
  const bv = tf(tokenize(b));

  let magA = 0;
  let magB = 0;
  let dot = 0;

  for (const value of av.values()) {
    magA += value * value;
  }
  for (const value of bv.values()) {
    magB += value * value;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  for (const [token, value] of av.entries()) {
    dot += value * (bv.get(token) ?? 0);
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim().length > 0) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object' && 'suggestion' in item) {
      const suggestion = (item as { suggestion?: unknown }).suggestion;
      if (typeof suggestion === 'string' && suggestion.trim().length > 0) {
        out.push(suggestion.trim());
      }
    }
  }

  return out;
}

export interface RecalledEngramCard {
  memoryId: string;
  scope: string;
  summary: string;
  score: number;
  sourceRefs: unknown[];
  didYouMean: string[];
}

export interface IntentRecallResult {
  intent: ReturnType<typeof rankIntent>;
  cards: RecalledEngramCard[];
  didYouMean: string[];
}

export async function recallEngramsForIntent(input: {
  query: string;
  limit?: number;
  scope?: string;
  runId?: string;
}): Promise<IntentRecallResult> {
  const rankedIntent = rankIntent(input.query);
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));

  try {
    const registryRows =
      rankedIntent.label === 'unknown'
        ? await db
            .select({ memoryId: memoryRegistry.memoryId, hotness: memoryRegistry.hotness })
            .from(memoryRegistry)
            .orderBy(desc(memoryRegistry.hotness), desc(memoryRegistry.updatedAt))
            .limit(30)
        : await db
            .select({ memoryId: memoryRegistry.memoryId, hotness: memoryRegistry.hotness })
            .from(memoryRegistry)
            .where(eq(memoryRegistry.userIntent, rankedIntent.label))
            .orderBy(desc(memoryRegistry.hotness), desc(memoryRegistry.updatedAt))
            .limit(30);

    const boostedMemoryIds = new Set(
      registryRows
        .map((row) => row.memoryId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    );

    const hotnessByMemoryId = new Map<string, number>();
    for (const row of registryRows) {
      if (row.memoryId) {
        hotnessByMemoryId.set(row.memoryId, row.hotness ?? 0);
      }
    }

    const cardRows =
      boostedMemoryIds.size > 0
        ? await db
            .select()
            .from(engramCards)
            .where(inArray(engramCards.memoryId, Array.from(boostedMemoryIds)))
            .limit(80)
        : await db.select().from(engramCards).limit(80);

    const scopedRows = input.scope ? cardRows.filter((row) => row.scope === input.scope) : cardRows;

    const rankedCards = scopedRows
      .map((row) => {
        const semantic = cosineText(
          input.query,
          `${row.summary} ${JSON.stringify(row.labels ?? {})}`
        );
        const hotness = Math.max(0, Math.min(1, hotnessByMemoryId.get(row.memoryId) ?? 0));
        const intentBoost = boostedMemoryIds.has(row.memoryId) ? 0.2 : 0;
        const finalScore = semantic * 0.75 + hotness * 0.05 + intentBoost;

        return {
          memoryId: row.memoryId,
          scope: row.scope,
          summary: row.summary,
          score: Number(finalScore.toFixed(4)),
          sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : [],
          didYouMean: toStringArray(row.didYouMean),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const redis = getRedis();
    const redisDym = redis
      ? await getDidYouMeanFromEngram(redis, input.query, limit).catch(() => [])
      : [];

    const blendedDidYouMean = Array.from(
      new Set([
        ...redisDym.map((entry) => entry.suggestion),
        ...rankedCards.flatMap((entry) => entry.didYouMean),
      ])
    )
      .filter((value) => value.trim().length > 0)
      .filter((value) => value.toLowerCase() !== input.query.trim().toLowerCase())
      .slice(0, limit);

    void db
      .insert(intentEvalRuns)
      .values({
        runId: input.runId ?? `intent-eval:${Date.now()}`,
        userQuery: input.query,
        predictedIntent: rankedIntent.label,
        confidence: rankedIntent.confidence,
        selectedCards: rankedCards.map((card) => card.memoryId),
        selectedClusters: [],
        cacheHit: redisDym.length > 0,
        metadata: {
          source: 'engram-recall',
          fallback: rankedIntent.fallback,
        },
      })
      .catch(() => {});

    return {
      intent: rankedIntent,
      cards: rankedCards,
      didYouMean: blendedDidYouMean,
    };
  } catch {
    return {
      intent: rankedIntent,
      cards: [],
      didYouMean: [],
    };
  }
}

function emitTimeline(
  eventType: string,
  payload: Record<string, unknown>,
  sessionId: string
): void {
  void db
    .insert(contextTimeline)
    .values({
      userId: null,
      sessionId,
      eventType,
      pipeline: 'engram-memory',
      payload,
    })
    .catch(() => {});
}

function persistMemoryRegistry(entry: {
  sourceId: string;
  chunkId?: string | null;
  summaryId?: string | null;
  embeddingId?: string | null;
  clusterId?: string | null;
  packetId?: string | null;
  memoryId?: string | null;
  featureFamily: string;
  userIntent: string;
  tags?: Record<string, unknown>;
  hotness?: number;
  metadata?: Record<string, unknown>;
}): void {
  void db
    .insert(memoryRegistry)
    .values({
      sourceId: entry.sourceId,
      chunkId: entry.chunkId ?? null,
      summaryId: entry.summaryId ?? null,
      embeddingId: entry.embeddingId ?? null,
      clusterId: entry.clusterId ?? null,
      packetId: entry.packetId ?? null,
      memoryId: entry.memoryId ?? null,
      featureFamily: entry.featureFamily,
      userIntent: entry.userIntent,
      tags: entry.tags ?? {},
      hotness: entry.hotness ?? 0,
      metadata: entry.metadata ?? {},
    })
    .catch(() => {});
}

function persistEngramCard(entry: {
  memoryId: string;
  scope: string;
  summary: string;
  labels?: Record<string, unknown>;
  relatedPaths?: unknown[];
  relatedTools?: unknown[];
  didYouMean?: unknown[];
  sourceRefs?: unknown[];
  embeddingId?: string | null;
  qdrantPointId?: string | null;
  ttlSeconds?: number | null;
}): void {
  void db
    .insert(engramCards)
    .values({
      memoryId: entry.memoryId,
      scope: entry.scope,
      summary: entry.summary,
      labels: entry.labels ?? {},
      relatedPaths: entry.relatedPaths ?? [],
      relatedTools: entry.relatedTools ?? [],
      didYouMean: entry.didYouMean ?? [],
      sourceRefs: entry.sourceRefs ?? [],
      embeddingId: entry.embeddingId ?? null,
      qdrantPointId: entry.qdrantPointId ?? null,
      ttlSeconds: entry.ttlSeconds ?? null,
    })
    .onConflictDoUpdate({
      target: engramCards.memoryId,
      set: {
        summary: entry.summary,
        labels: entry.labels ?? {},
        relatedPaths: entry.relatedPaths ?? [],
        relatedTools: entry.relatedTools ?? [],
        didYouMean: entry.didYouMean ?? [],
        sourceRefs: entry.sourceRefs ?? [],
        embeddingId: entry.embeddingId ?? null,
        qdrantPointId: entry.qdrantPointId ?? null,
        ttlSeconds: entry.ttlSeconds ?? null,
      },
    })
    .catch(() => {});
}

export const engramAcePacketInjectSchema = z.object({
  run_id: z.string().min(1).max(200),
  context_blob: z.string().min(1).max(2_000_000),
  ttl_seconds: z.number().int().min(60).max(86_400).default(3600),
});

export const engramChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(20_000),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const engramChatMemoryStoreSchema = z.object({
  user_id: z.string().min(1).max(200),
  turn: engramChatTurnSchema,
  max_turns: z.number().int().min(1).max(500).default(50),
  ttl_seconds: z.number().int().min(300).max(2_592_000).default(604_800),
});

export type EngramAcePacketInjectInput = z.infer<typeof engramAcePacketInjectSchema>;
export type EngramChatMemoryStoreInput = z.infer<typeof engramChatMemoryStoreSchema>;

export function buildAcePacketKey(runId: string): string {
  return `ace:packet:${runId}`;
}

export function buildChatMemoryKey(userId: string): string {
  return `user:memory:${userId}`;
}

export async function injectAcePacket(
  redis: Redis,
  input: EngramAcePacketInjectInput
): Promise<{
  ok: boolean;
  key: string;
  ttl: number;
  stored_ttl: number;
  size_bytes: number;
  stored_size_bytes: number;
  status: 'written';
}> {
  const key = buildAcePacketKey(input.run_id);
  const ttl = input.ttl_seconds ?? 3600;
  const sizeBytes = Buffer.byteLength(input.context_blob, 'utf8');

  await redis.set(key, input.context_blob, 'EX', ttl);

  const [exists, storedTtl, storedSize] = await Promise.all([
    redis.exists(key),
    redis.ttl(key),
    redis.strlen(key),
  ]);

  emitTimeline(
    'tool_call',
    {
      kind: 'engram.ace_packet_inject',
      run_id: input.run_id,
      redis_key: key,
      ttl,
      stored_ttl: storedTtl,
      size_bytes: sizeBytes,
      stored_size_bytes: storedSize,
      status: 'written',
    },
    input.run_id
  );

  persistMemoryRegistry({
    sourceId: `engram:ace_packet:${input.run_id}`,
    packetId: input.run_id,
    memoryId: `packet:${input.run_id}`,
    featureFamily: 'ace_packet',
    userIntent: 'context_inject',
    tags: {
      kind: 'engram.ace_packet_inject',
      pipeline: 'engram-memory',
    },
    hotness: 0.5,
    metadata: {
      redis_key: key,
      ttl,
      stored_ttl: storedTtl,
      size_bytes: sizeBytes,
      stored_size_bytes: storedSize,
    },
  });

  return {
    ok: exists === 1,
    key,
    ttl,
    stored_ttl: storedTtl,
    size_bytes: sizeBytes,
    stored_size_bytes: storedSize,
    status: 'written',
  };
}

export async function storeChatMemoryTurn(
  redis: Redis,
  input: EngramChatMemoryStoreInput
): Promise<{
  ok: true;
  redis_key: string;
  score: number;
  member_size: number;
  max_turns: number;
  count: number;
  ttl: number;
  status: 'written';
}> {
  const key = buildChatMemoryKey(input.user_id);
  const score = Date.now();
  const maxTurns = input.max_turns ?? 50;
  const ttl = input.ttl_seconds ?? 604_800;
  const member = JSON.stringify({ ...input.turn, ts: score });

  await redis
    .multi()
    .zadd(key, score, member)
    .zremrangebyrank(key, 0, -(maxTurns + 1))
    .expire(key, ttl)
    .exec();

  const count = await redis.zcard(key);
  emitTimeline(
    'tool_call',
    {
      kind: 'engram.chat_memory_store',
      user_id: input.user_id,
      redis_key: key,
      score,
      member_size: member.length,
      max_turns: maxTurns,
      count,
      ttl,
      status: 'written',
      turn: input.turn,
    },
    input.user_id
  );

  persistMemoryRegistry({
    sourceId: `engram:chat:${input.user_id}:${score}`,
    summaryId: `chat_turn:${score}`,
    memoryId: `chat:${input.user_id}`,
    featureFamily: 'chat_memory',
    userIntent: input.turn.role === 'user' ? 'chat_user_turn' : 'chat_assistant_turn',
    tags: {
      kind: 'engram.chat_memory_store',
      role: input.turn.role,
      pipeline: 'engram-memory',
    },
    hotness: 0.7,
    metadata: {
      user_id: input.user_id,
      redis_key: key,
      score,
      count,
      ttl,
      max_turns: maxTurns,
    },
  });

  persistEngramCard({
    memoryId: `chat:${input.user_id}`,
    scope: 'user',
    summary: summarizeText(input.turn.content),
    labels: {
      role: input.turn.role,
      source: 'engram.chat_memory_store',
    },
    relatedTools: ['engram.chat_memory_store'],
    sourceRefs: [
      {
        type: 'redis_key',
        value: key,
      },
    ],
    ttlSeconds: ttl,
  });

  return {
    ok: true,
    redis_key: key,
    score,
    member_size: member.length,
    max_turns: maxTurns,
    count,
    ttl,
    status: 'written',
  };
}
