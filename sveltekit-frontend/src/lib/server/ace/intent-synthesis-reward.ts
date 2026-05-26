import { createHash } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';
import { buildIntentSynthesisQueryHash } from './intent-synthesis.js';

export type IntentRewardRecord = {
  queryHash: string;
  contextPackKey?: string | null;
  selectedLane?: string | null;
  sourceRefs?: string[];
  chunkIds?: Array<string | number>;
  retrievedCards?: unknown[];
  authority?: Record<string, unknown>;
  retrievalTrace?: Record<string, unknown>;
  cachedSteps?: string[];
  rewardScore?: number;
  rewardReason?: string | null;
  feedback?: Record<string, unknown>;
  degraded?: boolean;
  degradedReason?: string | null;
  cacheHit?: boolean;
  latencyMs?: number | null;
};

export type IntentRewardRow = {
  id: string;
  queryHash: string;
  contextPackKey: string | null;
  selectedLane: string | null;
  sourceRefs: string[];
  chunkIds: Array<string | number>;
  retrievedCards: unknown[];
  authority: Record<string, unknown>;
  retrievalTrace: Record<string, unknown>;
  cachedSteps: string[];
  rewardScore: number;
  rewardReason: string | null;
  feedback: Record<string, unknown>;
  degraded: boolean;
  degradedReason: string | null;
  createdAt: string;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pickAuthorityScore(authority?: Record<string, unknown> | null): number {
  if (!authority) return 0;
  const raw =
    Number((authority as { combinedScore?: number }).combinedScore) ||
    Number((authority as { score?: number }).score) ||
    Number((authority as { pagerank?: number }).pagerank) ||
    Number((authority as { graphAuthority?: number }).graphAuthority) ||
    0;
  return clamp01(raw);
}

function buildRewardReason(parts: {
  sourceRefsPresent: boolean;
  cacheHit: boolean;
  lowLatency: boolean;
  authorityScore: number;
  degraded: boolean;
}): string {
  const reasons = [
    parts.sourceRefsPresent ? 'sourceRefs' : 'noSourceRefs',
    parts.cacheHit ? 'cacheHit' : 'cacheMiss',
    parts.lowLatency ? 'lowLatency' : 'slowPath',
    parts.authorityScore >= 0.5 ? 'authority' : 'lowAuthority',
    parts.degraded ? 'degraded' : 'healthy',
  ];
  return reasons.join(',');
}

function computeLowLatency(latencyMs?: number | null): boolean {
  if (latencyMs == null || !Number.isFinite(latencyMs)) return false;
  return latencyMs <= 1200;
}

let rewardTableInit: Promise<void> | null = null;

async function ensureRewardTable(): Promise<void> {
  if (!rewardTableInit) {
    rewardTableInit = (async () => {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS intent_synthesis_rewards (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          query_hash text NOT NULL,
          context_pack_key text,
          selected_lane text,
          source_refs jsonb DEFAULT '[]'::jsonb,
          chunk_ids jsonb DEFAULT '[]'::jsonb,
          retrieved_cards jsonb DEFAULT '[]'::jsonb,
          authority jsonb DEFAULT '{}'::jsonb,
          retrieval_trace jsonb DEFAULT '{}'::jsonb,
          cached_steps jsonb DEFAULT '[]'::jsonb,
          reward_score numeric DEFAULT 0,
          reward_reason text,
          feedback jsonb DEFAULT '{}'::jsonb,
          degraded boolean DEFAULT false,
          degraded_reason text,
          created_at timestamptz DEFAULT now()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS intent_synthesis_rewards_query_hash_idx ON intent_synthesis_rewards (query_hash);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS intent_synthesis_rewards_context_pack_key_idx ON intent_synthesis_rewards (context_pack_key);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS intent_synthesis_rewards_created_at_idx ON intent_synthesis_rewards (created_at DESC);`);
    })().catch(err => {
      rewardTableInit = null;
      throw err;
    });
  }
  await rewardTableInit;
}

export function computeRewardScore(input: {
  sourceRefs?: string[];
  cacheHit?: boolean;
  latencyMs?: number | null;
  authority?: Record<string, unknown>;
  degraded?: boolean;
}): number {
  const sourceRefsPresent = Boolean(input.sourceRefs?.length);
  const cacheHit = Boolean(input.cacheHit);
  const lowLatency = computeLowLatency(input.latencyMs ?? null);
  const authorityScore = pickAuthorityScore(input.authority);
  const noDegraded = !Boolean(input.degraded);

  const score =
    (sourceRefsPresent ? 0.3 : 0) +
    (cacheHit ? 0.2 : 0) +
    (lowLatency ? 0.2 : 0) +
    (authorityScore * 0.2) +
    (noDegraded ? 0.1 : 0);

  return Number(clamp01(score).toFixed(6));
}

export async function cacheIntentReward(row: IntentRewardRow): Promise<void> {
  const redis = getRedis();
  const queryHash = row.queryHash;
  const latestKey = `ace:reward:latest:${queryHash}`;
  const latestPayload = {
    queryHash,
    contextPackKey: row.contextPackKey,
    selectedLane: row.selectedLane,
    sourceRefs: row.sourceRefs,
    chunkIds: row.chunkIds,
    rewardScore: row.rewardScore,
    rewardReason: row.rewardReason,
    degraded: row.degraded,
    degradedReason: row.degradedReason,
    createdAt: row.createdAt,
    cacheKey: `ace:reward:${hashText([queryHash, row.contextPackKey ?? '', row.selectedLane ?? ''].join('|')).slice(0, 24)}`,
  };

  const sourceRefs = row.sourceRefs ?? [];
  const chunkIds = row.chunkIds ?? [];

  try {
    await redis
      .multi()
      .set(latestKey, JSON.stringify(latestPayload), 'EX', 86400)
      .exec();
  } catch {}

  const sourceOps = sourceRefs.slice(0, 10).map((sourceRef) =>
    redis
      .multi()
      .hset(`ace:reward:sourceRef:${hashText(sourceRef).slice(0, 24)}`, {
        queryHash,
        contextPackKey: row.contextPackKey ?? '',
        selectedLane: row.selectedLane ?? '',
        rewardScore: String(row.rewardScore),
        rewardReason: row.rewardReason ?? '',
        updatedAt: row.createdAt,
      })
      .hincrby(`ace:reward:sourceRef:${hashText(sourceRef).slice(0, 24)}`, 'count', 1)
      .expire(`ace:reward:sourceRef:${hashText(sourceRef).slice(0, 24)}`, 86400)
      .exec()
      .catch(() => null)
  );

  const chunkOps = chunkIds.slice(0, 20).map((chunkId) =>
    redis
      .multi()
      .hset(`ace:reward:chunk:${hashText(String(chunkId)).slice(0, 24)}`, {
        queryHash,
        contextPackKey: row.contextPackKey ?? '',
        selectedLane: row.selectedLane ?? '',
        rewardScore: String(row.rewardScore),
        rewardReason: row.rewardReason ?? '',
        updatedAt: row.createdAt,
      })
      .hincrby(`ace:reward:chunk:${hashText(String(chunkId)).slice(0, 24)}`, 'count', 1)
      .expire(`ace:reward:chunk:${hashText(String(chunkId)).slice(0, 24)}`, 86400)
      .exec()
      .catch(() => null)
  );

  await Promise.all([...sourceOps, ...chunkOps]).catch(() => {});
}

export async function writeIntentReward(record: IntentRewardRecord): Promise<IntentRewardRow> {
  await ensureRewardTable();

  const queryHash = record.queryHash || buildIntentSynthesisQueryHash(record.contextPackKey ?? '');
  const redis = getRedis();
  const karpathyEncodedCount = await redis.hlen('gpu:karpathy:encoded').catch(() => 0);
  const karpathyEncodedPending = karpathyEncodedCount === 0;
  const authorityScore = pickAuthorityScore(record.authority ?? null);
  const rewardScore =
    record.rewardScore ??
    computeRewardScore({
      sourceRefs: record.sourceRefs,
      cacheHit: record.cacheHit,
      latencyMs: record.latencyMs ?? null,
      authority: record.authority,
      degraded: record.degraded,
    });
  const lowLatency = computeLowLatency(record.latencyMs ?? null);
  const degraded = Boolean(record.degraded ?? karpathyEncodedPending);
  const degradedReason =
    record.degradedReason ??
    (karpathyEncodedPending ? 'karpathy_encoded_pending' : degraded ? 'autoencoder_weights_pending' : null);
  const rewardReason =
    record.rewardReason ??
    buildRewardReason({
      sourceRefsPresent: Boolean(record.sourceRefs?.length),
      cacheHit: Boolean(record.cacheHit),
      lowLatency,
      authorityScore,
      degraded,
    });
  const row: IntentRewardRow = {
    id: `reward:${hashText([queryHash, record.contextPackKey ?? '', record.selectedLane ?? '', String(Date.now())].join('|')).slice(0, 24)}`,
    queryHash,
    contextPackKey: record.contextPackKey ?? null,
    selectedLane: record.selectedLane ?? null,
    sourceRefs: record.sourceRefs ?? [],
    chunkIds: record.chunkIds ?? [],
    retrievedCards: record.retrievedCards ?? [],
    authority: record.authority ?? {},
    retrievalTrace: record.retrievalTrace ?? {},
    cachedSteps: record.cachedSteps ?? [],
    rewardScore,
    rewardReason,
    feedback: record.feedback ?? {
      sourceRefsPresent: Boolean(record.sourceRefs?.length),
      cacheHit: Boolean(record.cacheHit),
      latencyMs: record.latencyMs ?? null,
      authorityScore,
      lowLatency,
      karpathyEncodedCount,
    },
    degraded,
    degradedReason,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO intent_synthesis_rewards
      (query_hash, context_pack_key, selected_lane, source_refs, chunk_ids, retrieved_cards, authority,
       retrieval_trace, cached_steps, reward_score, reward_reason, feedback, degraded, degraded_reason)
     VALUES
      ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14)`,
    [
      row.queryHash,
      row.contextPackKey,
      row.selectedLane,
      stableJson(row.sourceRefs),
      stableJson(row.chunkIds),
      stableJson(row.retrievedCards),
      stableJson(row.authority),
      stableJson(row.retrievalTrace),
      stableJson(row.cachedSteps),
      row.rewardScore,
      row.rewardReason,
      stableJson(row.feedback),
      row.degraded,
      row.degradedReason,
    ],
  ).catch(() => null);

  await cacheIntentReward(row).catch(() => {});
  return row;
}

export async function getRecentIntentRewards(limit = 20, queryHash?: string | null): Promise<IntentRewardRow[]> {
  await ensureRewardTable();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const { rows } = await pool.query<{
    id: string;
    query_hash: string;
    context_pack_key: string | null;
    selected_lane: string | null;
    source_refs: unknown;
    chunk_ids: unknown;
    retrieved_cards: unknown;
    authority: unknown;
    retrieval_trace: unknown;
    cached_steps: unknown;
    reward_score: string | number | null;
    reward_reason: string | null;
    feedback: unknown;
    degraded: boolean | null;
    degraded_reason: string | null;
    created_at: string | Date | null;
  }>(
    `SELECT id, query_hash, context_pack_key, selected_lane, source_refs, chunk_ids, retrieved_cards,
            authority, retrieval_trace, cached_steps, reward_score, reward_reason, feedback, degraded,
            degraded_reason, created_at
     FROM intent_synthesis_rewards
     ${queryHash ? 'WHERE query_hash = $1' : ''}
     ORDER BY created_at DESC
     LIMIT ${queryHash ? '$2' : '$1'}`,
    queryHash ? [queryHash, safeLimit] : [safeLimit],
  ).catch(() => ({ rows: [] as any[] }));

  return rows.map((row) => ({
    id: row.id,
    queryHash: row.query_hash,
    contextPackKey: row.context_pack_key,
    selectedLane: row.selected_lane,
    sourceRefs: Array.isArray(row.source_refs) ? (row.source_refs as string[]) : [],
    chunkIds: Array.isArray(row.chunk_ids) ? (row.chunk_ids as Array<string | number>) : [],
    retrievedCards: Array.isArray(row.retrieved_cards) ? row.retrieved_cards as unknown[] : [],
    authority: (row.authority as Record<string, unknown>) ?? {},
    retrievalTrace: (row.retrieval_trace as Record<string, unknown>) ?? {},
    cachedSteps: Array.isArray(row.cached_steps) ? row.cached_steps as string[] : [],
    rewardScore: Number(row.reward_score ?? 0),
    rewardReason: row.reward_reason ?? null,
    feedback: (row.feedback as Record<string, unknown>) ?? {},
    degraded: Boolean(row.degraded),
    degradedReason: row.degraded_reason ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? new Date().toISOString()) as string,
  }));
}
