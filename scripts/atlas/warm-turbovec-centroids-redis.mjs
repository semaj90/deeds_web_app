#!/usr/bin/env node
/**
 * scripts/atlas/warm-turbovec-centroids-redis.mjs
 *
 * 1. Warm/sync the Redis centroids (from `gpu:autoencoder:centroids_64`) to ensure they are formatted
 *    in both `cluster_<id>` and `<id>` numeric formats.
 * 2. Warm/sync `ace:cluster:<id>` mapping files from the `codebase_chunks_encoded64` Qdrant payloads.
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../sveltekit-frontend/.env') });

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';

const COLLECTION = 'codebase_chunks_encoded64';
const CENTROIDS_KEY = 'gpu:autoencoder:centroids_64';
const CLUSTER_PFX = 'ace:cluster:';
const SCROLL_BATCH = 500;

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

async function main() {
  console.log(`\n═══ Warming/Syncing Centroids in Redis ═══`);
  console.log(`Redis: ${REDIS_URL}`);
  
  const redis = new Redis(REDIS_URL, { password: REDIS_PASS || undefined });
  try {
    const ping = await redis.ping();
    console.log(`✓ Connected to Redis (${ping})`);

    // 1. Check/warm centroids_64 format
    const rawCentroids = await redis.hgetall(CENTROIDS_KEY).catch(() => ({}));
    const keys = Object.keys(rawCentroids);
    console.log(`Found ${keys.length} fields in key "${CENTROIDS_KEY}"`);

    const updateFields = {};
    for (const [field, csv] of Object.entries(rawCentroids)) {
      if (field.startsWith('cluster_')) {
        const id = field.replace('cluster_', '');
        if (!rawCentroids[id]) {
          updateFields[id] = csv;
        }
      } else {
        const altField = `cluster_${field}`;
        if (!rawCentroids[altField]) {
          updateFields[altField] = csv;
        }
      }
    }

    const updatesCount = Object.keys(updateFields).length;
    if (updatesCount > 0) {
      await redis.hset(CENTROIDS_KEY, updateFields);
      console.log(`✓ Synchronized/added ${updatesCount} missing centroid fields in "${CENTROIDS_KEY}"`);
    } else {
      console.log(`✓ All centroid fields are already synchronized in both formats.`);
    }

    // 2. Warm `ace:cluster:<id>` from Qdrant if they are missing
    const existingClusters = await redis.keys(`${CLUSTER_PFX}*`);
    console.log(`Redis has ${existingClusters.length} "${CLUSTER_PFX}*" keys.`);

    // Always fetch from Qdrant codebase_chunks_encoded64 to build mapping
    console.log(`Scanning Qdrant collection "${COLLECTION}" for cluster mappings...`);
    const clusterFiles = {};
    let offset = null;
    let pointCount = 0;

    while (true) {
      const res = await qdrantCall(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, 'POST', {
        limit: SCROLL_BATCH,
        offset,
        with_payload: true,
        with_vector: false
      }).catch(() => null);

      if (!res) {
        console.warn(`⚠️ Collection "${COLLECTION}" not found/unreachable. Skipping cluster mapping warm.`);
        break;
      }

      const pts = res.result?.points ?? [];
      if (pts.length === 0) break;
      offset = res.result?.next_page_offset ?? null;

      for (const pt of pts) {
        pointCount++;
        const clusterId = pt.payload?.som_cluster ?? pt.payload?.community_id;
        if (clusterId !== undefined && clusterId !== null) {
          const filePath = pt.payload?.file_path ?? pt.payload?.path ?? pt.payload?.relative_path;
          if (filePath) {
            if (!clusterFiles[clusterId]) {
              clusterFiles[clusterId] = new Set();
            }
            clusterFiles[clusterId].add(filePath);
          }
        }
      }
      if (!offset) break;
    }

    const mappedClusterIds = Object.keys(clusterFiles);
    if (mappedClusterIds.length > 0) {
      console.log(`Found ${pointCount} points mapping to ${mappedClusterIds.length} unique clusters in Qdrant.`);
      const pipeline = redis.pipeline();
      for (const cid of mappedClusterIds) {
        const card = {
          clusterId: parseInt(cid, 10),
          files: Array.from(clusterFiles[cid])
        };
        pipeline.set(`${CLUSTER_PFX}${cid}`, JSON.stringify(card));
      }
      await pipeline.exec();
      console.log(`✓ Wrote ${mappedClusterIds.length} cluster mapping cards to Redis ("${CLUSTER_PFX}*").`);
    } else {
      console.log(`⚠️ No points with som_cluster/community_id found in Qdrant "${COLLECTION}".`);
    }

  } catch (err) {
    console.error(`❌ Redis operations failed:`, err.message);
  } finally {
    redis.disconnect();
  }
  console.log(`✅ Centroids warming complete.`);
}

main().catch(err => {
  console.error(`Fatal:`, err);
  process.exit(1);
});
