#!/usr/bin/env node
/**
 * P0: Inspect then delete orphan glyph_records with no packet_key.
 * These are legacy Phase-1 ACE card ingests that predate the materializer.
 */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

// Inspect
const inspect = await pool.query(`
  SELECT id, glyph_id, source_id, kind, section, created_at
  FROM glyph_records
  WHERE packet_key IS NULL
  ORDER BY created_at
  LIMIT 20
`);
console.log(`Orphan glyph_records (packet_key IS NULL): ${inspect.rows.length} shown\n`);
for (const r of inspect.rows) {
  console.log(`  ${r.glyph_id.padEnd(30)} kind=${r.kind.padEnd(12)} section=${(r.section ?? 'NULL').padEnd(10)} created=${r.created_at}`);
}

// Count
const countRes = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL`);
const total = parseInt(countRes.rows[0].c, 10);
console.log(`\nTotal orphans: ${total}`);

// Delete
console.log(`\nDeleting ${total} orphan rows...`);
const del = await pool.query(`DELETE FROM glyph_records WHERE packet_key IS NULL RETURNING id`);
console.log(`  Deleted: ${del.rows.length}`);

// Verify
const after = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL`);
console.log(`  Remaining orphans: ${after.rows[0].c}`);

const totalAfter = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records`);
console.log(`  Total glyph_records: ${totalAfter.rows[0].c}`);

await pool.end();
