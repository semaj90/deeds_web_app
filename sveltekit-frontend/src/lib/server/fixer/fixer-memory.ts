/**
 * fixer-memory.ts
 *
 * GPU-indexed behavior store for the agentic error-fix loop.
 * Three layers (Redis → Postgres pgvector → Qdrant):
 *
 *   Redis  ace:fixer:patterns hash  — O(1) exact-hash recall (TTL 7 days)
 *   Postgres fixer_patterns          — durable, HNSW + GIN indexes, pgvector column
 *   Qdrant   fixer_memory_768        — GPU semantic search (768-dim, cosine)
 *
 * Usage in agentic-batch-fix loop:
 *   const hit = await recallFixerPattern(redis, pool, errorHash);
 *   if (hit) { apply(hit.fixTemplate); }
 *   else     { const fix = await llm(); await storeFixerPattern(...); }
 */

import { createHash }        from 'node:crypto';
import type { Pool }         from 'pg';
import type { Redis }        from 'ioredis';
import { getQdrantClient }   from '$lib/server/vector/qdrant-singleton.js';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { ENV }               from '$lib/server/env.server.js';
import { EMBEDDING_CONTRACT } from '$lib/server/embedding/embedding-contract.js';

// ── constants ─────────────────────────────────────────────────────────────────

const REDIS_KEY       = 'ace:fixer:patterns';       // hash: errorHash → JSON
const REDIS_TTL       = 60 * 60 * 24 * 7;           // 7 days
const QDRANT_COLL     = 'fixer_memory_768';
const FIXER_MEMORY_EMBED_DIM = EMBEDDING_CONTRACT.native_dimension;
const TRUST_PROMOTE   = 0.75;                        // auto-promote to T1 above this

// ── types ─────────────────────────────────────────────────────────────────────

export interface FixerPatternHit {
  id:           string;
  errorHash:    string;
  errorCode:    string | null;
  fixTemplate:  string;
  fixKind:      'instruction' | 'diff' | 'regex';
  successCount: number;
  failureCount: number;
  trustScore:   number;
  tags:         string[];
  source:       'redis' | 'postgres' | 'qdrant';
}

