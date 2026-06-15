#!/usr/bin/env node

/**
 * Phase 16-H.3: SOM Repair
 *
 * Pulls som_cluster, som_x, som_y from atlas_topology_index
 * Falls back to marking as pending_training if not available
 *
 * Time: ~15 min
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
  info: (msg) => console.log(`[phase-16-h-3] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.3: SOM Repair ==========');
    log.info('');

    const client = await pool.connect();

    try {
      log.progress('Checking if atlas_topology_index exists...');

      // Check if atlas_topology_index table exists
      const tableCheckResult = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'atlas_topology_index'
        )
      `);

      const tableExists = tableCheckResult.rows[0].exists;

      if (!tableExists) {
        log.info('⏳ atlas_topology_index does not exist yet');
        log.info('   Marking all rows as pending_training');
        log.info('');

        // Just mark metadata
        await client.query(`
          UPDATE atlas_higher_hop_index
          SET metadata = jsonb_set(metadata, '{som_status}', '"pending_training"')
          WHERE metadata->>'som_status' IS NULL
        `);

        log.ok('Marked all rows as pending_training');
      } else {
        log.progress('Syncing SOM data from atlas_topology_index...');

        // Sync SOM data
        const syncResult = await client.query(`
          UPDATE atlas_higher_hop_index h
          SET
            som_cluster = t.z_som,
            som_x = (CASE WHEN t.z_som IS NOT NULL THEN (t.z_som / 20)::smallint ELSE NULL END),
            som_y = (CASE WHEN t.z_som IS NOT NULL THEN (t.z_som % 20)::smallint ELSE NULL END),
            metadata = jsonb_set(metadata, '{som_source}', '"topology_index"')
          FROM atlas_topology_index t
          WHERE h.packet_key = t.packet_key AND t.z_som IS NOT NULL
        `);

        log.ok(`Synced SOM data for ${syncResult.rowCount} rows`);
      }

      log.info('');

      // Audit coverage
      const auditResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as with_som,
          COUNT(CASE WHEN metadata->>'som_status' = 'pending_training' THEN 1 END) as pending
        FROM atlas_higher_hop_index
      `);

      const { total, with_som, pending } = auditResult.rows[0];
      const coverage = (100 * with_som / total).toFixed(1);

      log.ok(`SOM topology status:`);
      log.ok(`  Linked: ${with_som}/${total} (${coverage}%)`);
      log.ok(`  Pending training: ${pending}`);

      log.ok('');
      log.ok('========== Phase 16-H.3 COMPLETE ==========');
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
