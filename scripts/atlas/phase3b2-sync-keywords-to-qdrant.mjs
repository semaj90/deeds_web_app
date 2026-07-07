#!/usr/bin/env node
/**
 * Phase 3b.2 Supplement: Sync extracted keywords to Qdrant payload
 *
 * Reads packet_feature_keywords from Postgres, writes to Qdrant payload.
 * Enables BM25 sparse search + lexical lane in RRF fusion.
 *
 * Usage:
 *   npm run atlas:phase3b2:qdrant:sync:dry   # Dry-run
 *   npm run atlas:phase3b2:qdrant:sync:apply # Apply
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const { Pool } = pg;

// Config
const CONFIG = {
  postgres: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5434'),
    user: process.env.DATABASE_USER || 'legal_admin',
    password: process.env.DATABASE_PASSWORD || process.env.PGPASSWORD || '123456',
    database: process.env.DATABASE_NAME || 'legal_ai_db',
  },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
  },
  collection: 'codebase_chunks_768',
  batchSize: 100,
};

const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const verbose = process.argv.includes('--verbose');

// Utils
function log(msg, level = 'INFO') {
  if (verbose || level !== 'DEBUG') {
    console.log(`[${level}] ${new Date().toISOString()} ${msg}`);
  }
}

function debug(msg) {
  log(msg, 'DEBUG');
}

// Main
async function main() {
  const pgClient = new Pool(CONFIG.postgres);
  const qdrant = new QdrantClient({ url: CONFIG.qdrant.url });

  try {
    log(`Starting Phase 3b.2 Qdrant keyword sync (dryRun=${dryRun})`);

    // Step 1: Fetch keyword data from Postgres
    log('Step 1: Fetching keywords from Postgres...');
    const result = await pgClient.query(`
      SELECT packet_key, keywords, keyword_count
      FROM packet_feature_keywords
      WHERE keyword_count > 0
      ORDER BY packet_key ASC
    `);

    const keywords = result.rows;
    log(`  → Fetched ${keywords.length} packets with keywords`);

    if (keywords.length === 0) {
      log('No keywords found. Exiting.', 'WARN');
      return;
    }

    // Step 2: Build Qdrant point ID mapping from Postgres
    log('Step 2: Building packet_key → qdrant_point_id mapping...');
    const pointIdResult = await pgClient.query(`
      SELECT packet_key, qdrant_point_id
      FROM atlas_packets
      WHERE qdrant_point_id IS NOT NULL
        AND packet_key IN (SELECT packet_key FROM packet_feature_keywords WHERE keyword_count > 0)
      ORDER BY packet_key ASC
    `);

    const pointIdMap = new Map(pointIdResult.rows.map(r => [r.packet_key, r.qdrant_point_id]));
    log(`  → Mapped ${pointIdMap.size} packets to Qdrant point IDs`);

    // Step 3: Prepare batch updates
    log('Step 3: Preparing batch updates...');
    const updates = [];
    let mappedCount = 0;
    let missingCount = 0;

    for (const kw of keywords) {
      const pointId = pointIdMap.get(kw.packet_key);
      if (!pointId) {
        debug(`  No Qdrant point ID for ${kw.packet_key}`);
        missingCount++;
        continue;
      }

      updates.push({
        point_id: pointId,
        payload: {
          keywords: kw.keywords, // Array of keywords
          keyword_count: kw.keyword_count,
        },
      });
      mappedCount++;
    }

    log(`  → Prepared ${mappedCount} updates (${missingCount} missing point IDs)`);

    if (dryRun) {
      log('DRY-RUN: Would update the following sample points:');
      for (let i = 0; i < Math.min(3, updates.length); i++) {
        const u = updates[i];
        log(`  ${i + 1}. Point ID ${u.point_id}: ${u.payload.keyword_count} keywords`);
      }
      log(`DRY-RUN: Total ${updates.length} updates would be applied`);
      return;
    }

    // Step 4: Apply batch updates to Qdrant
    log('Step 4: Applying batch updates to Qdrant...');
    let batchIndex = 0;
    let appliedCount = 0;

    for (let i = 0; i < updates.length; i += CONFIG.batchSize) {
      const batch = updates.slice(i, i + CONFIG.batchSize);
      batchIndex++;

      try {
        // Upsert payload for each point in the batch
        const updateOps = batch.map(u => ({
          operation: 'set_payload',
          payload: u.payload,
          points: [u.point_id],
        }));

        // Qdrant batch API: send all operations together
        for (const op of updateOps) {
          await qdrant.setPayload(CONFIG.collection, {
            payload: op.payload,
            points: op.points,
          });
        }

        appliedCount += batch.length;
        log(`  ✓ Batch ${batchIndex} (${batch.length} updates) applied. Total: ${appliedCount}/${updates.length}`);
      } catch (err) {
        log(`  ✗ Batch ${batchIndex} failed: ${err.message}`, 'ERROR');
        throw err;
      }
    }

    log(`✓ Step 4 complete: ${appliedCount} points updated in Qdrant`);

    // Step 5: Verify payload schema
    log('Step 5: Verifying payload schema...');
    const collInfo = await qdrant.getCollection(CONFIG.collection);
    const hasKeywords = collInfo.payload_schema?.keywords;
    log(`  → Qdrant payload now includes keywords field: ${hasKeywords ? 'YES' : 'NO'}`);

    // Step 6: Update packet_feature_keywords.bm25_ready flag
    log('Step 6: Marking packets as BM25-ready in Postgres...');
    const updateFlag = await pgClient.query(`
      UPDATE packet_feature_keywords
      SET bm25_ready = true, updated_at = NOW()
      WHERE keyword_count > 0
    `);

    const readyCount = updateFlag.rowCount || 0;
    log(`  → Marked ${readyCount} packets as BM25-ready`);

    // Summary
    log('');
    log('=== PHASE 3B.2 QDRANT SYNC COMPLETE ===');
    log(`Total packets synced: ${appliedCount}`);
    log(`Total keywords synced: ${updates.reduce((sum, u) => sum + (u.payload.keyword_count || 0), 0)}`);
    log(`BM25 indexing: READY for lexical lane in RRF fusion`);
    log('');
    log('Next: Day 1 Phase 3 — Implement RRF fusion module');

  } catch (err) {
    log(`FATAL: ${err.message}`, 'ERROR');
    if (verbose) console.error(err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