export interface StorePatternOpts {
  errorHash:   string;
  errorCode?:  string;
  fixTemplate: string;
  fixKind:     'instruction' | 'diff' | 'regex';
  tags?:       string[];
  topFiles?:   string[];
  embedding?:  number[];           // 768-dim from /api/embed; if omitted, skips Qdrant upsert
  outcome:     'success' | 'failure';
  runId:       string;
  file:        string;
  linesChanged?: number;
  durationMs?:   number;
  langfuseTraceId?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makePointId(errorHash: string): string {
  // Deterministic UUID v4-ish from hash so we can upsert idempotently
  const hex = createHash('sha256').update('fixer:' + errorHash).digest('hex');
  return [hex.slice(0,8), hex.slice(8,12), '4'+hex.slice(13,16),
          (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16)+hex.slice(17,20),
          hex.slice(20,32)].join('-');
}

function qdrantClient(): ReturnType<typeof getQdrantClient> {
  return getQdrantClient();
}

// ── ensure collection exists ──────────────────────────────────────────────────

export async function ensureFixerMemoryCollection(): Promise<void> {
  const q = qdrantClient();
  try {
    await q.getCollection(QDRANT_COLL);
  } catch {
    await q.createCollection(QDRANT_COLL, {
    vectors: { size: FIXER_MEMORY_EMBED_DIM, distance: 'Cosine' },
      hnsw_config: { m: 16, ef_construct: 64 },
      quantization_config: { scalar: { type: 'int8', always_ram: true } },
    });
  }
}

// ── recall ────────────────────────────────────────────────────────────────────

/** L1: exact Redis lookup */
export async function recallFixerPatternRedis(
  redis: Redis,
  errorHash: string,
): Promise<FixerPatternHit | null> {
  try {
    const raw = await redis.hget(REDIS_KEY, errorHash);
    if (!raw) return null;
    return { ...JSON.parse(raw), source: 'redis' as const };
  } catch { return null; }
}

/** L2: Postgres exact-hash lookup */
export async function recallFixerPatternPg(
  pool: Pool,
  errorHash: string,
): Promise<FixerPatternHit | null> {
  const { rows } = await pool.query<FixerPatternHit & { success_count: number; failure_count: number; trust_score: number; fix_kind: string; fix_template: string; error_code: string | null; tags: string[] }>(
    `SELECT id, error_hash, error_code, fix_template, fix_kind,
            success_count, failure_count, trust_score, tags
     FROM fixer_patterns
     WHERE error_hash = $1
     ORDER BY trust_score DESC LIMIT 1`,
    [errorHash],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id as unknown as string,
    errorHash:    (r as any).errorHash ?? (r as any).error_hash as unknown as string,
    errorCode:    r.error_code,
    fixTemplate:  r.fix_template,
    fixKind:      r.fix_kind as 'instruction' | 'diff' | 'regex',
    successCount: r.success_count,
    failureCount: r.failure_count,
    trustScore:   r.trust_score,
    tags:         r.tags,
    source:       'postgres',
  };
}

/** L3: Qdrant semantic search — finds similar patterns even for novel error hashes */
export async function recallFixerPatternSemantic(
  pool: Pool,
  queryEmbedding: number[],
  limit = 5,
): Promise<FixerPatternHit[]> {
  const q = qdrantClient();
  try {
    const results = await q.search(QDRANT_COLL, {
      vector: queryEmbedding,
      limit,
      score_threshold: 0.70,
      with_payload: true,
    });
    return results.map(r => ({
      id:           String(r.id),
      errorHash:    r.payload?.error_hash as string,
      errorCode:    r.payload?.error_code as string | null ?? null,
      fixTemplate:  r.payload?.fix_template as string,
      fixKind:      (r.payload?.fix_kind as 'instruction' | 'diff' | 'regex') ?? 'instruction',
      successCount: r.payload?.success_count as number ?? 0,
      failureCount: r.payload?.failure_count as number ?? 0,
      trustScore:   r.payload?.trust_score as number ?? 0.5,
      tags:         (r.payload?.tags as string[]) ?? [],
      source:       'qdrant' as const,
    }));
  } catch { return []; }
}

/** Full 3-layer recall: Redis → Postgres → Qdrant semantic */
export async function recallFixerPattern(
  redis: Redis,
  pool: Pool,
  errorHash: string,
  queryEmbedding?: number[],
): Promise<{ exact: FixerPatternHit | null; similar: FixerPatternHit[] }> {
  // L1
  const redisHit = await recallFixerPatternRedis(redis, errorHash);
  if (redisHit) return { exact: redisHit, similar: [] };

  // L2
  const pgHit = await recallFixerPatternPg(pool, errorHash);

  // L3 semantic — only when embedding provided
  const similar = queryEmbedding?.length === FIXER_MEMORY_EMBED_DIM
    ? await recallFixerPatternSemantic(pool, queryEmbedding, 5)
    : [];

  return { exact: pgHit, similar };
}

// ── store ─────────────────────────────────────────────────────────────────────

/** Write/update a fixer pattern across all three layers + log the run. */
export async function storeFixerPattern(
  redis: Redis,
  pool: Pool,
  opts: StorePatternOpts,
): Promise<string> {
  const isSuccess = opts.outcome === 'success';
  const pointId   = makePointId(opts.errorHash);

  // ── Postgres upsert ──────────────────────────────────────────────────────
  const { rows } = await pool.query<{ id: string; success_count: number; failure_count: number }>(
    `INSERT INTO fixer_patterns
       (error_hash, error_code, fix_template, fix_kind, success_count, failure_count,
        trust_score, top_files, tags, qdrant_point_id, embedding, last_verified_at, updated_at)
     VALUES ($1, $2, $3, $4,
             $5::int, $6::int,
             $5::real / NULLIF($5::real + $6::real, 0),
             $7, $8, $9,
             $10::vector,
             CASE WHEN $11 THEN now() ELSE NULL END,
             now())
     ON CONFLICT (error_hash) DO UPDATE SET
       fix_template    = EXCLUDED.fix_template,
       fix_kind        = EXCLUDED.fix_kind,
       success_count   = fixer_patterns.success_count + $5::int,
       failure_count   = fixer_patterns.failure_count + $6::int,
       trust_score     = (fixer_patterns.success_count + $5::int)::real /
                         NULLIF((fixer_patterns.success_count + $5::int +
                                 fixer_patterns.failure_count + $6::int)::real, 0),
       top_files       = EXCLUDED.top_files,
       tags            = EXCLUDED.tags,
       qdrant_point_id = EXCLUDED.qdrant_point_id,
       embedding       = COALESCE(EXCLUDED.embedding, fixer_patterns.embedding),
       last_verified_at= CASE WHEN $11 THEN now() ELSE fixer_patterns.last_verified_at END,
       updated_at      = now()
     RETURNING id, success_count, failure_count`,
    [
      opts.errorHash,
      opts.errorCode ?? null,
      opts.fixTemplate,
      opts.fixKind,
      isSuccess ? 1 : 0,
      isSuccess ? 0 : 1,
      opts.topFiles ?? [],
      opts.tags ?? [],
      pointId,
      opts.embedding ? `[${opts.embedding.join(',')}]` : null,
      isSuccess,
    ],
  );

  const row         = rows[0];
  const patternId   = row.id;
  const trustScore  = row.success_count / Math.max(row.success_count + row.failure_count, 1);

  // ── Redis cache ───────────────────────────────────────────────────────────
  if (isSuccess) {
    const cached: Omit<FixerPatternHit, 'source'> = {
      id:           patternId,
      errorHash:    opts.errorHash,
      errorCode:    opts.errorCode ?? null,
      fixTemplate:  opts.fixTemplate,
      fixKind:      opts.fixKind,
      successCount: row.success_count,
      failureCount: row.failure_count,
      trustScore,
      tags:         opts.tags ?? [],
    };
    await redis.hset(REDIS_KEY, opts.errorHash, JSON.stringify(cached));
    await redis.expire(REDIS_KEY, REDIS_TTL);
  }

  // ── Qdrant upsert (only when embedding provided) ──────────────────────────
  if (opts.embedding?.length === FIXER_MEMORY_EMBED_DIM) {
    const q = qdrantClient();
    await q.upsert(QDRANT_COLL, {
      wait: false,
      points: [{
        id:      pointId,
        vector:  opts.embedding,
        payload: {
          error_hash:    opts.errorHash,
          error_code:    opts.errorCode ?? null,
          fix_template:  opts.fixTemplate,
          fix_kind:      opts.fixKind,
          success_count: row.success_count,
          failure_count: row.failure_count,
          trust_score:   trustScore,
          trust_tier:    trustScore >= TRUST_PROMOTE ? 'T1' : 'T2',
          tags:          opts.tags ?? [],
          top_files:     opts.topFiles ?? [],
        },
      }],
    }).catch(() => {/* non-fatal */});
  }

  // ── fixer_run_log ─────────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO fixer_run_log
       (run_id, error_hash, pattern_id, file, error_code, attempt, outcome,
        lines_changed, duration_ms, langfuse_trace_id)
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8,$9)`,
    [
      opts.runId,
      opts.errorHash,
      patternId,
      opts.file,
      opts.errorCode ?? null,
      opts.outcome,
      opts.linesChanged ?? null,
      opts.durationMs ?? null,
      opts.langfuseTraceId ?? null,
    ],
  ).catch(() => {/* non-fatal audit */});

  return patternId;
}

// ── GPU graph indexing integration ────────────────────────────────────────────
// Exposes fixer_patterns as a Karpathy authority source.
// Called by karpathy-gpu-enrich.mjs to pull confirmed fixes into the blend.

export async function getFixerPatternAuthority(
  pool: Pool,
  filePaths: string[],
): Promise<Map<string, number>> {
  if (!filePaths.length) return new Map();
  const { rows } = await pool.query<{ file: string; avg_trust: number }>(
    `SELECT f, avg(fp.trust_score) AS avg_trust
     FROM unnest($1::text[]) AS f
     JOIN fixer_run_log frl ON frl.file = f AND frl.outcome = 'cache_hit'
     JOIN fixer_patterns fp  ON fp.id   = frl.pattern_id
     WHERE frl.created_at > now() - interval '7 days'
     GROUP BY f`,
    [filePaths],
  );
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.file, r.avg_trust);
  return out;
}
