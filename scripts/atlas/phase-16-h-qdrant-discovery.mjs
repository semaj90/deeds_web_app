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
 * --report-ambiguous: classify the 763 unmatched rows (no qdrant_point_id)
 * into identity lanes without writing any data.
 *
 * Disambiguation chain (applied in priority order):
 *   1. source_ref LIKE '%#%'        → mcp_tool_stub
 *   2. packet_key LIKE '%:%'        → schema_stub  (file-level ref, not a chunk)
 *   3. chunk_id IS NOT NULL         → ambiguous_qdrant_collision (should have matched but didn't)
 *   4. content_hash IS NOT NULL     → ambiguous_qdrant_collision (has content but no Qdrant hit)
 *   5. fallthrough                  → not_indexed_in_qdrant
 *
 * Prints a summary table and, with --verbose, the first 20 rows per category.
 * Never writes to the database.
 */
async function reportAmbiguous(verbose = false) {
  log.info('========== Phase 16-H: Ambiguous Row Classification ==========');
  log.info('Mode: read-only. No data will be written.');
  log.info('');

  const client = await pool.connect();

  try {
    // Overall unmatched count
    const { rows: [totals] } = await client.query(`
      SELECT
        COUNT(*) AS total_rows,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) AS matched,
        COUNT(CASE WHEN qdrant_point_id IS NULL THEN 1 END) AS unmatched
      FROM atlas_higher_hop_index
    `);

    log.info(`Total rows in atlas_higher_hop_index: ${totals.total_rows}`);
    log.info(`  Matched (qdrant_point_id set): ${totals.matched}`);
    log.info(`  Unmatched (needs classification): ${totals.unmatched}`);
    log.info('');

    // Classify by disambiguation chain
    const { rows: classified } = await client.query(`
      SELECT
        CASE
          WHEN source_ref LIKE '%#%'  THEN 'mcp_tool_stub'
          WHEN packet_key LIKE '%:%'  THEN 'schema_stub'
          WHEN chunk_id IS NOT NULL   THEN 'ambiguous_qdrant_collision'
          WHEN content_hash IS NOT NULL THEN 'ambiguous_qdrant_collision'
          ELSE 'not_indexed_in_qdrant'
        END AS identity_lane,
        COUNT(*) AS count
      FROM atlas_higher_hop_index
      WHERE qdrant_point_id IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
    `);

    log.ok('Classification results:');
    for (const row of classified) {
      const pct = ((100 * Number(row.count)) / Number(totals.unmatched)).toFixed(1);
      const icon = row.identity_lane === 'mcp_tool_stub' ? '🔧'
        : row.identity_lane === 'schema_stub' ? '📄'
        : row.identity_lane === 'ambiguous_qdrant_collision' ? '⚠️'
        : '❓';
      console.log(`  ${icon}  ${row.identity_lane.padEnd(30)} ${String(row.count).padStart(5)}  (${pct}%)`);
    }
    log.info('');

    // Verify: are there any true ambiguous_qdrant_collision rows?
    const ambiguousCount = classified.find(r => r.identity_lane === 'ambiguous_qdrant_collision')?.count ?? 0;
    if (Number(ambiguousCount) === 0) {
      log.ok('✅ No ambiguous_qdrant_collision rows — all unmatched rows are clean identity lanes.');
    } else {
      log.error(`⚠️  ${ambiguousCount} rows have chunk_id or content_hash but no Qdrant match.`);
      log.error('   These need investigation before the identity spine can be closed.');
    }
    log.info('');

    // Verbose: print samples for each category
    if (verbose) {
      for (const row of classified) {
        log.info(`--- ${row.identity_lane} (first 20 samples) ---`);
        const { rows: samples } = await client.query(`
          SELECT source_ref, packet_key, chunk_id, content_hash
          FROM atlas_higher_hop_index
          WHERE qdrant_point_id IS NULL
            AND CASE
              WHEN source_ref LIKE '%#%'    THEN 'mcp_tool_stub'
              WHEN packet_key LIKE '%:%'    THEN 'schema_stub'
              WHEN chunk_id IS NOT NULL     THEN 'ambiguous_qdrant_collision'
              WHEN content_hash IS NOT NULL THEN 'ambiguous_qdrant_collision'
              ELSE 'not_indexed_in_qdrant'
            END = $1
          ORDER BY source_ref
          LIMIT 20
        `, [row.identity_lane]);
        for (const s of samples) {
          console.log(`    source_ref: ${s.source_ref}`);
          if (s.chunk_id) console.log(`    chunk_id:   ${s.chunk_id}`);
          if (s.content_hash) console.log(`    hash:       ${s.content_hash}`);
          console.log('');
        }
      }
    }

    // Identity lane recommendation
    log.info('Recommended identity_lane assignments:');
    log.info('  mcp_tool_stub            → identity_lane = "mcp_tool_stub", identity_confidence = 0.75');
    log.info('  schema_stub              → identity_lane = "qdrant_chunk" (pending indexing), confidence = 0.50');
    log.info('  ambiguous_qdrant_collision → investigate before assigning');
    log.info('  not_indexed_in_qdrant    → identity_lane = "qdrant_chunk" (not yet indexed), confidence = 0.30');
    log.info('');
    log.info('Run with --apply to write identity_lane to atlas_higher_hop_index (future flag, not yet implemented).');

  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const reportAmbiguousMode = args.includes('--report-ambiguous');
  const verbose = args.includes('--verbose');

  const startTime = Date.now();

  try {
    if (reportAmbiguousMode) {
      await reportAmbiguous(verbose);
      log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      return;
    }

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
