#!/usr/bin/env node
/**
 * Backfill packet_key for legacy glyph_records that were ingested via
 * ingest-ace-cards-to-glyphs.mjs before the materializer existed.
 *
 * Strategy: match on source_id ↔ nes_chrom_packets.source_ref
 */
import pg from 'pg';

const pool = new pg.Pool({connectionString:'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'});

// Check how many legacy records can be matched
const matchable = await pool.query(`
  SELECT COUNT(*) AS c
  FROM glyph_records g
  JOIN nes_chrom_packets n ON g.source_id = n.source_ref
  WHERE g.packet_key IS NULL
`);
console.log('Legacy records matchable to packets:', matchable.rows[0].c);

const unmatchable = await pool.query(`
  SELECT COUNT(*) AS c
  FROM glyph_records g
  WHERE g.packet_key IS NULL
    AND NOT EXISTS (SELECT 1 FROM nes_chrom_packets n WHERE n.source_ref = g.source_id)
`);
console.log('Legacy records NOT matchable:', unmatchable.rows[0].c);

// Backfill: set packet_key from matching nes_chrom_packets
const result = await pool.query(`
  UPDATE glyph_records g
  SET packet_key = n.packet_key,
      hmm_section = COALESCE(g.hmm_section, 'UNKNOWN'),
      updated_at = NOW()
  FROM nes_chrom_packets n
  WHERE g.source_id = n.source_ref
    AND g.packet_key IS NULL
  RETURNING g.id
`);
console.log('Backfilled packet_key for', result.rows.length, 'records');

// Check remaining
const remaining = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL`);
console.log('Remaining without packet_key:', remaining.rows[0].c);

await pool.end();
