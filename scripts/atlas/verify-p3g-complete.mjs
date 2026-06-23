#!/usr/bin/env node
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) as with_point_id,
        COUNT(CASE WHEN qdrant_point_id IS NULL THEN 1 END) as missing
      FROM atlas_packets
    `);

    const row = res.rows[0];
    console.log('\n📊 P3g Backfill Verification\n');
    console.log(`  Total packets:       ${row.total}`);
    console.log(`  With qdrant_point_id: ${row.with_point_id}`);
    console.log(`  Missing:            ${row.missing}`);
    console.log(`  Coverage:           ${(row.with_point_id / row.total * 100).toFixed(2)}%\n`);

    if (row.missing === 0) {
      console.log('✅ P3g COMPLETE: All packets have qdrant_point_id\n');
    } else {
      console.log(`⚠️  ${row.missing} packets still missing qdrant_point_id\n`);
    }

    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
    process.exit(1);
  }
})();
