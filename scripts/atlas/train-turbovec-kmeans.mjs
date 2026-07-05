#!/usr/bin/env node
/**
 * scripts/atlas/train-turbovec-kmeans.mjs
 *
 * 1. Scrolls all points from `codebase_chunks_encoded64` (64-dim).
 * 2. Performs spherical k-means clustering (k=50) on the 64d vectors.
 * 3. Writes centroids to Redis key `gpu:autoencoder:centroids_64` (under both string ID and cluster_ prefix ID).
 * 4. Writes cluster file mappings to Redis keys `ace:cluster:{id}`.
 * 5. Updates Qdrant payloads in `codebase_chunks_encoded64` with the assigned `som_cluster` and `community_id`.
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { frontendRoot: FRONTEND_ROOT } = resolveAtlasPaths(import.meta.url);
dotenv.config({ path: path.resolve(FRONTEND_ROOT, '.env') });
dotenv.config({ path: path.resolve(FRONTEND_ROOT, '.env.local'), override: true });

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';

const COLLECTION = 'codebase_chunks_encoded64';
const CENTROIDS_KEY = 'gpu:autoencoder:centroids_64';
const CLUSTER_PFX = 'ace:cluster:';
const SCROLL_BATCH = 500;
const UPDATE_BATCH = 200;

// Parse k
const kArg = process.argv.find(a => a.startsWith('--k='));
const K = kArg ? parseInt(kArg.split('=')[1], 10) : 50;

async function qdrantCall(url, method = 'GET', body = null) {
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Qdrant ${method} ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function kMeans(vectors, k, maxIters = 30) {
  console.log(`Running spherical k-means (k=${k}, maxIters=${maxIters}) on ${vectors.length} vectors...`);
  
  // 1. Initialise centroids
  const centroids = [];
  const indices = new Set();
  while (centroids.length < k && indices.size < vectors.length) {
    const idx = Math.floor(Math.random() * vectors.length);
    if (!indices.has(idx)) {
      indices.add(idx);
      centroids.push(Array.from(vectors[idx].vector));
    }
  }

  const dim = vectors[0].vector.length;
  const assignments = new Int32Array(vectors.length);

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = 0;
    
    // 2. Assign
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i].vector;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += v[d] * centroids[c][d];
        const dist = 1 - dot;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        assignments[i] = bestIdx;
        changed++;
      }
    }

    console.log(`  Iter ${iter + 1}/${maxIters} | changed: ${changed}`);
    if (changed === 0) break;

    // 3. Recompute
    const newCentroids = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < vectors.length; i++) {
      const c = assignments[i];
      const v = vectors[i].vector;
      for (let d = 0; d < dim; d++) newCentroids[c][d] += v[d];
      counts[c]++;
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) newCentroids[c][d] /= counts[c];
        let norm = 0;
        for (let d = 0; d < dim; d++) norm += newCentroids[c][d] * newCentroids[c][d];
        norm = Math.sqrt(norm) || 1e-12;
        for (let d = 0; d < dim; d++) newCentroids[c][d] /= norm;
        centroids[c] = Array.from(newCentroids[c]);
      }
    }
  }

  return { centroids, assignments };
}

async function main() {
  console.log(`\n═══ Training TurboVec KMeans (k=${K}) ═══`);
  console.log(`Qdrant: ${QDRANT_URL}/${COLLECTION}`);

  // Fetch all vectors from Qdrant
  console.log(`Scrolling vectors from Qdrant...`);
  const points = [];
  let offset = null;
  while (true) {
    const res = await qdrantCall(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, 'POST', {
      limit: SCROLL_BATCH,
      offset,
      with_payload: true,
      with_vector: true
    });
    const pts = res.result?.points ?? [];
    if (pts.length === 0) break;
    offset = res.result?.next_page_offset ?? null;

    for (const pt of pts) {
      if (Array.isArray(pt.vector) && pt.vector.length === 64) {
        points.push({
          id: pt.id,
          vector: pt.vector,
          payload: pt.payload ?? {}
        });
      }
    }
    if (!offset) break;
  }

  console.log(`Loaded ${points.length} 64d vectors from Qdrant.`);
  if (points.length < K) {
    console.error(`❌ Too few points (${points.length}) to cluster into k=${K} groups.`);
    process.exit(1);
  }

  const { centroids, assignments } = kMeans(points, K);

  // Group files by cluster to populate ace:cluster:*
  const clusterFiles = Array.from({ length: K }, () => new Set());
  for (let i = 0; i < points.length; i++) {
    const clusterId = assignments[i];
    const payload = points[i].payload;
    const filePath = payload.file_path ?? payload.path ?? payload.relative_path;
    if (filePath) {
      clusterFiles[clusterId].add(filePath);
    }
  }

  // Connect to Redis
  console.log(`Redis: ${REDIS_URL}`);
  const redis = new Redis(REDIS_URL, { password: REDIS_PASS || undefined });
  try {
    const ping = await redis.ping();
    console.log(`✓ Connected to Redis (${ping})`);

    // Prepare centroid hash fields
    const hashFields = {};
    for (let c = 0; c < K; c++) {
      const csv = centroids[c].join(',');
      hashFields[String(c)] = csv;            // sidecar parses Number(idStr)
      hashFields[`cluster_${c}`] = csv;       // backward compatibility
    }

    await redis.hset(CENTROIDS_KEY, hashFields);
    console.log(`✓ Wrote ${K} centroids to Redis key "${CENTROIDS_KEY}"`);

    // Write cluster files mapping cards
    const pipeline = redis.pipeline();
    for (let c = 0; c < K; c++) {
      const card = {
        clusterId: c,
        files: Array.from(clusterFiles[c])
      };
      pipeline.set(`${CLUSTER_PFX}${c}`, JSON.stringify(card));
    }
    await pipeline.exec();
    console.log(`✓ Wrote ${K} cluster mapping cards to Redis ("${CLUSTER_PFX}*")`);

  } catch (err) {
    console.error(`❌ Redis operations failed:`, err.message);
  } finally {
    redis.disconnect();
  }

  // Update Qdrant payloads with assigned clusters
  console.log(`\nUpdating Qdrant payloads with assignments...`);
  let updatePoints = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const cid = assignments[i];
    
    updatePoints.push({
      id: pt.id,
      vector: pt.vector,
      payload: {
        ...pt.payload,
        som_cluster: cid,
        community_id: cid
      }
    });

    if (updatePoints.length >= UPDATE_BATCH) {
      await qdrantCall(`${QDRANT_URL}/collections/${COLLECTION}/points`, 'PUT', {
        points: updatePoints
      });
      updatePoints = [];
      console.log(`  Updated ${i + 1}/${points.length} points...`);
    }
  }

  if (updatePoints.length > 0) {
    await qdrantCall(`${QDRANT_URL}/collections/${COLLECTION}/points`, 'PUT', {
      points: updatePoints
    });
    console.log(`  Updated ${points.length}/${points.length} points.`);
  }

  console.log(`\n✅ KMeans training & Redis cache warming complete!`);
}

main().catch(err => {
  console.error(`Fatal:`, err);
  process.exit(1);
});
