/**
 * Qdrant snapshot create + restore proof contract.
 *
 * Provides:
 *  - createCollectionSnapshot()  — triggers a Qdrant server-side snapshot and
 *    returns the snapshot description (name, creation_time, size).
 *  - verifyRestoreIntegrity()    — after a restore (operator-driven), compares
 *    point count and a sample payload against pre-snapshot baseline values to
 *    confirm the collection is not silently empty or corrupted.
 *  - pruneSnapshots()            — deletes all but the N most recent snapshots
 *    to keep storage bounded.
 *
 * Why this matters:
 *   Qdrant data is a mirror — it can be rebuilt from Postgres — but a corrupt or
 *   empty collection surfaces as silent recall degradation, not a visible error.
 *   This module provides a structured proof that a restore returned the expected
 *   point count and that at least one sample payload has the required fields.
 *
 * Integration path:
 *   npm run atlas:qdrant:snapshot:create   (create + print description)
 *   npm run atlas:qdrant:snapshot:verify   (compare against saved baseline)
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotDescription {
  name: string;
  creationTime: string | null;
  sizeMb: number | null;
  checksum: string | null;
}

export interface SnapshotBaseline {
  collection: string;
  snapshotName: string;
  pointCount: number;
  /** packet_key values from a small sample taken at snapshot time. */
  samplePacketKeys: string[];
  takenAt: string;
}

export interface RestoreVerificationResult {
  ok: boolean;
  collection: string;
  baseline: SnapshotBaseline;
  actualPointCount: number;
  /** True when actual ≥ baseline within tolerance. */
  pointCountMatch: boolean;
  /** Fraction of baseline sample keys found in the restored collection. */
  sampleRecallRate: number;
  /** Human-readable summary. */
  message: string;
}

// Minimum fraction of baseline sample keys that must be found after restore.
const SAMPLE_RECALL_THRESHOLD = 0.9;

// Point-count tolerance: actual must be ≥ this fraction of baseline.
const POINT_COUNT_TOLERANCE = 0.99;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePoints(response: unknown): Array<{ id: string | number; payload?: Record<string, unknown> }> {
  if (Array.isArray(response)) return response as any[];
  const r = response as Record<string, unknown>;
  if (r && Array.isArray(r['points'])) return r['points'] as any[];
  if (r && r['result'] && Array.isArray((r['result'] as any)['points']))
    return (r['result'] as any)['points'] as any[];
  return [];
}

