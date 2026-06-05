#!/usr/bin/env node
/**
 * Backfills missing Qdrant SOM payloads by projecting file chunks onto the
 * cached graphify k-means centroids.
 *
 * This is intentionally dry-run by default. It does not alter Postgres schema
 * or production tables; after --apply, run atlas:sync-qdrant to mirror the
 * Qdrant payloads back into atlas_feature_map.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limitIndex = args.indexOf('--limit');
const LIMIT = Number(
  limitArg?.split('=')[1]
    ?? (limitIndex >= 0 ? args[limitIndex + 1] : null)
    ?? process.env.npm_config_limit
    ?? '0'
);
const K = Number(args.find((arg) => arg.startsWith('--k='))?.split('=')[1] ?? '20');
const BATCH = 250;
const DIM = 768;
const COLLECTION = 'codebase_chunks_768';

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function normalizeRedisUrl(value) {
  const raw = String(value || 'redis://127.0.0.1:6379');
  return /^[a-z]+:\/\//i.test(raw) ? raw : `redis://${raw}`;
}

function vectorFromPoint(point) {
  if (Array.isArray(point.vector)) return point.vector;
  if (point.vector && Array.isArray(point.vector.content)) return point.vector.content;
  if (point.vector && Array.isArray(point.vector.default)) return point.vector.default;
  if (point.vector && Array.isArray(point.vector.vector)) return point.vector.vector;
  return null;
}

function nearestCentroid(vector, centroids) {
  let best = -1;
  let bestDist = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const centroid = centroids[c];
    let dist = 0;
    for (let i = 0; i < DIM; i++) {
      const diff = Number(vector[i] ?? 0) - Number(centroid[i] ?? 0);
      dist += diff * diff;
      if (dist >= bestDist) break;
    }
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return { centroid: best, distance: bestDist };
}

async function main() {
  const env = loadEnv();
  const QDRANT_URL = env.QDRANT_URL ?? 'http://127.0.0.1:6333';
  const REDIS_URL = normalizeRedisUrl(env.REDIS_URL);

  const { default: Redis } = await import('ioredis');
  const redis = new Redis(REDIS_URL, {
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  if (redis.status === 'wait') await redis.connect();

  const [centroidsRaw, somGridRaw] = await Promise.all([
    redis.get(`cluster:kmeans:k${K}:centroids`),
    redis.get(`cluster:kmeans:k${K}:som:grid`),
  ]);
  await redis.quit().catch(() => {});

  if (!centroidsRaw || !somGridRaw) {
    throw new Error(`Missing Redis centroid cache for k=${K}; run graphify:semantic-cluster:force first.`);
  }

  const centroids = JSON.parse(centroidsRaw);
  const somGrid = JSON.parse(somGridRaw);
  if (!Array.isArray(centroids) || centroids.length !== K) {
    throw new Error(`Invalid centroid cache shape for k=${K}`);
  }

  console.log('══ Qdrant SOM Backfill From Centroids ═══════════════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log(`  k:          ${K}`);
  console.log(`  Limit:      ${LIMIT || 'none'}`);

  let offset = null;
  let scanned = 0;
  let missingSom = 0;
  let projected = 0;
  let written = 0;
  let failed = 0;
  const byPayload = new Map();
  const samples = [];

  while (true) {
    const body = { limit: BATCH, offset, with_payload: true, with_vector: true };
    if (!offset) delete body.offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
    const data = await res.json();
    const points = data?.result?.points ?? [];
    if (!points.length) break;

    for (const point of points) {
      scanned++;
      const payload = point.payload ?? {};
      if (payload.som_cluster != null || payload.gpuCluster != null) continue;

      const vector = vectorFromPoint(point);
      if (!vector || vector.length < DIM) continue;

      missingSom++;
      const { centroid, distance } = nearestCentroid(vector, centroids);
      const grid = somGrid.find((item) => Number(item.centroid) === centroid) ?? {};
      const nextPayload = {
        gpuCluster: centroid,
        som_cluster: centroid,
        centroid_id: centroid,
        somRow: grid.row ?? null,
        somCol: grid.col ?? null,
      };
      const key = JSON.stringify(nextPayload);
      if (!byPayload.has(key)) byPayload.set(key, { payload: nextPayload, ids: [] });
      byPayload.get(key).ids.push(point.id);
      projected++;

      if (samples.length < 10) {
        samples.push({
          id: point.id,
          file_path: payload.file_path ?? payload.sourceRef ?? null,
          centroid,
          somRow: nextPayload.somRow,
          somCol: nextPayload.somCol,
          distance: Number(distance.toFixed(6)),
        });
      }

      if (LIMIT && projected >= LIMIT) break;
    }

    if (LIMIT && projected >= LIMIT) break;
    offset = data?.result?.next_page_offset;
    if (!offset) break;
  }

  if (APPLY) {
    for (const { payload, ids } of byPayload.values()) {
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, points: batch }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) written += batch.length;
        else failed += batch.length;
      }
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    scanned,
    missingSom,
    projected,
    written,
    failed,
    samples,
  };
  const reportPath = path.join(ROOT, '.tmp', 'qdrant-som-centroid-backfill-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ═════════════════════════════════════════');
  console.log(`  Scanned:     ${scanned}`);
  console.log(`  Missing SOM: ${missingSom}`);
  console.log(`  Projected:   ${projected}`);
  console.log(`  Written:     ${written}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Report:      ${reportPath}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Pass --apply to write Qdrant SOM payloads.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
