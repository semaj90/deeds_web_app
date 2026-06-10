#!/usr/bin/env node
/**
 * One-shot fix: strip raw embeddings from old glyph_records.record_json
 * and report on records missing packet_key.
 */
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({connectionString:'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'});

const r1 = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL`);
console.log('Missing packet_key:', r1.rows[0].c);

const r2 = await pool.query(`SELECT glyph_id, source_id FROM glyph_records WHERE packet_key IS NULL LIMIT 5`);
console.log('Sample without packet_key:');
r2.rows.forEach(r => console.log('  ', r.glyph_id?.slice(0,60), r.source_id?.slice(0,60)));

const r3 = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE (record_json->>'embedding') IS NOT NULL`);
console.log('With raw embedding in record_json:', r3.rows[0].c);

// Strip raw embeddings from old record_json (these should stay in Qdrant, not glyph_records)
console.log('\nStripping raw embeddings from record_json...');
const strip = await pool.query(`
  UPDATE glyph_records
  SET record_json = record_json - 'embedding',
      updated_at = NOW()
  WHERE (record_json->>'embedding') IS NOT NULL
  RETURNING id
`);
console.log(`  Stripped ${strip.rows.length} records`);

await pool.end();
