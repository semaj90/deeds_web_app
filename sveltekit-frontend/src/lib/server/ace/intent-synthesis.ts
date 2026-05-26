import { createHash } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';

export type IntentSynthesisRecord = {
  queryHash: string;
  contextPackKey?: string | null;
  sourceRefs?: string[];
  chunkIds?: Array<string | number>;
  summaryIds?: Array<string | number>;
  authority?: Record<string, unknown>;
  retrievalTrace?: Record<string, unknown>;
  cachedSteps?: string[];
  rewardScore?: number;
  degraded?: boolean;
  degradedReason?: string | null;
};

export type IntentSynthesisCandidate = {
  id: string;
  queryHash: string;
  contextPackKey?: string | null;
  sourceRefs: string[];
  chunkIds: Array<string | number>;
  summaryIds: Array<string | number>;
  authority: Record<string, unknown>;
  retrievalTrace: Record<string, unknown>;
  cachedSteps: string[];
  rewardScore: number;
  degraded: boolean;
  degradedReason: string | null;
  createdAt?: string;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function buildIntentSynthesisQueryHash(query: string): string {
  return hashText(query.trim());
}

export function buildIntentSynthesisKey(query: string, contextPackKey?: string | null): string {
  const input = [query.trim(), contextPackKey?.trim() ?? ''].join('|');
  return `intent:${hashText(input).slice(0, 24)}`;
}

let intentSynthesisTableInit: Promise<void> | null = null;

async function ensureIntentSynthesisTable(): Promise<void> {
  if (!intentSynthesisTableInit) {
    intentSynthesisTableInit = (async () => {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS intent_synthesis (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          query_hash text NOT NULL,
          context_pack_key text,
          source_refs jsonb DEFAULT '[]'::jsonb,
          chunk_ids jsonb DEFAULT '[]'::jsonb,
          summary_ids jsonb DEFAULT '[]'::jsonb,
          authority jsonb DEFAULT '{}'::jsonb,
          retrieval_trace jsonb DEFAULT '{}'::jsonb,
          cached_steps jsonb DEFAULT '[]'::jsonb,
          reward_score numeric DEFAULT 0,
          degraded boolean DEFAULT false,
          degraded_reason text,
          created_at timestamptz DEFAULT now()
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS intent_synthesis_query_hash_idx ON intent_synthesis (query_hash);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS intent_synthesis_context_pack_key_idx ON intent_synthesis (context_pack_key);`);
    })().catch(err => {
      intentSynthesisTableInit = null;
      throw err;
    });
  }
  await intentSynthesisTableInit;
}

async function hasAutoencoderWeights(): Promise<boolean> {
  const redis = getRedis();
  try {
    const [weightsKeyCount, metaKeyCount] = await Promise.all([
      redis.hlen('ace:autoencoder:weights').catch(() => 0),
      redis.hlen('ace:autoencoder:meta').catch(() => 0),
    ]);
    return weightsKeyCount > 0 && metaKeyCount > 0;
  } catch {
    return false;
  }
}

export function scoreIntentSynthesisReward(input: {
  authority?: Record<string, unknown>;
  cachedSteps?: string[];
  degraded?: boolean;
}): number {
  const authority = input.authority ?? {};
  const cachedSteps = input.cachedSteps ?? [];
  const authorityScore =
    Number((authority as { combinedScore?: number }).combinedScore) ||
    Number((authority as { pagerank?: number }).pagerank) ||
    Number((authority as { graphAuthority?: number }).graphAuthority) ||
    0;
  const stepBonus = Math.min(cachedSteps.length, 8) * 0.05;
  const degradedPenalty = input.degraded ? -0.15 : 0;
  return Number((authorityScore * 0.6 + stepBonus + degradedPenalty).toFixed(6));
}

export async function writeIntentSynthesisRecord(record: IntentSynthesisRecord): Promise<IntentSynthesisCandidate> {
  await ensureIntentSynthesisTable();
  const degraded = record.degraded ?? !(await hasAutoencoderWeights());
  const degradedReason = degraded ? record.degradedReason ?? 'autoencoder_weights_pending' : (record.degradedReason ?? null);
  const rewardScore = record.rewardScore ?? scoreIntentSynthesisReward({
    authority: record.authority,
    cachedSteps: record.cachedSteps,
    degraded,
  });

  const candidate: IntentSynthesisCandidate = {
    id: buildIntentSynthesisKey(record.queryHash, record.contextPackKey),
    queryHash: record.queryHash,
    contextPackKey: record.contextPackKey ?? null,
    sourceRefs: record.sourceRefs ?? [],
    chunkIds: record.chunkIds ?? [],
    summaryIds: record.summaryIds ?? [],
    authority: record.authority ?? {},
    retrievalTrace: record.retrievalTrace ?? {},
    cachedSteps: record.cachedSteps ?? [],
    rewardScore,
    degraded,
    degradedReason,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO intent_synthesis
      (query_hash, context_pack_key, source_refs, chunk_ids, summary_ids, authority, retrieval_trace, cached_steps, reward_score, degraded, degraded_reason)
     VALUES
      ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)`,
    [
      candidate.queryHash,
      candidate.contextPackKey,
      stableJson(candidate.sourceRefs),
      stableJson(candidate.chunkIds),
      stableJson(candidate.summaryIds),
      stableJson(candidate.authority),
      stableJson(candidate.retrievalTrace),
      stableJson(candidate.cachedSteps),
      candidate.rewardScore,
      candidate.degraded,
      candidate.degradedReason,
    ],
  ).catch(() => null);

  return candidate;
}

export async function getIntentSynthesisCandidate(query: string, contextPackKey?: string | null): Promise<IntentSynthesisCandidate | null> {
  await ensureIntentSynthesisTable();
  const queryHash = buildIntentSynthesisQueryHash(query);
  const key = buildIntentSynthesisKey(query, contextPackKey);
  const { rows } = await pool.query<{
    id: string;
    query_hash: string;
    context_pack_key: string | null;
    source_refs: unknown;
    chunk_ids: unknown;
    summary_ids: unknown;
    authority: unknown;
    retrieval_trace: unknown;
    cached_steps: unknown;
    reward_score: string | number | null;
    degraded: boolean | null;
    degraded_reason: string | null;
    created_at: string | Date | null;
  }>(
    `SELECT id, query_hash, context_pack_key, source_refs, chunk_ids, summary_ids, authority,
            retrieval_trace, cached_steps, reward_score, degraded, degraded_reason, created_at
     FROM intent_synthesis
     WHERE query_hash = $1
       AND ($2::text IS NULL OR context_pack_key = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [queryHash, contextPackKey ?? null],
  ).catch(() => ({ rows: [] as any[] }));

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id ?? key,
    queryHash: row.query_hash,
    contextPackKey: row.context_pack_key,
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs as string[] : [],
    chunkIds: Array.isArray(row.chunk_ids) ? row.chunk_ids as Array<string | number> : [],
    summaryIds: Array.isArray(row.summary_ids) ? row.summary_ids as Array<string | number> : [],
    authority: (row.authority as Record<string, unknown>) ?? {},
    retrievalTrace: (row.retrieval_trace as Record<string, unknown>) ?? {},
    cachedSteps: Array.isArray(row.cached_steps) ? row.cached_steps as string[] : [],
    rewardScore: Number(row.reward_score ?? 0),
    degraded: Boolean(row.degraded),
    degradedReason: row.degraded_reason ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? undefined) as string | undefined,
  };
}
