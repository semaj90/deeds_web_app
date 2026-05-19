#!/usr/bin/env node
/**
 * xgboost-hotness-score.mjs
 *
 * Track 7 Phase C — per-cluster hotness scoring.
 * Builds a feature matrix from live Qdrant + Redis signals, computes a
 * weighted hotness score per GPU cluster, and writes ace:cluster:hot ZADD.
 *
 * Signals:
 *  - Karpathy blend (PageRank × attention × authority) from Redis
 *  - GraphRAG Jaccard neighbor score from Redis (Phase A output)
 *  - Cluster point count from Qdrant facet
 *  - ACE query hit frequency from chunk_hit_log (Postgres, optional)
 *
 * Flags:
 *  --dry-run        compute + print but skip Redis writes
 *  --skip-backfill  skip chunk_hit_log NULL backfill step
 *  --top N          emit only top-N clusters (default: all)
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import pkg from 'pg';
import { fileLanguage } from './_atlas-utils.mjs';

const { Pool } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../sveltekit-frontend');
const REPO_ROOT = resolve(__dirname, '../..');

// Load root .env first, then sveltekit-frontend/.env (no override)
dotenv.config({ path: resolve(REPO_ROOT, '.env') });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const COLLECTION = 'codebase_chunks_768';
const HOT_SET_KEY = 'ace:cluster:hot';
const HOT_SET_TTL = 3600; // 1h

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_BACKFILL = args.includes('--skip-backfill');
const TOP_N = (() => {
  const idx = args.indexOf('--top');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : null;
})();

if (!REDIS_URL) {
  console.error('[hotness] REDIS_URL not set — skipping');
  process.exit(0);
}

// ── Qdrant helpers ─────────────────────────────────────────────────────────

async function discoverClusters() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/facet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'neo4j_gpuCluster', limit: 50 }),
  });
  if (!res.ok) throw new Error(`Facet API failed: ${res.status}`);
  const data = await res.json();
  return data.result.hits; // [{value: 18, count: 456}, ...]
}

function normalizeLanguage(payload, fallbackPath = '') {
  const rawLanguage = typeof payload?.language === 'string' ? payload.language.trim().toLowerCase() : '';
  const language = rawLanguage.replace(/^lang:/, '').replace(/_/g, '-');
  if (language) return language;

  const inferred = fileLanguage(fallbackPath);
  return inferred !== 'other' ? inferred : null;
}

async function scrollClusterSignals(clusterId) {
  const paths = [];
  const tagCounts = new Map();
  const languageCounts = new Map();
  let offset = null;
  do {
    const body = {
      filter: { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] },
      with_payload: ['relativePath', 'file_path', 'path', 'tags', 'language'],
      with_vector: false,
      limit: 200,
    };
    if (offset !== null) body.offset = offset;
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Scroll failed for cluster ${clusterId}: ${res.status}`);
    const data = await res.json();
    for (const pt of data.result.points) {
      const payload = pt.payload ?? {};
      const p = payload.relativePath || payload.file_path || payload.path;
      if (p) paths.push(p);

      for (const tag of Array.isArray(payload.tags) ? payload.tags : []) {
        if (typeof tag !== 'string' || !tag) continue;
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }

      const language = normalizeLanguage(payload, p ?? '');
      if (language) {
        languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
      }
    }
    offset = data.result.next_page_offset ?? null;
  } while (offset !== null);
  return { paths, tagCounts, languageCounts };
}

// ── Karpathy scores from Redis ─────────────────────────────────────────────

async function loadKarpathyMap(redis) {
  const raw = await redis.hgetall('gpu:karpathy:scores');
  if (!raw) return new Map();
  const map = new Map();
  for (const [filePath, json] of Object.entries(raw)) {
    try {
      const obj = JSON.parse(json);
      // Store under both the raw key and a path-stripped variant
      map.set(filePath, obj);
      const stripped = filePath.replace(/^sveltekit-frontend\//, '');
      if (stripped !== filePath) map.set(stripped, obj);
    } catch {
      // ignore malformed entries
    }
  }
  return map;
}

// ── Per-cluster Karpathy feature aggregation ───────────────────────────────

function computeKarpathyFeatures(clusterId, pointCount, paths, tagCounts, languageCounts, karpathyMap) {
  const scores = paths
    .map(p => karpathyMap.get(p) || karpathyMap.get(p.replace(/^sveltekit-frontend\//, '')))
    .filter(Boolean);

  const mean = (arr, key) =>
    arr.length ? arr.reduce((s, x) => s + (x[key] ?? 0), 0) / arr.length : 0;

  return {
    clusterId,
    pointCount,
    pathCount: paths.length,
    tagCount: tagCounts.size,
    languageCount: languageCounts.size,
    karpathyCount: scores.length,
    karpathyCoverage: paths.length ? scores.length / paths.length : 0,
    meanPr: mean(scores, 'pr'),
    meanAttn: mean(scores, 'attention'),
    meanAuthority: mean(scores, 'authority'),
    meanBlend: mean(scores, 'blend'),
    maxBlend: scores.length ? Math.max(...scores.map(s => s.blend ?? 0)) : 0,
    dominantLanguage: [...languageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    dominantLanguageShare: paths.length
      ? Math.max(...[...languageCounts.values(), 0]) / paths.length
      : 0,
  };
}

// ── GraphRAG neighbor features from Redis ──────────────────────────────────

async function getNeighborFeatures(redis, clusterId) {
  const key = `ace:cluster:graphrag:neighbors:cluster:gpu:${clusterId}`;
  const withScores = await redis.zrevrange(key, 0, -1, 'WITHSCORES');
  const neighbors = [];
  for (let i = 0; i < withScores.length; i += 2) {
    neighbors.push({ key: withScores[i], score: parseFloat(withScores[i + 1]) });
  }
  return {
    neighborCount: neighbors.length,
    maxJaccard: neighbors.length ? neighbors[0].score : 0,
    meanJaccard: neighbors.length
      ? neighbors.reduce((s, n) => s + n.score, 0) / neighbors.length
      : 0,
  };
}

// ── Hit frequency from chunk_hit_log ──────────────────────────────────────

async function getClusterHitFreq(pgPool, clusterId) {
  if (!pgPool) return { hits24h: 0, hits7d: 0 };
  try {
    const r = await pgPool.query(
      `SELECT
        COUNT(*) FILTER (WHERE hit_at > NOW() - INTERVAL '24 hours') AS hits24h,
        COUNT(*) FILTER (WHERE hit_at > NOW() - INTERVAL '7 days')  AS hits7d
       FROM chunk_hit_log WHERE gpu_cluster = $1`,
      [clusterId]
    );
    return {
      hits24h: parseInt(r.rows[0].hits24h || 0, 10),
      hits7d: parseInt(r.rows[0].hits7d || 0, 10),
    };
  } catch {
    return { hits24h: 0, hits7d: 0 };
  }
}

// ── Backfill chunk_hit_log.gpu_cluster ────────────────────────────────────

async function backfillChunkHitLog(pgPool) {
  const rows = await pgPool.query(
    `SELECT id, relative_path FROM chunk_hit_log WHERE gpu_cluster IS NULL LIMIT 500`
  );
  if (rows.rows.length === 0) {
    console.log('[hotness] chunk_hit_log: no NULL gpu_cluster rows to backfill');
    return;
  }

  let updated = 0;
  for (const row of rows.rows) {
    if (!row.relative_path) continue;
    try {
      const searchRes = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [{ key: 'relativePath', match: { value: row.relative_path } }],
            },
            with_payload: ['neo4j_gpuCluster'],
            with_vector: false,
            limit: 1,
          }),
        }
      );
      const data = await searchRes.json();
      const cluster = data.result?.points?.[0]?.payload?.neo4j_gpuCluster;
      if (cluster != null) {
        await pgPool.query(`UPDATE chunk_hit_log SET gpu_cluster = $1 WHERE id = $2`, [
          cluster,
          row.id,
        ]);
        updated++;
      }
    } catch {
      // per-row failures are non-fatal
    }
  }
  console.log(
    `[hotness] backfilled gpu_cluster for ${updated}/${rows.rows.length} chunk_hit_log rows`
  );
}

// ── Normalize helper ───────────────────────────────────────────────────────

function normalizeByMax(arr, key) {
  const max = Math.max(...arr.map(x => x[key] ?? 0));
  if (max === 0) return arr.map(x => ({ ...x, [`${key}Norm`]: 0 }));
  return arr.map(x => ({ ...x, [`${key}Norm`]: (x[key] ?? 0) / max }));
}

// ── Hotness score ──────────────────────────────────────────────────────────

function computeHotness(f) {
  return (
    0.35 * (f.meanBlendNorm ?? 0) +
    0.25 * (f.hitSignalNorm ?? 0) +
    0.20 * (f.pointCountNorm ?? 0) +
    0.10 * (f.neighborCountNorm ?? 0) +
    0.10 * (f.tagCountNorm ?? 0)
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTs = Date.now();

  // --- Redis connection (ioredis cold-start pattern) ---
  const redisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };
  if (REDIS_PASSWORD) redisOptions.password = REDIS_PASSWORD;

  const redis = new Redis(REDIS_URL, redisOptions);
  redis.on('error', () => {});
  await redis.connect().catch(() => {
    console.error('[hotness] Redis unavailable — exiting');
    process.exit(0);
  });

  // --- Postgres pool (optional) ---
  let pgPool = null;
  if (DATABASE_URL) {
    pgPool = new Pool({ connectionString: DATABASE_URL });
    pgPool.on('error', () => {});
  } else {
    console.log('[hotness] DATABASE_URL not set — hit frequency and backfill skipped');
  }

  // --- Backfill chunk_hit_log.gpu_cluster ---
  if (pgPool && !SKIP_BACKFILL) {
    await backfillChunkHitLog(pgPool).catch(err => {
      console.warn('[hotness] backfill error (non-fatal):', err.message);
    });
  }

  // --- Discover clusters ---
  let clusterHits = await discoverClusters();
  clusterHits.sort((a, b) => b.count - a.count);
  console.log(`[hotness] discovered ${clusterHits.length} clusters via Qdrant facet`);

  // --- Load Karpathy scores ---
  const karpathyMap = await loadKarpathyMap(redis);
  console.log(`[hotness] loaded ${karpathyMap.size / 2} Karpathy score entries from Redis`);

  // --- Build per-cluster feature structs ---
  const rawFeatures = [];

  for (const hit of clusterHits) {
    const clusterId = hit.value;
    const pointCount = hit.count;

    const { paths, tagCounts, languageCounts } = await scrollClusterSignals(clusterId);
    const kFeatures = computeKarpathyFeatures(clusterId, pointCount, paths, tagCounts, languageCounts, karpathyMap);
    const nFeatures = await getNeighborFeatures(redis, clusterId);
    const hFeatures = await getClusterHitFreq(pgPool, clusterId);

    const feature = {
      ...kFeatures,
      ...nFeatures,
      ...hFeatures,
    };

    rawFeatures.push(feature);

    console.log(
      `[hotness] cluster ${clusterId} (${pointCount}pts) | ` +
        `blend=${feature.meanBlend.toFixed(3)} | ` +
        `neighbors=${feature.neighborCount} | ` +
        `tags=${feature.tagCount} | ` +
        `langs=${feature.languageCount} | ` +
        `hits7d=${feature.hits7d}`
    );
  }

  // --- Normalize dimensions 0→1 ---
  let features = rawFeatures;
  features = normalizeByMax(features, 'meanBlend');
  features = normalizeByMax(features, 'pointCount');
  features = normalizeByMax(features, 'tagCount');
  features = normalizeByMax(features, 'neighborCount');
  features = normalizeByMax(features, 'hits24h');
  features = normalizeByMax(features, 'hits7d');
  features = normalizeByMax(features, 'languageCount');

  // --- Compute hotness ---
  features = features.map((f) => ({
    ...f,
    hitSignalNorm: Math.max(f.hits24hNorm ?? 0, f.hits7dNorm ?? 0),
    hotness: computeHotness(f),
  }));

  // --- Sort descending by hotness ---
  features.sort((a, b) => b.hotness - a.hotness);

  // --- Apply --top N filter ---
  const emitFeatures = TOP_N !== null && !isNaN(TOP_N) ? features.slice(0, TOP_N) : features;

  // --- Print top 5 ---
  const top5 = emitFeatures.slice(0, 5);
  console.log('[hotness] TOP 5 hot clusters:');
  top5.forEach((f, i) => {
    console.log(
      `  ${i + 1}. cluster:gpu:${f.clusterId}  score=${f.hotness.toFixed(4)} ` +
      `(blend=${f.meanBlend.toFixed(3)} tags=${f.tagCount} langs=${f.languageCount} hits24h=${f.hits24h})`
    );
  });

  // --- Export features.json ---
  const exportPath = resolve(REPO_ROOT, 'models/xgboost-hotness/features.json');
  mkdirSync(dirname(exportPath), { recursive: true });
  writeFileSync(
    exportPath,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        dryRun: DRY_RUN,
        clusters: emitFeatures,
      },
      null,
      2
    )
  );
  console.log(`[hotness] exported models/xgboost-hotness/features.json`);

  if (DRY_RUN) {
    console.log('[hotness] --dry-run: skipping Redis writes');
    await redis.quit();
    if (pgPool) await pgPool.end();
    return;
  }

  // --- Write ace:cluster:hot sorted set ---
  const pipe = redis.pipeline();
  pipe.del(HOT_SET_KEY);
  for (const f of emitFeatures) {
    pipe.zadd(HOT_SET_KEY, f.hotness, `cluster:gpu:${f.clusterId}`);
  }
  pipe.expire(HOT_SET_KEY, HOT_SET_TTL);
  await pipe.exec();

  console.log(
    `[hotness] wrote ${HOT_SET_KEY} (${emitFeatures.length} entries, TTL ${HOT_SET_TTL}s, ${Date.now() - startTs}ms)`
  );

  await redis.quit();
  if (pgPool) await pgPool.end();
}

main().catch(err => {
  console.error('[hotness] fatal error:', err.message);
  process.exit(1);
});
