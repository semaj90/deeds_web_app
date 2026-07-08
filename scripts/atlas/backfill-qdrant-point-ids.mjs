#!/usr/bin/env node
/**
 * Backfill qdrant_point_id in atlas_packets
 *
 * Scrolls the Qdrant collection, extracts source_ref from payload,
 * and writes the point ID back to atlas_packets.qdrant_point_id.
 *
 * Join key: Qdrant payload.source_ref → atlas_packets.source_ref
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-point-ids.mjs --dry-run
 *   node scripts/atlas/backfill-qdrant-point-ids.mjs --apply
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const BATCH_SIZE = 500;

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Backfill: qdrant_point_id → atlas_packets                       ║');
console.log(`║  Mode: ${(APPLY ? 'APPLY' : 'DRY-RUN').padEnd(57)}║`);
console.log(`║  Collection: ${COLLECTION.padEnd(51)}║`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

async function qdrantScroll(offset, limit) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, offset, with_payload: true, with_vector: false }),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
  return res.json();
}

async function main() {
  let offset = null;
  let totalScrolled = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  const batches = [];

  console.log('  Step 1: Scroll Qdrant collection...\n');

  // Collect all point_id → source_ref pairs
  while (true) {
    const result = await qdrantScroll(offset, BATCH_SIZE);
    const points = result.result?.points ?? [];
    if (points.length === 0) break;

    for (const pt of points) {
      const src = pt.payload?.source_ref;
      if (src) batches.push({ point_id: String(pt.id), source_ref: src });
    }

    totalScrolled += points.length;
    offset = result.result?.next_page_offset ?? null;
    if (totalScrolled % 5000 === 0) process.stdout.write(`  scrolled ${totalScrolled}...\r`);
    if (!offset) break;
  }

  console.log(`  Scrolled ${totalScrolled} points, ${batches.length} have source_ref\n`);
  totalMatched = batches.length;

  if (DRY_RUN) {
    // Sample check
    if (batches.length > 0) {
      const sample = batches.slice(0, 3);
      console.log('  DRY-RUN: sample point_id → source_ref pairs:');
      sample.forEach(b => console.log(`    ${b.point_id} → ${b.source_ref}`));

      // Count how many would match
      const srcRefs = sample.map(b => b.source_ref);
      const check = await pgPool.query(
        `SELECT COUNT(*) FROM atlas_packets WHERE source_ref = ANY($1)`,
        [srcRefs]
      );
      console.log(`  DRY-RUN: ${check.rows[0].count}/${srcRefs.length} sample source_refs found in Postgres`);
    }
    console.log(`\n  DRY-RUN: Would update up to ${totalMatched} atlas_packets rows`);
    console.log('  Re-run with --apply to write\n');
    await pgPool.end();
    return;
  }

  console.log('  Step 2: Write qdrant_point_id to Postgres...\n');

  for (let i = 0; i < batches.length; i += BATCH_SIZE) {
    const chunk = batches.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const { point_id, source_ref } of chunk) {
      placeholders.push(`($${idx}, $${idx + 1})`);
      values.push(source_ref, point_id);
      idx += 2;
    }

    const res = await pgPool.query(
      `UPDATE atlas_packets AS p
       SET qdrant_point_id = v.point_id,
           qdrant_collection = $${idx},
           updated_at = NOW()
       FROM (VALUES ${placeholders.join(', ')}) AS v(source_ref, point_id)
       WHERE p.source_ref = v.source_ref
         AND (p.qdrant_point_id IS NULL OR p.qdrant_point_id != v.point_id)`,
      [...values, COLLECTION]
    );
    totalUpdated += res.rowCount;

    if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
      process.stdout.write(`  updated ${totalUpdated} rows (${i}/${batches.length})...\r`);
    }
  }

  console.log(`\n  ✅ Updated ${totalUpdated} atlas_packets rows with qdrant_point_id`);
  console.log(`  Coverage: ${totalUpdated}/${totalMatched} matched (${((totalUpdated/totalMatched)*100).toFixed(1)}% hit rate)\n`);

  await pgPool.end();

  // Final count
  const countRes = await new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  }).query('SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL').catch(() => null);
  if (countRes) {
    console.log(`  Total qdrant_point_id populated: ${countRes.rows[0].count} / 58365\n`);
    await new pg.Pool({ connectionString: process.env.DATABASE_URL }).end().catch(() => {});
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });