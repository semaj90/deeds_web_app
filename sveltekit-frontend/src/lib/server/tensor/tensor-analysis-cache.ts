/**
 * tensor-analysis-cache.ts
 *
 * Read/write interface for the tensor_analysis_cache Postgres table.
 * Three-tier lookup:
 *   1. Redis  key `tensor:analysis:{stableKey}:{contentHash}` (1h TTL)
 *   2. Postgres tensor_analysis_cache
 *   3. CUDA reanalysis (caller's responsibility — call writeTensorAnalysis after)
 *
 * Redis stores the full row as JSON so the common path avoids SQL entirely.
 */

import db from '$lib/server/db/client.js';
import { tensorAnalysisCache } from '$lib/server/db/schema/topology.js';
import { eq, sql, or, and } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { topoByteFromPath, unpackTopoByte, classifyPath, TOPO_CLASS_LABEL } from './topology-byte-mapper.js';
import { deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import type { NewTensorAnalysisCache, TensorAnalysisCache } from '$lib/server/db/schema/topology.js';

export interface TensorAnalysisRecord {
  stableKey:           string;
  contentHash:         string;
  topoByte:            number;
  topoHex:             string;
  topoClass:           string;
  manifold4:           [number, number, number, number];
  centroidKey:         string | null;
  somCluster:          number | null;
  graphAuthorityScore: number;
  tensorAffinityScore: number;
  tensorJson:          Record<string, unknown>;
  qdrantPayload:       Record<string, unknown>;
  outputMeta:          Record<string, unknown>;
}

const REDIS_TTL = 3600; // 1 hour
const redisKey = (sk: string, hash: string) => `tensor:analysis:${sk}:${hash}`;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Look up a cached tensor analysis record.
 * Returns null if not found (caller should recompute + write).
 */
export async function getTensorAnalysis(
  stableKey: string,
  contentHash: string,
): Promise<TensorAnalysisRecord | null> {
  // L1: Redis
  try {
    const redis = getRedis();
    const raw = await redis.get(redisKey(stableKey, contentHash));
    if (raw) return JSON.parse(raw) as TensorAnalysisRecord;
  } catch { /* Redis unavailable — fall through */ }

  // L2: Postgres
  try {
    const qdrantId = deterministicPointId(stableKey);
    const legacyKey = `qdrant:${qdrantId}`;

    const [row] = await db
      .select()
      .from(tensorAnalysisCache)
      .where(
        or(
          eq(tensorAnalysisCache.stableKey, stableKey),
          eq(tensorAnalysisCache.stableKey, legacyKey)
        )
      )
      .limit(1);

    if (!row || row.contentHash !== contentHash) return null;

    const record = rowToRecord(row);

    // Backfill Redis
    try {
      const redis = getRedis();
      await redis.setex(redisKey(stableKey, contentHash), REDIS_TTL, JSON.stringify(record));
    } catch { /* non-fatal */ }

    return record;
  } catch {
    return null;
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert a tensor analysis record.
 * Called after RTX CUDA analysis produces a result, or after topo byte
 * classification alone (manifold4 will be zeros until full GPU run).
 */
export async function writeTensorAnalysis(record: TensorAnalysisRecord): Promise<void> {
  const row: NewTensorAnalysisCache = {
    stableKey:           record.stableKey,
    contentHash:         record.contentHash,
    topoByte:            record.topoByte,
    topoHex:             record.topoHex,
    topoClass:           record.topoClass,
    manifold4X:          record.manifold4[0],
    manifold4Y:          record.manifold4[1],
    manifold4Z:          record.manifold4[2],
    manifold4W:          record.manifold4[3],
    centroidKey:         record.centroidKey,
    somCluster:          record.somCluster,
    graphAuthorityScore: record.graphAuthorityScore,
    tensorAffinityScore: record.tensorAffinityScore,
    tensorJson:          record.tensorJson,
    qdrantPayload:       record.qdrantPayload,
    outputMeta:          record.outputMeta,
  };

  await db
    .insert(tensorAnalysisCache)
    .values(row)
    .onConflictDoUpdate({
      target: tensorAnalysisCache.stableKey,
      set: {
        contentHash:         sql`excluded.content_hash`,
        topoByte:            sql`excluded.topo_byte`,
        topoHex:             sql`excluded.topo_hex`,
        topoClass:           sql`excluded.topo_class`,
        manifold4X:          sql`excluded.manifold4_x`,
        manifold4Y:          sql`excluded.manifold4_y`,
        manifold4Z:          sql`excluded.manifold4_z`,
        manifold4W:          sql`excluded.manifold4_w`,
        centroidKey:         sql`excluded.centroid_key`,
        somCluster:          sql`excluded.som_cluster`,
        graphAuthorityScore: sql`excluded.graph_authority_score`,
        tensorAffinityScore: sql`excluded.tensor_affinity_score`,
        tensorJson:          sql`excluded.tensor_json`,
        qdrantPayload:       sql`excluded.qdrant_payload`,
        outputMeta:          sql`excluded.output_meta`,
        updatedAt:           sql`now()`,
      },
    });

  // Write to Redis
  try {
    const redis = getRedis();
    await redis.setex(redisKey(record.stableKey, record.contentHash), REDIS_TTL, JSON.stringify(record));
  } catch { /* non-fatal */ }

  // Enqueue for GPU projection if manifold4 is missing/zero (fire-and-forget)
  enqueueGpuProjectionIfNeeded([record]).catch(() => {});
}

// ── Batch write ───────────────────────────────────────────────────────────────

/**
 * Batch upsert up to 500 records at a time.
 */
export async function writeTensorAnalysisBatch(records: TensorAnalysisRecord[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const rows: NewTensorAnalysisCache[] = slice.map(r => ({
      stableKey:           r.stableKey,
      contentHash:         r.contentHash,
      topoByte:            r.topoByte,
      topoHex:             r.topoHex,
      topoClass:           r.topoClass,
      manifold4X:          r.manifold4[0],
      manifold4Y:          r.manifold4[1],
      manifold4Z:          r.manifold4[2],
      manifold4W:          r.manifold4[3],
      centroidKey:         r.centroidKey,
      somCluster:          r.somCluster,
      graphAuthorityScore: r.graphAuthorityScore,
      tensorAffinityScore: r.tensorAffinityScore,
      tensorJson:          r.tensorJson,
      qdrantPayload:       r.qdrantPayload,
      outputMeta:          r.outputMeta,
    }));

    await db
      .insert(tensorAnalysisCache)
      .values(rows)
      .onConflictDoUpdate({
        target: tensorAnalysisCache.stableKey,
        set: {
          contentHash:         sql`excluded.content_hash`,
          topoByte:            sql`excluded.topo_byte`,
          topoHex:             sql`excluded.topo_hex`,
          topoClass:           sql`excluded.topo_class`,
          manifold4X:          sql`excluded.manifold4_x`,
          manifold4Y:          sql`excluded.manifold4_y`,
          manifold4Z:          sql`excluded.manifold4_z`,
          manifold4W:          sql`excluded.manifold4_w`,
          centroidKey:         sql`excluded.centroid_key`,
          somCluster:          sql`excluded.som_cluster`,
          graphAuthorityScore: sql`excluded.graph_authority_score`,
          tensorAffinityScore: sql`excluded.tensor_affinity_score`,
          tensorJson:          sql`excluded.tensor_json`,
          qdrantPayload:       sql`excluded.qdrant_payload`,
          outputMeta:          sql`excluded.output_meta`,
          updatedAt:           sql`now()`,
        },
      });
  }

  // Batch Redis write
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const r of records) {
      pipeline.setex(redisKey(r.stableKey, r.contentHash), REDIS_TTL, JSON.stringify(r));
    }
    await pipeline.exec();
  } catch { /* non-fatal */ }

  // Enqueue any topo-only rows (manifold4=[0,0,0,0]) for GPU projection (fire-and-forget)
  enqueueGpuProjectionIfNeeded(records).catch(() => {});
}

// ── GPU projection enqueue ────────────────────────────────────────────────────

const GPU_PENDING_SET = 'topo:gpu:pending';

/**
 * Detect records with missing or zero manifold4 and enqueue them for GPU projection.
 *
 * Primary mechanism: Redis SADD to `topo:gpu:pending` (drained by `npm run tensor:topology`).
 * Secondary mechanism: mark `tensor_json.needsProjection = true` in Postgres so cold starts
 * can detect the backlog without Redis.
 *
 * Non-fatal: never throws, never delays the calling write path.
 */
export async function enqueueGpuProjectionIfNeeded(records: TensorAnalysisRecord[]): Promise<void> {
  const pending = records.filter((r) =>
    !r.manifold4 ||
    r.manifold4.length !== 4 ||
    r.manifold4.every((v) => v === 0)
  );
  if (!pending.length) return;

  const stableKeys = pending.map((r) => r.stableKey);

  // Redis SADD — quick, fire-and-forget
  try {
    const redis = getRedis();
    await redis.sadd(GPU_PENDING_SET, ...stableKeys);
  } catch {
    console.warn(`[tensor-analysis-cache] Redis SADD ${GPU_PENDING_SET} failed; falling back to Postgres flag`);
  }

  // Postgres fallback — mark needsProjection in tensor_json
  try {
    for (const key of stableKeys) {
      await db
        .update(tensorAnalysisCache)
        .set({ tensorJson: sql`tensor_json || '{"needsProjection":true}'::jsonb`, updatedAt: sql`now()` })
        .where(eq(tensorAnalysisCache.stableKey, key));
    }
  } catch { /* non-fatal */ }
}

// ── Quick topo-byte classification (no GPU, no Qdrant) ───────────────────────

/**
 * Classify a file path and write a minimal topo-byte-only cache row.
 * Called during the Map stage before GPU analysis to ensure every indexed
 * file has at least a topo_byte so ACE routing works immediately.
 */
export function buildTopoOnlyRecord(stableKey: string, filePath: string, contentHash: string): TensorAnalysisRecord {
  const byte = topoByteFromPath(filePath);
  const { topoClass, hex } = unpackTopoByte(byte);
  return {
    stableKey,
    contentHash,
    topoByte:            byte,
    topoHex:             hex,
    topoClass:           TOPO_CLASS_LABEL[topoClass],
    manifold4:           [0, 0, 0, 0],
    centroidKey:         null,
    somCluster:          null,
    graphAuthorityScore: 0,
    tensorAffinityScore: 0,
    tensorJson:          {},
    qdrantPayload:       { topo_byte: byte, topo_hex: hex, topo_class: TOPO_CLASS_LABEL[topoClass] },
    outputMeta:          { source: 'topo-only', filePath },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToRecord(row: TensorAnalysisCache): TensorAnalysisRecord {
  return {
    stableKey:           row.stableKey,
    contentHash:         row.contentHash,
    topoByte:            row.topoByte ?? 0,
    topoHex:             row.topoHex ?? '0x00',
    topoClass:           row.topoClass ?? 'unclassified',
    manifold4:           [row.manifold4X ?? 0, row.manifold4Y ?? 0, row.manifold4Z ?? 0, row.manifold4W ?? 0],
    centroidKey:         row.centroidKey ?? null,
    somCluster:          row.somCluster ?? null,
    graphAuthorityScore: row.graphAuthorityScore ?? 0,
    tensorAffinityScore: row.tensorAffinityScore ?? 0,
    tensorJson:          (row.tensorJson ?? {}) as Record<string, unknown>,
    qdrantPayload:       (row.qdrantPayload ?? {}) as Record<string, unknown>,
    outputMeta:          (row.outputMeta ?? {}) as Record<string, unknown>,
  };
}