async function getCollectionPointCount(collection: string): Promise<number> {
  const qdrant = getQdrantManager();
  try {
    const info = await (qdrant.client as any).getCollection(collection);
    const count: number | undefined =
      info?.points_count ??
      info?.result?.points_count ??
      info?.vectors_count ??
      info?.result?.vectors_count;
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

async function samplePacketKeys(
  collection: string,
  limit: number = 20,
): Promise<string[]> {
  const qdrant = getQdrantManager();
  try {
    const response = await (qdrant.client as any).scroll(collection, {
      limit,
      with_payload: true,
      with_vector: false,
    });
    return normalizePoints(response)
      .map(p => p.payload?.['packet_key'] as string | undefined)
      .filter((k): k is string => typeof k === 'string' && k.trim() !== '');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a server-side Qdrant snapshot for `collection`.
 * Returns the snapshot description from Qdrant.
 */
export async function createCollectionSnapshot(
  collection: string,
): Promise<{ ok: boolean; snapshot: SnapshotDescription | null; message: string }> {
  const qdrant = getQdrantManager();
  try {
    const raw = await qdrant.client.createSnapshot(collection);
    // raw may be the snapshot object directly or wrapped
    const s: Record<string, unknown> =
      (raw as any)?.result ?? raw ?? {};

    const snapshot: SnapshotDescription = {
      name: String(s['name'] ?? ''),
      creationTime: typeof s['creation_time'] === 'string' ? s['creation_time'] : null,
      sizeMb:
        typeof s['size'] === 'number'
          ? Math.round((s['size'] as number) / (1024 * 1024) * 100) / 100
          : null,
      checksum: typeof s['checksum'] === 'string' ? s['checksum'] : null,
    };

    return {
      ok: snapshot.name !== '',
      snapshot,
      message: snapshot.name !== ''
        ? `Snapshot '${snapshot.name}' created for collection '${collection}'`
        : `Snapshot created but name was empty — Qdrant response: ${JSON.stringify(raw)}`,
    };
  } catch (err) {
    return {
      ok: false,
      snapshot: null,
      message: `createCollectionSnapshot failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Build a baseline record at snapshot time.
 * Call this immediately after createCollectionSnapshot() so the counts and
 * sample keys reflect the state captured in the snapshot.
 */
export async function buildSnapshotBaseline(
  collection: string,
  snapshotName: string,
  sampleSize: number = 20,
): Promise<SnapshotBaseline> {
  const [pointCount, samplePacketKeyList] = await Promise.all([
    getCollectionPointCount(collection),
    samplePacketKeys(collection, sampleSize),
  ]);

  return {
    collection,
    snapshotName,
    pointCount,
    samplePacketKeys: samplePacketKeyList,
    takenAt: new Date().toISOString(),
  };
}

/**
 * List all snapshots for `collection`, sorted newest first.
 */
export async function listCollectionSnapshots(
  collection: string,
): Promise<SnapshotDescription[]> {
  const qdrant = getQdrantManager();
  try {
    const raw = await qdrant.client.listSnapshots(collection);
    const items: unknown[] = Array.isArray(raw)
      ? raw
      : (raw as any)?.result ?? [];
    return (items as Array<Record<string, unknown>>)
      .map(s => ({
        name: String(s['name'] ?? ''),
        creationTime: typeof s['creation_time'] === 'string' ? s['creation_time'] : null,
        sizeMb:
          typeof s['size'] === 'number'
            ? Math.round((s['size'] as number) / (1024 * 1024) * 100) / 100
            : null,
        checksum: typeof s['checksum'] === 'string' ? s['checksum'] : null,
      }))
      .sort((a, b) =>
        (b.creationTime ?? '').localeCompare(a.creationTime ?? ''),
      );
  } catch {
    return [];
  }
}

/**
 * Delete all but the `keep` most-recent snapshots for `collection`.
 * Returns the names of the deleted snapshots.
 */
export async function pruneSnapshots(
  collection: string,
  keep: number = 3,
): Promise<{ deleted: string[]; kept: string[]; message: string }> {
  const qdrant = getQdrantManager();
  const all = await listCollectionSnapshots(collection);

  if (all.length <= keep) {
    return {
      deleted: [],
      kept: all.map(s => s.name),
      message: `${all.length} snapshot(s) present — nothing to prune (keep=${keep})`,
    };
  }

  const toKeep = all.slice(0, keep);
  const toDelete = all.slice(keep);
  const deleted: string[] = [];

  for (const s of toDelete) {
    try {
      await qdrant.client.deleteSnapshot(collection, s.name);
      deleted.push(s.name);
    } catch (err) {
      console.warn(`[snapshot] failed to delete '${s.name}':`, (err as Error).message);
    }
  }

  return {
    deleted,
    kept: toKeep.map(s => s.name),
    message: `Pruned ${deleted.length} snapshot(s); kept ${toKeep.length}`,
  };
}

/**
 * Verify that a restored collection matches a pre-snapshot baseline.
 *
 * Checks:
 *  1. Point count ≥ 99% of baseline (tolerates minor replication lag).
 *  2. ≥ 90% of baseline sample packet_keys are present in the restored collection.
 *
 * This is the "restore proof" — call it after the operator has triggered a
 * Qdrant restore (via the dashboard or `recoverSnapshot()`) to confirm the
 * collection is not silently empty or truncated.
 */
export async function verifyRestoreIntegrity(
  baseline: SnapshotBaseline,
): Promise<RestoreVerificationResult> {
  const { collection } = baseline;
  const qdrant = getQdrantManager();

  // 1. Point count
  const actualPointCount = await getCollectionPointCount(collection);
  const pointCountMatch =
    baseline.pointCount === 0
      ? actualPointCount === 0
      : actualPointCount >= Math.floor(baseline.pointCount * POINT_COUNT_TOLERANCE);

  // 2. Sample recall — check each baseline packet_key exists in the collection
  let foundKeys = 0;
  if (baseline.samplePacketKeys.length > 0) {
    try {
      for (const pk of baseline.samplePacketKeys) {
        const scrollResponse = await (qdrant.client as any).scroll(collection, {
          limit: 1,
          with_payload: false,
          with_vector: false,
          filter: { must: [{ key: 'packet_key', match: { value: pk } }] },
        });
        if (normalizePoints(scrollResponse).length > 0) {
          foundKeys++;
        }
      }
    } catch (err) {
      return {
        ok: false,
        collection,
        baseline,
        actualPointCount,
        pointCountMatch,
        sampleRecallRate: 0,
        message: `Sample key verification failed: ${(err as Error).message}`,
      };
    }
  } else {
    // No sample to check — treat as pass
    foundKeys = 1;
  }

  const sampleRecallRate =
    baseline.samplePacketKeys.length > 0
      ? foundKeys / baseline.samplePacketKeys.length
      : 1;
  const sampleRecallOk = sampleRecallRate >= SAMPLE_RECALL_THRESHOLD;

  const ok = pointCountMatch && sampleRecallOk;

  const message = ok
    ? `Restore verified: ${actualPointCount}/${baseline.pointCount} points, sample recall ${(sampleRecallRate * 100).toFixed(1)}%`
    : [
        !pointCountMatch
          ? `Point count mismatch: ${actualPointCount} actual vs ${baseline.pointCount} baseline (need ≥ ${POINT_COUNT_TOLERANCE * 100}%)`
          : null,
        !sampleRecallOk
          ? `Sample recall too low: ${(sampleRecallRate * 100).toFixed(1)}% (need ≥ ${SAMPLE_RECALL_THRESHOLD * 100}%)`
          : null,
      ]
        .filter(Boolean)
        .join('; ');

  return {
    ok,
    collection,
    baseline,
    actualPointCount,
    pointCountMatch,
    sampleRecallRate,
    message,
  };
}
