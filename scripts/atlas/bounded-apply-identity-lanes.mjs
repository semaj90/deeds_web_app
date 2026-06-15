#!/usr/bin/env node

/**
 * Bounded Apply: Identity Lanes (50 rows)
 *
 * Tests the patched stdin invocation path for large batch updates.
 * Applies identity lane enrichment to first 50 rows as a validation gate.
 *
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
  info: (msg) => console.log(`[bounded-apply] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Build and apply SQL via stdin to avoid command-line length limits
 */
async function applyBoundedUpdate() {
  log.info('========== Bounded Apply: Identity Lanes (50 rows) ==========');
  log.info('');

  const client = await pool.connect();

  try {
    // Step 1: Fetch 50 sample rows
    log.progress('Fetching 50 sample rows...');
    const sampleResult = await client.query(`
      SELECT id, packet_key, source_ref, qdrant_point_id, neo4j_node_id
      FROM atlas_higher_hop_index
      LIMIT 50;
    `);

    const rows = sampleResult.rows;
    log.ok(`Fetched ${rows.length} sample rows`);
    log.info('');

    // Step 2: Generate SQL for bounded update
    log.progress('Generating bounded update SQL...');

    const laneCases = rows
      .map((row) => {
        const lane = row.qdrant_point_id ? 'qdrant' : 'source_ref';
        return `WHEN '${row.id}'::uuid THEN '${lane}'::text`;
      })
      .join('\n    ');

    const confidenceCases = rows
      .map((row) => {
        const confidence = row.qdrant_point_id ? 0.9 : 0.7;
        return `WHEN '${row.id}'::uuid THEN ${confidence}::numeric`;
      })
      .join('\n    ');

    const idArray = rows.map((r) => `'${r.id}'::uuid`).join(',');

    const sql = `
-- Bounded Apply: Identity Lanes (50 rows)
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

-- Verify
SELECT COUNT(*) as updated FROM atlas_higher_hop_index
  WHERE id = ANY(ARRAY[${idArray}])
  AND identity_lane IN ('qdrant', 'source_ref');
`;

    const sqlBytes = Buffer.byteLength(sql);
    log.ok(`Generated SQL: ${sqlBytes} bytes`);
    log.progress(`Applying via stdin to avoid command-line limits...`);

    // Step 3: Execute via stdin (docker exec -i)
    const cmd = `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db`;
    const result = execSync(cmd, { input: sql, encoding: 'utf8' });

    log.ok(`Update applied`);
    log.info(`Result: ${result.trim()}`);
    log.info('');

    // Step 4: Verify via direct query
    log.progress('Verifying update via direct query...');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN identity_lane IN ('qdrant', 'source_ref') THEN 1 END) with_lane,
        COUNT(CASE WHEN identity_confidence > 0.5 THEN 1 END) with_confidence
      FROM atlas_higher_hop_index
      WHERE id = ANY($1);
    `, [rows.map(r => r.id)]);

    const verify = verifyResult.rows[0];
    log.ok(`Verification: ${verify.with_lane}/${verify.total} rows updated`);
    log.ok(`Confidence: ${verify.with_confidence}/${verify.total} rows have confidence > 0.5`);

    log.info('');
    log.ok('========== BOUNDED APPLY COMPLETE ==========');

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

applyBoundedUpdate();
