#!/usr/bin/env node

/**
 * Phase 16-H.5: Qdrant Payload Canonicalization
 *
 * CRITICAL: Ensures all Qdrant points have canonical identity fields
 * in their payloads: packet_key, source_ref, feature_id, file_path,
 * community_id, som_cluster, lineage_version
 *
 * This enables: Qdrant query response contains full packet identity
 * without extra Postgres lookup.
 *
 * Time: ~30 min
 * Blocker: Phase 16-H.4 (must know qdrant_point_id first)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'codebase_chunks_768';

const log = {
  info: (msg) => console.log(`[phase-16-h-5] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Stream-process Qdrant points batch by batch (no buffering)
 * Returns an async generator that yields batches
 * Note: Use with_vectors: true to include vectors in response
 */
async function* streamQdrantPoints(batchSize = 100) {
  let offset = 0;

  try {
    while (true) {
      const response = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll?limit=${batchSize}&offset=${offset}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ with_vectors: true })
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant fetch failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const batch = data.result?.points || [];

      if (batch.length === 0) break;

      offset += batch.length;
      yield { batch, offset };

      if (offset % 5000 === 0) {
        log.progress(`  Fetched ${offset} points...`);
      }
    }

    log.ok(`Fetched all ${offset} points`);

  } catch (err) {
    log.error(`Failed to fetch Qdrant points: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Canonicalize a single batch of points (no buffering)
 */
async function canonicalizeBatch(batch, client) {
  const updatedPoints = [];
  let missingPacketKey = 0;
  let notFoundInBridge = 0;

  for (const point of batch) {
    const pointId = point.id;
    const existingPayload = point.payload || {};

    // Get packet_key from existing payload or bridge table
    let packetKey = existingPayload.packet_key;

    if (!packetKey) {
      // Try to find from qdrant_point_id in bridge table
      const bridgeResult = await client.query(
        `SELECT packet_key FROM atlas_higher_hop_index WHERE qdrant_point_id = $1 LIMIT 1`,
        [String(pointId)]
      );

      if (bridgeResult.rows.length > 0) {
        packetKey = bridgeResult.rows[0].packet_key;
      } else {
        missingPacketKey++;
        continue;
      }
    }

    // Fetch full packet info from bridge table
    const bridgeResult = await client.query(
      `SELECT
        packet_key, source_ref, feature_id, file_path, community_id,
        som_cluster, lineage_version
       FROM atlas_higher_hop_index
       WHERE packet_key = $1`,
      [packetKey]
    );

    if (bridgeResult.rows.length === 0) {
      notFoundInBridge++;
      continue;
    }

    const bridgeRow = bridgeResult.rows[0];

    // Build canonical payload
    const canonicalPayload = {
      // Identity spine (canonical)
      packet_key: bridgeRow.packet_key,
      source_ref: bridgeRow.source_ref,
      feature_id: bridgeRow.feature_id,
      file_path: bridgeRow.file_path,
      community_id: bridgeRow.community_id,

      // Topology
      som_cluster: bridgeRow.som_cluster,
      lineage_version: bridgeRow.lineage_version || 1,

      // Preserve existing fields
      ...existingPayload,
    };

    updatedPoints.push({
      id: pointId,
      vector: point.vector,
      payload: canonicalPayload,
    });
  }

  return { updatedPoints, missingPacketKey, notFoundInBridge };
}

/**
 * Upsert a batch of canonicalized payloads back to Qdrant
 */
async function upsertBatch(batch, batchIndex) {
  const response = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: batch }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Batch ${batchIndex} upsert failed. First point:`, JSON.stringify(batch[0], null, 2));
    console.error(`Response: ${errorText}`);
    throw new Error(`Qdrant upsert failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return batch.length;
}

/**
 * Verify canonical payloads
 */
async function verifyCanonical(originalCount) {
  log.progress('Verifying canonical payloads...');

  // Sample a few points to verify
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points?limit=10&offset=0`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Verification failed: ${response.statusText}`);
    }

    const data = await response.json();
    const samplePoints = data.result?.points || [];

    let packetKeyCoverage = 0;
    let featureIdCoverage = 0;
    let somClusterCoverage = 0;

    for (const point of samplePoints) {
      if (point.payload?.packet_key) packetKeyCoverage++;
      if (point.payload?.feature_id) featureIdCoverage++;
      if (point.payload?.som_cluster !== undefined && point.payload?.som_cluster !== null) {
        somClusterCoverage++;
      }
    }

    log.ok(`Verification (sample of ${samplePoints.length}):`);
    log.ok(`  packet_key: ${packetKeyCoverage}/${samplePoints.length}`);
    log.ok(`  feature_id: ${featureIdCoverage}/${samplePoints.length}`);
    log.ok(`  som_cluster: ${somClusterCoverage}/${samplePoints.length} (pending SOM training)`);

    return true;

  } catch (err) {
    log.error(`Verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Main execution — stream-process batches to avoid OOM
 */
async function main() {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    log.info('========== Phase 16-H.5: Qdrant Payload Canonicalization (Streaming) ==========');
    log.info('');

    let totalProcessed = 0;
    let totalMissing = 0;
    let totalNotFound = 0;
    let totalUpserted = 0;
    let batchIndex = 0;

    // Stream process: fetch batch → canonicalize → upsert → repeat
    log.progress('Fetching and canonicalizing Qdrant payloads in streaming mode...');
    for await (const { batch, offset } of streamQdrantPoints(100)) {
      // Canonicalize this batch
      const { updatedPoints, missingPacketKey, notFoundInBridge } = await canonicalizeBatch(batch, client);

      totalProcessed += batch.length;
      totalMissing += missingPacketKey;
      totalNotFound += notFoundInBridge;

      // Upsert this batch immediately (don't buffer)
      if (updatedPoints.length > 0) {
        await upsertBatch(updatedPoints, batchIndex);
        totalUpserted += updatedPoints.length;
      }

      batchIndex++;

      if (offset % 50000 === 0) {
        log.progress(`  Processed ${totalProcessed}, canonicalized ${totalUpserted}, missing ${totalMissing}...`);
      }
    }

    log.info('');
    log.ok('Canonicalization complete');
    log.ok(`  Total processed: ${totalProcessed}`);
    log.ok(`  Upserted: ${totalUpserted}`);
    log.ok(`  Missing packet_key: ${totalMissing}`);
    log.ok(`  Not found in bridge: ${totalNotFound}`);
    log.info('');

    // Step 4: Verify
    await verifyCanonical(totalProcessed);
    log.info('');

    log.ok('========== Phase 16-H.5 COMPLETE ==========');
    log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log.info(`Points processed: ${totalProcessed}`);
    log.info(`Upserted: ${totalUpserted}`);

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
