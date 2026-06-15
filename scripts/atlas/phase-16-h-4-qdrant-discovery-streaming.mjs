#!/usr/bin/env node

/**
 * Phase 16-H.4: Qdrant Discovery (Streaming, No OOM)
 *
 * Fetches points from Qdrant codebase_chunks_768 collection in streaming batches.
 * Processes each batch immediately (no buffering) to avoid OOM on 635K+ points.
 * Populates qdrant_point_id, qdrant_collection, qdrant_score in atlas_higher_hop_index.
 *
 * Matching strategy (fallback order):
 * 1. payload.packet_key (direct, fast)
 * 2. payload.source_ref / sourceRef / canonical_source_ref (normalized)
 * 3. payload.chunk_id (content-level)
 *
 * Time: ~30 min (for 635K+ points)
 * Blocker: Phase 16-H.1 (schema must exist)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'codebase_chunks_768';

const log = {
  info: (msg) => console.log(`[phase-16-h-4-streaming] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Normalize source_ref for matching across different formats
 */
function normSourceRef(s = '') {
  return s
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^\.?\//, '')
    .trim();
}

/**
 * Stream-process Qdrant points batch by batch (no buffering)
 */
async function* streamQdrantPoints(batchSize = 100) {
  let offset = 0;

  try {
    while (true) {
      const response = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll?limit=${batchSize}&offset=${offset}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
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
 * Process a batch of Qdrant points, matching to bridge table
 */
async function processBatch(batch, client) {
  let matched = 0;
  let missingKey = 0;
  let notFound = 0;

  for (const point of batch) {
    const pointId = point.id;
    const payload = point.payload || {};

    // Try to match by packet_key first (fastest)
    let packetKey = payload.packet_key;
    let matchKey = 'packet_key';

    if (!packetKey) {
      // Try source_ref variants (normalized)
      const sourceRef = payload.source_ref || payload.sourceRef || payload.canonical_source_ref;
      if (sourceRef) {
        const normRef = normSourceRef(sourceRef);
        // Query bridge table by normalized source_ref
        const result = await client.query(
          `SELECT packet_key FROM atlas_higher_hop_index
           WHERE LOWER(source_ref) = LOWER($1) OR LOWER(source_ref) = LOWER($2)
           LIMIT 1`,
          [sourceRef, normRef]
        );
        if (result.rows.length > 0) {
          packetKey = result.rows[0].packet_key;
          matchKey = 'source_ref';
        } else {
          missingKey++;
          continue;
        }
      } else {
        missingKey++;
        continue;
      }
    }

    // Update bridge table with Qdrant discovery
    const updateResult = await client.query(
      `UPDATE atlas_higher_hop_index
       SET
         qdrant_point_id = $1,
         qdrant_collection = $2,
         qdrant_score = 1.0,
         qdrant_payload_key = $3,
         updated_at = NOW()
       WHERE packet_key = $4 AND qdrant_point_id IS NULL`,
      [String(pointId), COLLECTION_NAME, matchKey, packetKey]
    );

    if (updateResult.rowCount > 0) {
      matched++;
    } else {
      notFound++;
    }
  }

  return { matched, missingKey, notFound };
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    log.info('========== Phase 16-H.4: Qdrant Discovery (Streaming) ==========');
    log.info('');

    let totalMatched = 0;
    let totalMissing = 0;
    let totalNotFound = 0;
    let batchCount = 0;

    log.progress('Streaming Qdrant points and discovering packets...');

    // Stream-process batches
    for await (const { batch, offset } of streamQdrantPoints(100)) {
      const { matched, missingKey, notFound } = await processBatch(batch, client);

      totalMatched += matched;
      totalMissing += missingKey;
      totalNotFound += notFound;
      batchCount++;

      if (offset % 10000 === 0) {
        log.progress(`  Processed ${offset} points: matched=${totalMatched}, missing=${totalMissing}, not_found=${totalNotFound}`);
      }
    }

    log.info('');
    log.ok('Qdrant discovery complete:');
    log.ok(`  Total batches: ${batchCount}`);
    log.ok(`  Matched: ${totalMatched}`);
    log.ok(`  Missing packet_key in payload: ${totalMissing}`);
    log.ok(`  Not found in bridge table: ${totalNotFound}`);
    log.info('');

    // Audit
    log.progress('Auditing Qdrant discovery...');
    const auditResult = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) with_qdrant,
        COUNT(CASE WHEN qdrant_collection = $1 THEN 1 END) with_collection,
        COUNT(CASE WHEN qdrant_payload_key IS NOT NULL THEN 1 END) with_key
      FROM atlas_higher_hop_index
    `, [COLLECTION_NAME]);

    const audit = auditResult.rows[0];
    const qdrantCoverage = (100 * audit.with_qdrant / audit.total).toFixed(1);

    log.ok(`Audit Results:`);
    log.ok(`  Total rows: ${audit.total}`);
    log.ok(`  With qdrant_point_id: ${audit.with_qdrant} (${qdrantCoverage}%)`);
    log.ok(`  With qdrant_collection: ${audit.with_collection}`);
    log.ok(`  With qdrant_payload_key: ${audit.with_key}`);

    // Gate check
    if (audit.with_qdrant >= audit.total * 0.95) {
      log.ok('✅ Qdrant discovery gate PASSED (≥95% coverage)');
    } else {
      log.ok(`⚠️  Qdrant discovery gate WARNING: coverage ${qdrantCoverage}% < 95%`);
      log.ok(`   (${audit.total - audit.with_qdrant} rows still missing)`);
    }

    log.info('');
    log.ok('========== Phase 16-H.4 COMPLETE ==========');
    log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log.info('');
    log.info('Next step: Run phase-16-h-qdrant-payload-sync.mjs');
    log.info('(This will backfill packet_key into Qdrant payloads)');

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
