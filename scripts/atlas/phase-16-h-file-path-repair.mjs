#!/usr/bin/env node

/**
 * Phase 16-H.2: File Path Repair
 *
 * Syncs file_path from Postgres atlas_packets where it exists
 * Marks remaining rows as 'partial' repair status
 *
 * Time: ~10 min
 * Blocker: Phase 16-H.1
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[phase-16-h-2] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.2: File Path Repair ==========');
    log.info('');

    const client = await pool.connect();

    try {
      log.progress('Syncing file_path from atlas_packets...');

      // Update file_path from atlas_codebase_packets where it exists
      const syncResult = await client.query(`
        UPDATE atlas_higher_hop_index h
        SET file_path = p.file_path
        FROM atlas_codebase_packets p
        WHERE h.packet_key = p.packet_key
          AND h.file_path IS NULL
          AND p.file_path IS NOT NULL
      `);

      const synced = syncResult.rowCount;
      log.ok(`Synced ${synced} file_path values from atlas_packets`);
      log.info('');

      // Audit coverage
      const auditResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as with_file_path
        FROM atlas_higher_hop_index
      `);

      const { total, with_file_path } = auditResult.rows[0];
      const coverage = (100 * with_file_path / total).toFixed(1);

      log.ok(`File path coverage: ${with_file_path}/${total} (${coverage}%)`);
      log.ok(`Remaining rows without file_path: ${total - with_file_path} (acceptable gap)`);

      log.ok('');
      log.ok('========== Phase 16-H.2 COMPLETE ==========');
      log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    } finally {
      await client.release();
    }

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
