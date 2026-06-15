#!/usr/bin/env node

/**
 * Full Apply: Identity Lanes (all 3,251 rows)
 *
 * Applies identity lane enrichment to entire atlas_higher_hop_index.
 * Uses docker exec -i (stdin) to avoid command-line length limits.
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[apply-full] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Build and apply SQL via stdin to avoid command-line length limits
 */
async function applyFullUpdate() {
  log.info('========== Full Apply: Identity Lanes (3,251 rows) ==========');
  log.info('');

  const client = await pool.connect();

  try {
    // Step 1: Fetch all rows
    log.progress('Fetching all rows...');
    const result = await client.query(`
      SELECT id, packet_key, source_ref, qdrant_point_id, neo4j_node_id
      FROM atlas_higher_hop_index
      ORDER BY created_at;
    `);

    const rows = result.rows;
    log.ok(`Fetched ${rows.length} rows`);
    log.info('');

    // Step 2: Generate SQL for full update
    log.progress('Generating full update SQL (batched)...');

    // Batch into 500-row chunks to keep SQL manageable
    const batchSize = 500;
    let totalUpdated = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(rows.length / batchSize);

      log.progress(`  Batch ${batchNum}/${totalBatches} (rows ${i + 1}-${Math.min(i + batchSize, rows.length)})...`);

      const laneCases = batch
        .map((row) => {
          const lane = row.qdrant_point_id ? 'qdrant' : (row.neo4j_node_id ? 'neo4j' : 'source_ref');
          return `WHEN '${row.id}'::uuid THEN '${lane}'::text`;
        })
        .join('\n    ');

      const confidenceCases = batch
        .map((row) => {
          let confidence = 0.5;
          if (row.qdrant_point_id) confidence = 0.95;
          else if (row.neo4j_node_id) confidence = 0.85;
          else confidence = 0.75;
          return `WHEN '${row.id}'::uuid THEN ${confidence}::numeric`;
        })
        .join('\n    ');

      const idArray = batch.map((r) => `'${r.id}'::uuid`).join(',');

      const sql = `
UPDATE atlas_higher_hop_index
SET
  identity_lane = CASE id
    ${laneCases}
    ELSE identity_lane
  END,
  identity_confidence = CASE id
    ${confidenceCases}
    ELSE identity_confidence
  END,
  updated_at = now()
WHERE id = ANY(ARRAY[${idArray}]);
`;

      try {
        const cmd = `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db`;
        const updateResult = execSync(cmd, { input: sql, encoding: 'utf8' });
        const matched = updateResult.match(/UPDATE (\d+)/);
        const batchUpdated = matched ? parseInt(matched[1]) : 0;
        totalUpdated += batchUpdated;
        log.ok(`    Batch ${batchNum}: ${batchUpdated} rows`);
      } catch (err) {
        log.error(`    Batch ${batchNum} failed: ${err.message}`);
        throw err;
      }
    }

    log.info('');
    log.ok(`Total updated: ${totalUpdated}/${rows.length}`);
    log.info('');

    // Step 3: Verify
    log.progress('Verifying full update...');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN identity_lane IS NOT NULL THEN 1 END) with_lane,
        COUNT(CASE WHEN identity_confidence > 0.5 THEN 1 END) with_confidence,
        COUNT(CASE WHEN identity_lane = 'qdrant' THEN 1 END) lane_qdrant,
        COUNT(CASE WHEN identity_lane = 'neo4j' THEN 1 END) lane_neo4j,
        COUNT(CASE WHEN identity_lane = 'source_ref' THEN 1 END) lane_source_ref
      FROM atlas_higher_hop_index;
    `);

    const verify = verifyResult.rows[0];
    log.ok(`Verification:`);
    log.ok(`  Total rows: ${verify.total}`);
    log.ok(`  With identity_lane: ${verify.with_lane} (${(100 * verify.with_lane / verify.total).toFixed(1)}%)`);
    log.ok(`  With confidence > 0.5: ${verify.with_confidence} (${(100 * verify.with_confidence / verify.total).toFixed(1)}%)`);
    log.ok(`  Lane distribution:`);
    log.ok(`    qdrant: ${verify.lane_qdrant}`);
    log.ok(`    neo4j: ${verify.lane_neo4j}`);
    log.ok(`    source_ref: ${verify.lane_source_ref}`);

    log.info('');
    log.ok('========== FULL APPLY COMPLETE ==========');

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

applyFullUpdate();
