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

const COLLECTIONS = String(process.env.TURBOVEC_CLUSTER_COLLECTIONS || 'codebase_chunks_encoded64,codebase_chunks_768')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CENTROIDS_KEY = 'gpu:autoencoder:centroids_64';
const CLUSTER_PFX = 'ace:cluster:';
const CENTROID_PFX = 'centroid:';
const SOM_PFX = 'som:';
const SCROLL_BATCH = 500;
const MAX_POINTS = Number(process.env.TURBOVEC_CLUSTER_WARM_LIMIT || 5000);

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

    // 2. Warm `ace:cluster:<id>`, `centroid:<id>`, and `som:<id>` from Qdrant if they are missing
    const existingClusters = await redis.keys(`${CLUSTER_PFX}*`);
    console.log(`Redis has ${existingClusters.length} "${CLUSTER_PFX}*" keys.`);

    const clusterFiles = {};
    const somFiles = {};
    let activeCollection = null;
    let pointCount = 0;

    for (const collection of COLLECTIONS) {
      console.log(`Scanning Qdrant collection "${collection}" for cluster mappings...`);
      let offset = null;
      let collectionPointCount = 0;
      while (pointCount < MAX_POINTS) {
        const res = await qdrantCall(`${QDRANT_URL}/collections/${collection}/points/scroll`, 'POST', {
          limit: SCROLL_BATCH,
          offset,
          with_payload: true,
          with_vector: false
        }).catch(() => null);

        if (!res) {
          console.warn(`⚠️ Collection "${collection}" not found/unreachable. Trying next candidate.`);
          break;
        }

        const pts = res.result?.points ?? [];
        if (pts.length === 0) break;
        activeCollection = collection;
        collectionPointCount += pts.length;
        offset = res.result?.next_page_offset ?? null;

        for (const pt of pts) {
          pointCount++;
          const payload = pt.payload ?? {};
          const communityId = payload.community_id ?? payload.communityId ?? payload.cluster_id ?? payload.clusterId ?? 0;
          const somId = payload.som_cluster ?? payload.somCluster ?? payload.som_index ?? payload.somIndex ?? communityId;
          const filePath = payload.file_path ?? payload.path ?? payload.relative_path ?? payload.source_ref ?? payload.sourceRef ?? payload.canonical_source_ref;
          const packetKey = payload.packet_key ?? payload.packetKey ?? String(pt.id ?? '');
          const featureId = payload.feature_id ?? payload.featureId ?? null;
          if (filePath || packetKey) {
            if (!clusterFiles[communityId]) clusterFiles[communityId] = new Set();
            clusterFiles[communityId].add(JSON.stringify({ filePath, packetKey, featureId }));
            if (somId !== undefined && somId !== null) {
              if (!somFiles[somId]) somFiles[somId] = new Set();
              somFiles[somId].add(JSON.stringify({ filePath, packetKey, featureId }));
            }
          }
        }
        if (!offset) break;
      }
      if (collectionPointCount > 0) break;
    }

    const mappedClusterIds = Object.keys(clusterFiles);
    if (mappedClusterIds.length > 0) {
      console.log(`Found ${pointCount} points from "${activeCollection}" mapping to ${mappedClusterIds.length} unique clusters in Qdrant.`);
      const pipeline = redis.pipeline();
      for (const cid of mappedClusterIds) {
        const rows = Array.from(clusterFiles[cid]).map((value) => JSON.parse(value));
        const card = {
          clusterId: parseInt(cid, 10),
          source: activeCollection,
          rows,
          files: rows.map((row) => row.filePath).filter(Boolean),
          packet_keys: rows.map((row) => row.packetKey).filter(Boolean),
          feature_ids: [...new Set(rows.map((row) => row.featureId).filter(Boolean))],
          updated_at: new Date().toISOString()
        };
        pipeline.set(`${CLUSTER_PFX}${cid}`, JSON.stringify(card));
        pipeline.set(`${CENTROID_PFX}${cid}`, JSON.stringify(card));
      }
      for (const sid of Object.keys(somFiles)) {
        const rows = Array.from(somFiles[sid]).map((value) => JSON.parse(value));
        pipeline.set(`${SOM_PFX}${sid}`, JSON.stringify({
          somCluster: sid,
          source: activeCollection,
          rows,
          files: rows.map((row) => row.filePath).filter(Boolean),
          packet_keys: rows.map((row) => row.packetKey).filter(Boolean),
          feature_ids: [...new Set(rows.map((row) => row.featureId).filter(Boolean))],
          updated_at: new Date().toISOString()
        }));
      }
      await pipeline.exec();
      console.log(`✓ Wrote ${mappedClusterIds.length} cluster/centroid mapping cards and ${Object.keys(somFiles).length} SOM cards to Redis.`);
    } else {
      console.log(`⚠️ No points with source_ref/packet_key cluster metadata found in Qdrant collections: ${COLLECTIONS.join(', ')}.`);
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
