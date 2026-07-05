#!/usr/bin/env node
import { resolve } from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { frontendRoot: ROOT, repoRoot: REPO_ROOT } = resolveAtlasPaths(import.meta.url);

// Load root .env first (has REDIS_URL), then sveltekit-frontend/.env (may override)
dotenv.config({ path: resolve(REPO_ROOT, '.env') });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const COLLECTION = 'codebase_chunks_768';
const TTL = 604800; // 7 days
const MAX_NEIGHBORS = 5;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_FLAG = (() => {
  const idx = args.indexOf('--limit');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : null;
})();
const MIN_JACCARD = (() => {
  const idx = args.indexOf('--min-jaccard');
  return idx !== -1 ? parseFloat(args[idx + 1]) : 0.05;
})();

if (!REDIS_URL) {
  console.error('[graphrag-recommend] REDIS_URL not set — skipping');
  process.exit(0);
}

async function discoverClusters() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/facet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'neo4j_gpuCluster', limit: 50 }),
  });
  if (!res.ok) throw new Error(`Facet API failed: ${res.status}`);
  const data = await res.json();
  return data.result.hits;
}

async function scrollClusterTags(clusterId) {
  const tagFreq = new Map();
  let offset = null;
  let totalPoints = 0;
  do {
    const body = {
      filter: { must: [{ key: 'neo4j_gpuCluster', match: { value: clusterId } }] },
      with_payload: ['tags'],
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
      totalPoints++;
      for (const tag of (pt.payload?.tags ?? [])) {
        tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
      }
    }
    offset = data.result.next_page_offset ?? null;
  } while (offset !== null);
  return { tagFreq, totalPoints };
}

function jaccard(freqA, freqB) {
  const keysA = new Set(freqA.keys());
  const keysB = new Set(freqB.keys());
  const intersection = [...keysA].filter(k => keysB.has(k)).length;
  const union = new Set([...keysA, ...keysB]).size;
  return union === 0 ? 0 : intersection / union;
}

async function main() {
  const startTs = Date.now();

  let clusterHits = await discoverClusters();
  // Sort descending by count so --limit picks the largest clusters
  clusterHits.sort((a, b) => b.count - a.count);
  if (LIMIT_FLAG !== null && !isNaN(LIMIT_FLAG)) {
    clusterHits = clusterHits.slice(0, LIMIT_FLAG);
  }

  console.log(`[graphrag-recommend] discovered ${clusterHits.length} clusters`);

  const clusterData = new Map();
  for (const hit of clusterHits) {
    const clusterId = hit.value;
    const { tagFreq, totalPoints } = await scrollClusterTags(clusterId);
    const uniqueTags = tagFreq.size;
    console.log(`[graphrag-recommend] cluster ${clusterId} (${hit.count} pts) → ${uniqueTags} unique tags`);
    clusterData.set(clusterId, { tagFreq, totalPoints });
  }

  const clusterIds = [...clusterData.keys()];
  const neighborMap = new Map();

  for (let i = 0; i < clusterIds.length; i++) {
    const idA = clusterIds[i];
    const scores = [];
    for (let j = 0; j < clusterIds.length; j++) {
      if (i === j) continue;
      const idB = clusterIds[j];
      const score = jaccard(clusterData.get(idA).tagFreq, clusterData.get(idB).tagFreq);
      if (score >= MIN_JACCARD) {
        scores.push({ neighborId: idB, score });
      }
    }
    scores.sort((a, b) => b.score - a.score);
    neighborMap.set(idA, scores);
  }

  console.log('[graphrag-recommend] Jaccard matrix (top neighbors):');
  for (const [clusterId, neighbors] of neighborMap) {
    const top = neighbors.slice(0, MAX_NEIGHBORS);
    if (top.length === 0) {
      console.log(`  cluster:gpu:${clusterId} → (no neighbors above threshold)`);
    } else {
      const fmt = top.map(n => `cluster:gpu:${n.neighborId} ${n.score.toFixed(3)}`).join(', ');
      console.log(`  cluster:gpu:${clusterId} → [${fmt}]`);
    }
  }

  if (DRY_RUN) {
    console.log('[graphrag-recommend] --dry-run: skipping Redis writes');
    return;
  }

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
    console.error('[graphrag-recommend] Redis unavailable — skipping');
    process.exit(0);
  });

  const pipe = redis.pipeline();

  for (const [clusterId, neighbors] of neighborMap) {
    const redisKey = `ace:cluster:graphrag:neighbors:cluster:gpu:${clusterId}`;
    pipe.del(redisKey);
    for (const { neighborId, score } of neighbors.slice(0, MAX_NEIGHBORS)) {
      if (score >= MIN_JACCARD) {
        pipe.zadd(redisKey, score, `cluster:gpu:${neighborId}`);
      }
    }
    pipe.expire(redisKey, TTL);
  }

  pipe.hset('ace:cluster:graphrag:meta', {
    ts: new Date().toISOString(),
    clusterCount: String(clusterIds.length),
    runtimeMs: String(Date.now() - startTs),
  });
  pipe.expire('ace:cluster:graphrag:meta', TTL);

  await pipe.exec();
  await redis.quit();

  console.log(
    `[graphrag-recommend] wrote ${clusterIds.length} neighbor sorted sets to Redis (TTL ${TTL}s, ${Date.now() - startTs}ms)`
  );
}

main().catch(err => {
  console.error('[graphrag-recommend] error:', err.message);
  process.exit(1);
});
