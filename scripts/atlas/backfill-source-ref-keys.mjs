#!/usr/bin/env node
/**
 * backfill-source-ref-keys.mjs
 *
 * Populates the source_ref_key column in atlas_packets for all rows
 * where it is currently NULL or empty, using normalizeSourceRef.
 */

import pg from 'pg';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  console.log('\n🔧 Backfilling source_ref_key in atlas_packets...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Fetch all rows where source_ref_key is NULL or empty but source_ref is present
    const res = await pool.query(`
      SELECT packet_id, source_ref
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref <> ''
        AND (source_ref_key IS NULL OR source_ref_key = '')
    `);

    const total = res.rows.length;
    console.log(`Found ${total} rows needing source_ref_key backfill.`);

    if (total === 0) {
      console.log('✅ No rows need backfilling.');
      return;
    }

    const BATCH_SIZE = 500;
    let updated = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = res.rows.slice(i, i + BATCH_SIZE);
      
      // We can use a transaction or execute updates concurrently in batch
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of batch) {
          const canonical = normalizeSourceRef(row.source_ref);
          await client.query(
            'UPDATE atlas_packets SET source_ref_key = $1 WHERE packet_id = $2',
            [canonical, row.packet_id]
          );
        }
        await client.query('COMMIT');
        updated += batch.length;
        process.stdout.write(`\r  Progress: ${updated}/${total} updated`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n❌ Batch failed: ${err.message}`);
      } finally {
        client.release();
      }
    }

    console.log('\n\n✅ Backfill completed successfully!');
  } catch (err) {
    console.error('❌ Main execution failed:', err);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
