#!/usr/bin/env node

/**
 * Task 9: Backfill Summary Layer Stubs
 * Creates placeholder rows for all packets with summary_text = NULL
 * Actual summaries are generated offline via npm run atlas:summary:generate
 *
 * Created: June 15, 2026
 * Part of P1 Implementation
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = `${__dirname}/../../.env`;
dotenv.config({ path: envPath });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const log = {
  info: (msg) => console.log(`[backfill-summary-stubs] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Main backfill routine
 */
async function backfillSummarySubs() {
  const client = await pool.connect();

  try {
    log.info('Creating summary layer stubs...');

    // Get all packets
    const packetsResult = await client.query(
      'SELECT DISTINCT packet_key FROM atlas_codebase_packets ORDER BY packet_key'
    );

    const packets = packetsResult.rows;
    log.info(`Found ${packets.length} packets`);

    let inserted = 0;
    let skipped = 0;

    const summaryLevels = ['chunk', 'file', 'folder', 'feature', 'community', 'system'];

    for (const packet of packets) {
      for (const level of summaryLevels) {
        try {
          await client.query(
            `INSERT INTO atlas_summary_layers
              (packet_key, summary_level, summary_text, embedding, keywords, metadata, generated_at, model_name)
            VALUES
              ($1, $2, NULL, NULL, NULL, $3, NULL, NULL)
            ON CONFLICT DO NOTHING`,
            [
              packet.packet_key,
              level,
              JSON.stringify({ status: 'stub', created_by: 'backfill' })
            ]
          );
          inserted++;
        } catch (err) {
          // Duplicate OK
          skipped++;
        }
      }

      if ((inserted + skipped) % 1000 === 0) {
        log.progress(`${inserted} stubs created...`);
      }
    }

    log.ok(`Created ${inserted} summary stub rows`);

    // Verify
    const verifyResult = await client.query(
      'SELECT COUNT(*) as count FROM atlas_summary_layers'
    );
    const count = verifyResult.rows[0].count;
    log.info(`Verification: ${count} total summary rows`);

    // Show by level
    const byLevelResult = await client.query(
      `SELECT summary_level, COUNT(*) as count
       FROM atlas_summary_layers
       GROUP BY summary_level
       ORDER BY count DESC`
    );
    log.info('Summary rows by level:');
    byLevelResult.rows.forEach((row) => {
      log.info(`  ${row.summary_level}: ${row.count}`);
    });

  } finally {
    client.release();
  }
}

backfillSummarySubs()
  .then(() => {
    log.ok('Summary stubs backfill complete');
    log.info('Next: Run npm run atlas:summary:generate to populate summaries offline');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
