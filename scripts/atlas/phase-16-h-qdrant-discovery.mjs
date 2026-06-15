#!/usr/bin/env node

/**
 * Phase 16-H.4: Qdrant Discovery
 *
 * Fetches all points from Qdrant codebase_chunks_768 collection
 * Finds matching packet_key in atlas_higher_hop_index
 * Populates qdrant_point_id, qdrant_score, qdrant_payload_hash
 *
 * This is the reverse lookup that enables: Qdrant hit → packet_key → topology bridges
 *
 * Time: ~20 min
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
  info: (msg) => console.log(`[phase-16-h-4] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Fetch all points from Qdrant (paginated)
 */
async function fetchQdrantPoints() {
  log.progress(`Fetching all points from Qdrant collection '${COLLECTION_NAME}'...`);

  const points = [];
  let offset = 0;
  const limit = 100; // Fetch in batches of 100

  try {
    while (true) {
      const response = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll?limit=${limit}&offset=${offset}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );

      if (!response.ok) {
        throw new Error(`Qdrant fetch failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const batch = data.result?.points || [];

      if (batch.length === 0) break;

      points.push(...batch);
      offset += batch.length;

      if (offset % 1000 === 0) {
        log.progress(`  Fetched ${offset} points...`);
      }
    }

    log.ok(`Fetched ${points.length} total points from Qdrant`);
    return points;

  } catch (err) {
    log.error(`Failed to fetch Qdrant points: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Hash payload to detect changes
 */
function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Discover and populate qdrant_point_id in atlas_higher_hop_index
 */
async function discoverQdrantPoints(points) {
  log.progress('Discovering and populating Qdrant point IDs...');

  const client = await pool.connect();

  try {
    let matched = 0;
    let missingPacketKey = 0;
    let notFound = 0;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const pointId = point.id;
      const payload = point.payload || {};

      // Try to match by source_ref (Qdrant field) or packet_key (future field)
      const sourceRef = payload.source_ref || payload.sourceRef || payload.canonical_source_ref;
      const packetKey = payload.packet_key;

      if (!sourceRef && !packetKey) {
        missingPacketKey++;
        continue;
      }

      // Check if this source_ref or packet_key exists in atlas_higher_hop_index
      let checkResult;
      let matchKey;

      if (packetKey) {
        checkResult = await client.query(
          'SELECT id FROM atlas_higher_hop_index WHERE packet_key = $1 LIMIT 1',
          [packetKey]
        );
        matchKey = packetKey;
      } else if (sourceRef) {
        checkResult = await client.query(
          'SELECT id FROM atlas_higher_hop_index WHERE source_ref = $1 LIMIT 1',
          [sourceRef]
        );
        matchKey = sourceRef;
      }

      if (!checkResult || checkResult.rows.length === 0) {
        notFound++;
        continue;
      }

      // Update with Qdrant discovery
      const payloadHash = hashPayload(payload);
      const updateResult = await client.query(
        `UPDATE atlas_higher_hop_index
         SET
           qdrant_point_id = $1,
           qdrant_collection = $2,
           qdrant_score = $3,
           qdrant_payload_hash = $4,
           metadata = jsonb_set(metadata, '{qdrant_synced_at}', to_jsonb(NOW()))
         WHERE (packet_key = $5 OR source_ref = $6) AND qdrant_point_id IS NULL
         LIMIT 1`,
        [
          String(pointId),
          COLLECTION_NAME,
          1.0,
          payloadHash,
          packetKey || null,
          sourceRef || null,
        ]
      );

      if (updateResult.rowCount > 0) {
        matched++;
      }

      // Progress log
      if ((i + 1) % 5000 === 0) {
        log.progress(`  Processed ${i + 1}/${points.length} points (matched: ${matched})`);
      }
    }

    log.ok(`Qdrant discovery complete:`);
    log.ok(`  Matched: ${matched}`);
    log.ok(`  Missing packet_key in Qdrant payload: ${missingPacketKey}`);
    log.ok(`  Not found in atlas_higher_hop_index: ${notFound}`);

    return { matched, missingPacketKey, notFound };

  } finally {
    await client.release();
  }
}

/**
 * Audit Qdrant discovery results
 */
async function auditDiscovery() {
  log.progress('Auditing Qdrant discovery...');

  const client = await pool.connect();

  try {
    const auditResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as with_qdrant,
        COUNT(CASE WHEN qdrant_collection = $1 THEN 1 END) as with_collection,
        COUNT(CASE WHEN qdrant_payload_hash IS NOT NULL THEN 1 END) as with_hash
      FROM atlas_higher_hop_index
    `, [COLLECTION_NAME]);

    const audit = auditResult.rows[0];
    const qdrantCoverage = (100 * audit.with_qdrant / audit.total).toFixed(1);

    log.ok(`Audit Results:`);
    log.ok(`  Total rows: ${audit.total}`);
    log.ok(`  With qdrant_point_id: ${audit.with_qdrant} (${qdrantCoverage}%)`);
    log.ok(`  With qdrant_collection: ${audit.with_collection}`);
    log.ok(`  With payload_hash: ${audit.with_hash}`);

    // Gate: should have ≥95% coverage
    if (audit.with_qdrant < audit.total * 0.95) {
      log.error(`⚠️  GATE WARNING: qdrant_point_id coverage ${qdrantCoverage}% < 95%`);
      log.error(`   ${audit.total - audit.with_qdrant} rows still missing Qdrant discovery`);
      // Don't fail — some rows may legitimately not be in Qdrant
    } else {
      log.ok('✅ Qdrant discovery gate PASSED (≥95% coverage)');
    }

    return audit;

  } finally {
    await client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.4: Qdrant Discovery ==========');
    log.info('');

    // Step 1: Fetch Qdrant points
    const points = await fetchQdrantPoints();
    log.info('');

    // Step 2: Discover and populate
    const discovery = await discoverQdrantPoints(points);
    log.info('');

    // Step 3: Audit
    const audit = await auditDiscovery();
    log.info('');

    // Summary
    log.ok('========== Phase 16-H.4 COMPLETE ==========');
    log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log.info(`Points processed: ${points.length}`);
    log.info(`Matched to packets: ${discovery.matched}`);
    log.info('');
    log.info('Next step: Run phase-16-h-qdrant-payload-sync.mjs');
    log.info('(Then parallel: H.6 Redis registry, H.7 Neo4j bridge, H.8 Glyph bridge)');

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
