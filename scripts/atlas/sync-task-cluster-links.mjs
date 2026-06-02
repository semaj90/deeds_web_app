#!/usr/bin/env node
/**
 * sync-task-cluster-links.mjs  (Phase 102 — T1)
 *
 * Bridges workspace_tasks ↔ feature_id ↔ cluster_id by:
 *  1. Reading workspace_tasks rows that have a feature_id
 *  2. Looking up their latest task_semantic_packet (cluster_id, centroid_id, qdrant_point_id)
 *  3. Consulting Redis gpu:karpathy:scores for the blend score (ordering only)
 *  4. Upserting into task_cluster_links (on conflict workspace_task_id + feature_id → update)
 *
 * Gate: SELECT count(*) FROM task_cluster_links  →  > 0 after first run
 *
 * Usage:
 *   node scripts/atlas/sync-task-cluster-links.mjs [--dry-run] [--limit=N]
 */
import process from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500;

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS   = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION   = 'codebase_chunks_768';

// ── Redis (cold-start pattern — ioredis) ──────────────────────────────────────
let redis = null;

async function initRedis() {
  redis = new Redis(REDIS_URL, {
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
    console.log('[sync-cluster-links] Redis connected');
  } catch {
    console.warn('[sync-cluster-links] Redis unavailable — blend scores will be 0');
    redis = null;
  }
}

async function getKarpathyBlend(stableKey) {
  if (!redis || !stableKey) return 0;
  try {
    const raw = await redis.hget('gpu:karpathy:scores', stableKey);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed.blend === 'number' ? parsed.blend : 0;
  } catch {
    return 0;
  }
}

// ── Postgres ───────────────────────────────────────────────────────────────────
let pool = null;

async function initDb() {
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  await pool.query('SELECT 1');
  console.log('[sync-cluster-links] Postgres connected');
}

// ── Qdrant helpers ─────────────────────────────────────────────────────────────
async function qdrantScrollByFeatureId(featureId, limit = 5) {
  if (!featureId) return [];
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'feature_id', match: { value: featureId } }],
        },
        limit,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result?.points ?? [];
  } catch {
    return [];
  }
}

async function qdrantScrollByStableKey(stableKey, limit = 3) {
  if (!stableKey) return [];
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'stable_key', match: { value: stableKey } }],
        },
        limit,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result?.points ?? [];
  } catch {
    return [];
  }
}

// ── Upsert (check + insert/update — no unique constraint on table) ────────────
const CHECK_SQL = `
  SELECT id FROM task_cluster_links
  WHERE workspace_task_id = $1 AND feature_id IS NOT DISTINCT FROM $2
  LIMIT 1
`;
const INSERT_SQL = `
  INSERT INTO task_cluster_links
    (workspace_task_id, feature_id, qdrant_point_id, cluster_id, centroid_id, relation_kind, source_ref)
  VALUES ($1, $2, $3, $4, $5, 'related', 'sync-task-cluster-links')
`;
const UPDATE_SQL = `
  UPDATE task_cluster_links SET
    qdrant_point_id = $3,
    cluster_id      = $4,
    centroid_id     = $5,
    source_ref      = 'sync-task-cluster-links'
  WHERE workspace_task_id = $1 AND feature_id IS NOT DISTINCT FROM $2
`;

async function upsertLink(taskId, featureId, qdrantPointId, clusterId, centroidId) {
  if (DRY) return;
  const existing = await pool.query(CHECK_SQL, [taskId, featureId]);
  if (existing.rows.length > 0) {
    await pool.query(UPDATE_SQL, [taskId, featureId, qdrantPointId, clusterId, centroidId]);
  } else {
    await pool.query(INSERT_SQL, [taskId, featureId, qdrantPointId, clusterId, centroidId]);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[sync-cluster-links] mode=${DRY ? 'DRY-RUN' : 'WRITE'} limit=${LIMIT}`);

  await initDb();
  await initRedis();

  // 1. Load workspace_tasks with feature_id
  const tasksResult = await pool.query(`
    SELECT t.id, t.feature_id, t.title, t.name,
           sp.cluster_id, sp.centroid_id, sp.qdrant_point_id, sp.source_ref
    FROM workspace_tasks t
    LEFT JOIN LATERAL (
      SELECT cluster_id, centroid_id, qdrant_point_id, source_ref
      FROM task_semantic_packets
      WHERE workspace_task_id = t.id AND deleted = false
      ORDER BY created_at DESC
      LIMIT 1
    ) sp ON true
    WHERE t.feature_id IS NOT NULL
    ORDER BY t.id
    LIMIT $1
  `, [LIMIT]);

  const tasks = tasksResult.rows;
  console.log(`[sync-cluster-links] ${tasks.length} tasks with feature_id`);

  let linked = 0;
  let skipped = 0;
  let qdrantHits = 0;

  for (const task of tasks) {
    const taskId = task.id;
    const featureId = task.feature_id;

    // Start with packet data if available
    let qdrantPointId = task.qdrant_point_id ?? null;
    let clusterId = task.cluster_id ?? null;
    let centroidId = task.centroid_id ?? null;

    // If no qdrant_point_id from packet, try Qdrant scroll by feature_id
    if (!qdrantPointId && featureId) {
      const points = await qdrantScrollByFeatureId(featureId, 3);
      if (points.length > 0) {
        const best = points[0];
        qdrantPointId = String(best.id);
        clusterId = clusterId ?? best.payload?.cluster_id ?? best.payload?.clusterKey ?? null;
        centroidId = centroidId ?? best.payload?.centroid_id ?? null;
        qdrantHits++;
      }
    }

    // If still no qdrant_point_id, try stable_key scroll using source_ref
    if (!qdrantPointId && task.source_ref) {
      const points = await qdrantScrollByStableKey(task.source_ref, 1);
      if (points.length > 0) {
        const best = points[0];
        qdrantPointId = String(best.id);
        clusterId = clusterId ?? best.payload?.cluster_id ?? null;
        centroidId = centroidId ?? best.payload?.centroid_id ?? null;
        qdrantHits++;
      }
    }

    // If cluster_id still missing, try Redis Karpathy scores by feature_id
    if (!clusterId && featureId && redis) {
      try {
        const raw = await redis.hget('gpu:karpathy:scores', featureId);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.cluster_id) clusterId = parsed.cluster_id;
        }
      } catch { /* skip */ }
    }

    if (!qdrantPointId) {
      // Create a synthetic stable point ID so the row is still queryable
      qdrantPointId = `task:${taskId}:feature:${featureId}`;
    }

    const blend = await getKarpathyBlend(featureId);
    const label = task.title ?? task.name ?? `task-${taskId}`;
    console.log(`  [${taskId}] ${label.slice(0, 60)} | cluster=${clusterId ?? 'none'} blend=${blend.toFixed(3)}`);

    try {
      await upsertLink(taskId, featureId, qdrantPointId, clusterId, centroidId);
      linked++;
    } catch (err) {
      console.warn(`  [${taskId}] upsert failed: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n[sync-cluster-links] Done — linked=${linked} skipped=${skipped} qdrantHits=${qdrantHits}`);

  if (!DRY) {
    const countResult = await pool.query('SELECT count(*) AS n FROM task_cluster_links');
    console.log(`[sync-cluster-links] task_cluster_links total rows: ${countResult.rows[0].n}`);
  }

  // Cleanup
  if (redis) {
    try { await redis.quit(); } catch { /* ignore */ }
  }
  await pool.end();
}

main().catch(err => {
  console.error('[sync-cluster-links] Fatal:', err.message);
  process.exit(1);
});
