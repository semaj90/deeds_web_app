#!/usr/bin/env node
/**
 * Deduplicate glyph_records: keep only the v3 deterministic rows (glyph:12char_hex)
 * and remove v2 rows (glyph:slug:hash pattern) that have the same packet_key.
 */
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

// Count v3 rows (glyph:12hex) vs v2 rows (longer glyph: patterns)
const v3 = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE glyph_id ~ '^glyph:[0-9a-f]{12}$'`);
const v2 = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE glyph_id NOT LIKE 'glyph:____________' OR length(glyph_id) > 18`);
console.log(`v3 deterministic rows (glyph:12hex): ${v3.rows[0].c}`);

// Find v2 rows that share a packet_key with a v3 row
const dupes = await pool.query(`
  SELECT COUNT(*) AS c FROM glyph_records old
  WHERE old.glyph_id !~ '^glyph:[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM glyph_records v3
      WHERE v3.glyph_id ~ '^glyph:[0-9a-f]{12}$'
        AND v3.packet_key = old.packet_key
    )
`);
console.log(`v2 rows with duplicate packet_key (safe to delete): ${dupes.rows[0].c}`);

// Delete them
const del = await pool.query(`
  DELETE FROM glyph_records old
  WHERE old.glyph_id !~ '^glyph:[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM glyph_records v3
      WHERE v3.glyph_id ~ '^glyph:[0-9a-f]{12}$'
        AND v3.packet_key = old.packet_key
    )
  RETURNING old.id
`);
console.log(`Deleted: ${del.rows.length}`);

const total = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records`);
console.log(`Remaining glyph_records: ${total.rows[0].c}`);

await pool.end();
