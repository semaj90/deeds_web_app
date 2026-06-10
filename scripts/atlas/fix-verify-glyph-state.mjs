#!/usr/bin/env node
import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

// 1. Total count
const total = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records`);
console.log(`Total glyph_records: ${total.rows[0].c}`);

// 2. Any duplicates by packet_key?
const dupes = await pool.query(`
  SELECT packet_key, COUNT(*) AS n, array_agg(glyph_id ORDER BY created_at) AS glyphs
  FROM glyph_records
  GROUP BY packet_key
  HAVING COUNT(*) > 1
  LIMIT 20
`);
console.log(`\nDuplicate packet_key groups: ${dupes.rows.length}`);
for (const r of dupes.rows) {
  console.log(`  packet_key=${r.packet_key.slice(0,40)}  n=${r.n}  glyphs=${JSON.stringify(r.glyphs)}`);
}

// 3. What glyph_id patterns exist?
const patterns = await pool.query(`
  SELECT
    CASE
      WHEN glyph_id ~ '^glyph:[0-9a-f]{12}$' THEN 'v3_deterministic (glyph:12hex)'
      WHEN glyph_id LIKE 'glyph:ui:%' THEN 'v2_structured (glyph:ui:...)'
      WHEN glyph_id LIKE 'glyph:scripts:%' THEN 'v2_structured (glyph:scripts:...)'
      WHEN glyph_id LIKE 'glyph:unclassified:%' THEN 'v2_structured (glyph:unclassified:...)'
      WHEN glyph_id LIKE 'glyph:%' THEN 'v2_other (glyph:...)'
      ELSE 'legacy'
    END AS pattern,
    COUNT(*) AS c
  FROM glyph_records
  GROUP BY pattern
  ORDER BY c DESC
`);
console.log('\nGlyph ID patterns:');
for (const r of patterns.rows) {
  console.log(`  ${r.pattern.padEnd(40)} ${r.c}`);
}

// 4. Sample glyph_ids
const sample = await pool.query(`SELECT glyph_id, packet_key, kind FROM glyph_records LIMIT 10`);
console.log('\nSample rows:');
for (const r of sample.rows) {
  console.log(`  ${r.glyph_id.padEnd(30)} pk=${r.packet_key?.slice(0,30)}  kind=${r.kind}`);
}

// 5. packet_key NULL check
const nullPk = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL`);
console.log(`\npacket_key IS NULL: ${nullPk.rows[0].c}`);

await pool.end();
