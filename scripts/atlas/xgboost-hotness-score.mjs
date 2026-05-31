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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
const NEO4J_URI = process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';
const COLLECTION = 'codebase_chunks_768';
const HOT_SET_KEY = 'ace:cluster:hot';
const HOT_SET_TTL = 3600; // 1h
const DEEP_IMPORT_GRAPH_PATH = resolve(ROOT, 'docs/graph/deep-import-graph.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_BACKFILL = args.includes('--skip-backfill');
const exportPathArgIndex = args.indexOf('--export-path');
const EXPORT_PATH_ARG =
  exportPathArgIndex !== -1 && args[exportPathArgIndex + 1] && !args[exportPathArgIndex + 1].startsWith('--')
    ? args[exportPathArgIndex + 1]
    : null;
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
    body: JSON.stringify({ key: 'gpuCluster', limit: 50 }),
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

function normalizeRepoPath(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '');
}

async function scrollClusterSignals(clusterId) {
  const paths = [];
  const tagCounts = new Map();
  const languageCounts = new Map();
  let offset = null;
  do {
    const body = {
      filter: { must: [{ key: 'gpuCluster', match: { value: clusterId } }] },
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

function loadDeepImportGraphMetrics() {
  if (!existsSync(DEEP_IMPORT_GRAPH_PATH)) return new Map();

  try {
    const raw = JSON.parse(readFileSync(DEEP_IMPORT_GRAPH_PATH, 'utf8'));
    const metrics = new Map();
    for (const node of Array.isArray(raw?.nodes) ? raw.nodes : []) {
      const rel = normalizeRepoPath(node?.rel);
      if (!rel) continue;
      metrics.set(rel, {
        directFanIn: Number(node?.directFanIn ?? 0) || 0,
        directFanOut: Number(node?.directFanOut ?? 0) || 0,
      });
    }
    console.log(`[hotness] step 2.5: loaded ${metrics.size} deep-import fallback rows`);
    return metrics;
  } catch (error) {
    console.warn('[hotness] step 2.5: failed to load deep-import graph fallback:', error.message);
    return new Map();
  }
}

async function loadNeo4jImportMetrics(clusterRows) {
  const usableRows = clusterRows.filter((row) => Array.isArray(row.paths) && row.paths.length > 0);
  if (usableRows.length === 0) return new Map();

  let neo4j;
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    return null;
  }

  const driver = neo4j.default.driver(
    NEO4J_URI,
    neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  const session = driver.session();
  try {
    const result = await session.run(
      `UNWIND $clusters AS cluster
       UNWIND cluster.paths AS filePath
       MATCH (f:CodebaseFile {filePath: filePath})
       OPTIONAL MATCH (importer:CodebaseFile)-[:IMPORTS]->(f)
       WITH cluster, f, count(DISTINCT importer) AS inDegree
       OPTIONAL MATCH (f)-[:IMPORTS]->(imported:CodebaseFile)
       WITH cluster, f, inDegree, count(DISTINCT imported) AS outDegree
       RETURN cluster.clusterId AS clusterId,
              sum(inDegree) AS inDegreeSum,
              sum(outDegree) AS outDegreeSum,
              avg(inDegree) AS inDegreeAvg,
              avg(outDegree) AS outDegreeAvg,
              max(inDegree) AS inDegreeMax,
              max(outDegree) AS outDegreeMax,
              count(f) AS matchedFiles
       ORDER BY clusterId`,
      {
        clusters: usableRows.map((row) => ({
          clusterId: row.clusterId,
          paths: [...new Set(row.paths.map(normalizeRepoPath).filter(Boolean))],
        })),
      }
    );

    const metrics = new Map();
    for (const record of result.records) {
      const clusterId = Number(record.get('clusterId'));
      metrics.set(clusterId, {
        inDegreeSum: Number(record.get('inDegreeSum') ?? 0) || 0,
        outDegreeSum: Number(record.get('outDegreeSum') ?? 0) || 0,
        inDegreeAvg: Number(record.get('inDegreeAvg') ?? 0) || 0,
        outDegreeAvg: Number(record.get('outDegreeAvg') ?? 0) || 0,
        inDegreeMax: Number(record.get('inDegreeMax') ?? 0) || 0,
        outDegreeMax: Number(record.get('outDegreeMax') ?? 0) || 0,
        matchedFiles: Number(record.get('matchedFiles') ?? 0) || 0,
      });
    }

    console.log(`[hotness] step 2.5: loaded Neo4j import metrics for ${metrics.size} clusters`);
    return metrics;
  } catch (error) {
    console.warn(
      '[hotness] step 2.5: Neo4j import metric query failed — using deep-import fallback:',
      error.message
    );
    return null;
  } finally {
    await session.close().catch(() => {});
    await driver.close().catch(() => {});
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
            with_payload: ['gpuCluster'],
            with_vector: false,
            limit: 1,
          }),
        }
      );
      const data = await searchRes.json();
      const cluster = data.result?.points?.[0]?.payload?.gpuCluster;
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
    0.24 * (f.meanBlendNorm ?? 0) +
    0.18 * (f.pointCountNorm ?? 0) +
    0.12 * (f.hitSignalNorm ?? 0) +
    0.1 * (f.clusterPageRankNorm ?? 0) +
    0.08 * (f.hyperedgeCountNorm ?? 0) +
    0.05 * (f.hyperedgeCrossRateNorm ?? 0) +
    0.08 * (f.inDegreeSumNorm ?? 0) +
    0.05 * (f.outDegreeSumNorm ?? 0) +
    0.04 * (f.betweennessProxyNorm ?? 0) +
    0.03 * (f.meanAttn ?? 0) +
    0.03 * (f.maxJaccard ?? 0)
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
    await backfillChunkHitLog(pgPool).catch((err) => {
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

  // --- Step 2.5: Load graph features from Redis ---
  // a) CouchDB PageRank scores (plain string key, JSON object {[filePath]: {score: number}})
  let prMap = {};
  try {
    const prRaw = await redis.get('couchdb:pagerank_scores');
    if (prRaw) {
      prMap = JSON.parse(prRaw);
      console.log(`[hotness] step 2.5: loaded ${Object.keys(prMap).length} PageRank entries`);
    } else {
      console.warn(
        '[hotness] step 2.5: couchdb:pagerank_scores absent — clusterPageRank will be 0'
      );
    }
  } catch (err) {
    console.warn('[hotness] step 2.5: failed to load PageRank scores (non-fatal):', err.message);
  }

  // b) Hyperedge data from hg:edge:idx ZSET + individual hg:edge:{hash} keys
  const edgeList = []; // [{clusterA, clusterB}, ...]
  try {
    const edgeHashes = await redis.zrange('hg:edge:idx', 0, -1);
    if (edgeHashes.length === 0) {
      console.warn('[hotness] step 2.5: hg:edge:idx empty — hyperedge features will be 0');
    } else {
      const pipeline = redis.pipeline();
      for (const hash of edgeHashes) {
        pipeline.get(`hg:edge:${hash}`);
      }
      const results = await pipeline.exec();
      for (const [err, raw] of results) {
        if (err || !raw) continue;
        try {
          const edge = JSON.parse(raw);
          // Support both snake_case and camelCase field names
          const clusterA = edge.clusterA ?? edge.cluster_a ?? null;
          const clusterB = edge.clusterB ?? edge.cluster_b ?? null;
          if (clusterA != null && clusterB != null) {
            edgeList.push({ clusterA, clusterB });
          }
        } catch {
          // ignore malformed edge entries
        }
      }
      console.log(`[hotness] step 2.5: loaded ${edgeList.length} hyperedges`);
    }
  } catch (err) {
    console.warn('[hotness] step 2.5: failed to load hyperedge data (non-fatal):', err.message);
  }

  // --- Build per-cluster feature structs ---
  const rawFeatures = [];

  for (const hit of clusterHits) {
    const clusterId = hit.value;
    const pointCount = hit.count;

    const { paths, tagCounts, languageCounts } = await scrollClusterSignals(clusterId);
    const kFeatures = computeKarpathyFeatures(
      clusterId,
      pointCount,
      paths,
      tagCounts,
      languageCounts,
      karpathyMap
    );
    const nFeatures = await getNeighborFeatures(redis, clusterId);
    const hFeatures = await getClusterHitFreq(pgPool, clusterId);

    // Step 2.5: graph features — PageRank mean + hyperedge counts
    const clusterPageRank = paths.length
      ? paths.reduce((sum, p) => {
          const stripped = p.replace(/^sveltekit-frontend\//, '');
          const entry = prMap[p] ?? prMap[stripped];
          return (
            sum +
            (typeof entry?.score === 'number' ? entry.score : typeof entry === 'number' ? entry : 0)
          );
        }, 0) / paths.length
      : 0;

    const clusterEdges = edgeList.filter(
      (e) => e.clusterA === clusterId || e.clusterB === clusterId
    );
    const hyperedgeCount = clusterEdges.length;
    const crossEdges = clusterEdges.filter((e) => e.clusterA !== e.clusterB).length;
    const hyperedgeCrossRate = crossEdges / (hyperedgeCount || 1);

    const feature = {
      paths,
      ...kFeatures,
      ...nFeatures,
      ...hFeatures,
      clusterPageRank,
      hyperedgeCount,
      crossEdges,
      hyperedgeCrossRate,
      inDegreeSum: 0,
      outDegreeSum: 0,
      betweennessProxy: 0,
    };

    rawFeatures.push(feature);

    console.log(
      `[hotness] cluster ${clusterId} (${pointCount}pts) | ` +
        `blend=${feature.meanBlend.toFixed(3)} | ` +
        `neighbors=${feature.neighborCount} | ` +
        `tags=${feature.tagCount} | ` +
        `langs=${feature.languageCount} | ` +
        `hits7d=${feature.hits7d} | ` +
        `pr=${feature.clusterPageRank.toFixed(3)} | ` +
        `hedges=${feature.hyperedgeCount}`
    );
  }

  // --- Step 2.5b: Neo4j import-degree graph features ---
  const deepImportMetrics = loadDeepImportGraphMetrics();
  const importMetrics = await loadNeo4jImportMetrics(
    rawFeatures.map((feature) => ({
      clusterId: feature.clusterId,
      paths: feature.paths,
    }))
  ).catch(() => null);

  for (const feature of rawFeatures) {
    const clusterImportMetrics = importMetrics?.get(feature.clusterId);
    if (clusterImportMetrics) {
      feature.inDegreeSum = clusterImportMetrics.inDegreeSum ?? 0;
      feature.outDegreeSum = clusterImportMetrics.outDegreeSum ?? 0;
    } else {
      let inDegreeSum = 0;
      let outDegreeSum = 0;
      for (const pathName of feature.paths ?? []) {
        const rel = normalizeRepoPath(pathName);
        const fallback = deepImportMetrics.get(rel);
        if (!fallback) continue;
        inDegreeSum += fallback.directFanIn ?? 0;
        outDegreeSum += fallback.directFanOut ?? 0;
      }
      feature.inDegreeSum = inDegreeSum;
      feature.outDegreeSum = outDegreeSum;
    }

    feature.betweennessProxy =
      feature.pointCount > 0
        ? (feature.inDegreeSum * feature.outDegreeSum) / (feature.pointCount * feature.pointCount)
        : 0;
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
  // Step 2.5: normalize new graph dimensions
  features = normalizeByMax(features, 'clusterPageRank');
  features = normalizeByMax(features, 'hyperedgeCount');
  features = normalizeByMax(features, 'hyperedgeCrossRate');
  features = normalizeByMax(features, 'inDegreeSum');
  features = normalizeByMax(features, 'outDegreeSum');
  features = normalizeByMax(features, 'betweennessProxy');

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
  for (const feature of features) {
    delete feature.paths;
  }

  const exportPath = EXPORT_PATH_ARG
    ? resolve(ROOT, EXPORT_PATH_ARG)
    : resolve(REPO_ROOT, 'models/xgboost-hotness/features.json');
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
