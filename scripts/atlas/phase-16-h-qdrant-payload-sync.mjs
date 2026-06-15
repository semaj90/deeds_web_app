#!/usr/bin/env node
// Run with: node --max-old-space-size=512 scripts/atlas/phase-16-h-qdrant-payload-sync.mjs

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
 * Hard rule: uses set-payload (PATCH) — NOT vector upsert (PUT).
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
const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getArg = (name) => {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (match) return match.split('=').slice(1).join('=');
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return null;
};
const DRY_RUN = hasFlag('--dry-run') || process.env.H5_DRY_RUN === '1';
const LIMIT = parseInt(getArg('limit') || process.env.H5_LIMIT || '0', 10);
const BATCH_SIZE = parseInt(getArg('batch') || process.env.H5_BATCH_SIZE || '100', 10);

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
  // Cursor-based pagination via next_page_offset — avoids numeric offset drift.
  // with_vectors: false is mandatory — 639K × 768-dim floats = OOM.
  let nextOffset = null;
  let total = 0;

  try {
    while (true) {
      const body = {
        limit: batchSize,
        with_payload: true,
        with_vectors: false,
      };
      if (nextOffset !== null) body.offset = nextOffset;

      const response = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant scroll failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const batch = data.result?.points || [];
      nextOffset = data.result?.next_page_offset ?? null;

      if (batch.length === 0) break;

      total += batch.length;
      yield { batch, total };

      if (total % 5000 === 0) {
        log.progress(`  Scrolled ${total} points...`);
      }

      if (nextOffset === null) break;
    }

    log.ok(`Scrolled all ${total} points`);

  } catch (err) {
    log.error(`Failed to scroll Qdrant points: ${err.message}`);
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
      payload: canonicalPayload,  // no vector — set-payload only
    });
  }

  return { updatedPoints, missingPacketKey, notFoundInBridge };
}

/**
 * Patch payloads for a batch of points using Qdrant set-payload.
 * Hard rule: this is a PATCH, NOT a vector upsert (PUT /points).
 * Vectors are never touched — only payload fields are written.
 */
async function setPayloadBatch(batch, batchIndex) {
  // set-payload accepts: { payload: {...}, points: [id, ...] }
  // Group points that share the exact same canonical payload to minimize requests.
  // In practice each point has unique source_ref so we do one call per point in a
  // per-batch single-request using the `points` filter form.
  for (const point of batch) {
    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/payload?wait=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: point.payload,
          points: [point.id],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`set-payload failed (batch ${batchIndex}, point ${point.id}): ${response.status} — ${errorText}`);
    }
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
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, with_payload: true, with_vectors: false }),
      }
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

    // Stream process: scroll batch → canonicalize → set-payload → repeat (no buffering)
    log.progress('Streaming Qdrant points and patching payloads (no vector re-upsert)...');
    for await (const { batch, total } of streamQdrantPoints(BATCH_SIZE)) {
      const effectiveBatch = LIMIT > 0
        ? batch.slice(0, Math.max(LIMIT - total + batch.length, 0))
        : batch;
      if (effectiveBatch.length === 0) break;
      const { updatedPoints, missingPacketKey, notFoundInBridge } = await canonicalizeBatch(effectiveBatch, client);

      totalProcessed += effectiveBatch.length;
      totalMissing += missingPacketKey;
      totalNotFound += notFoundInBridge;

      // Patch payloads only — hard rule: no vector upsert
      if (updatedPoints.length > 0 && !DRY_RUN) {
        await setPayloadBatch(updatedPoints, batchIndex);
        totalUpserted += updatedPoints.length;
      } else if (updatedPoints.length > 0) {
        totalUpserted += updatedPoints.length;
      }

      batchIndex++;

      if (total % 50000 === 0) {
        log.progress(`  Processed ${totalProcessed}, patched ${totalUpserted}, missing ${totalMissing}...`);
      }

      if (LIMIT > 0 && totalProcessed >= LIMIT) {
        log.info(`Limit reached: ${totalProcessed}/${LIMIT}`);
        break;
      }
    }

    log.info('');
    log.ok('Canonicalization complete');
    log.ok(`  Total processed: ${totalProcessed}`);
    log.ok(`  Upserted: ${totalUpserted}${DRY_RUN ? ' (dry-run)' : ''}`);
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
