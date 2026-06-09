#!/usr/bin/env node
/**
 * backfill-atlas-source-ref-hash.mjs
 *
 * Populates canonical_source_ref and source_ref_hash on task_semantic_packets
 * rows where source_ref is set but the hash columns are NULL.
 *
 * Uses pgcrypto digest() for hash computation inside Postgres — no row-by-row
 * round-trips. Requires pgcrypto extension (present on legal_ai_db).
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-source-ref-hash.mjs            # dry-run
 *   node scripts/atlas/backfill-atlas-source-ref-hash.mjs --apply
 */

import pg from 'pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const { normalizeSourceRef, sourceRefHash } =
  await import(pathToFileURL(resolve(__dirname, '../lib/canonical-source-ref.mjs')).href);

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

console.log(`[atlas-backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

// 1. Count rows that need updating
const { rows: countRows } = await pool.query(`
  SELECT COUNT(*) as total,
    COUNT(CASE WHEN source_ref IS NOT NULL AND source_ref_hash IS NULL THEN 1 END) as needs_hash,
    COUNT(CASE WHEN source_ref_hash IS NOT NULL THEN 1 END) as already_set
  FROM task_semantic_packets
`);
const { total, needs_hash, already_set } = countRows[0];
console.log(`[atlas-backfill] total=${total}  needs_hash=${needs_hash}  already_set=${already_set}`);

if (!APPLY) {
  // Dry-run: sample what would be written
  const { rows: sample } = await pool.query(`
    SELECT source_ref FROM task_semantic_packets
    WHERE source_ref IS NOT NULL AND source_ref_hash IS NULL
    LIMIT 5
  `);
  for (const r of sample) {
    const canonical = normalizeSourceRef(r.source_ref);
    const hash = sourceRefHash(r.source_ref);
    console.log(`  ${r.source_ref} → ${canonical} (${hash})`);
  }
  console.log('[atlas-backfill] DRY-RUN: re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

// 2. Fetch all rows needing update in batches and compute in JS
//    (pgcrypto sha256 encodes to bytea — easier to compute the 12-char hex in JS
//     and batch-UPDATE via unnest to avoid per-row round-trips)
const BATCH = 2000;
let offset = 0, updated = 0;

while (true) {
  const { rows } = await pool.query(`
    SELECT id, source_ref FROM task_semantic_packets
    WHERE source_ref IS NOT NULL AND source_ref_hash IS NULL
    ORDER BY id
    LIMIT $1 OFFSET $2
  `, [BATCH, offset]);

  if (!rows.length) break;

  const ids = [], canonicals = [], hashes = [];
  for (const r of rows) {
    ids.push(r.id);
    canonicals.push(normalizeSourceRef(r.source_ref));
    hashes.push(sourceRefHash(r.source_ref));
  }

  await pool.query(`
    UPDATE task_semantic_packets AS t
    SET canonical_source_ref = v.canonical,
        source_ref_hash = v.hash
    FROM (
      SELECT unnest($1::int[]) AS id,
             unnest($2::text[]) AS canonical,
             unnest($3::text[]) AS hash
    ) AS v
    WHERE t.id = v.id
  `, [ids, canonicals, hashes]);

  updated += rows.length;
  process.stdout.write(`  [${updated}/${needs_hash}]\r`);
  offset += BATCH;
  if (rows.length < BATCH) break;
}

console.log(`\n[atlas-backfill] Updated ${updated} rows with canonical_source_ref + source_ref_hash`);
await pool.end();
