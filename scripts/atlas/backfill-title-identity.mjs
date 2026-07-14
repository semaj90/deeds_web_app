#!/usr/bin/env node
/**
 * backfill-title-identity.mjs
 *
 * Fixes non-canonical title_id rows where the slug ends with '-' (truncation
 * artifact). Strips the trailing dash from the slug segment.
 *
 * Canonical format:  title:<slug>:<hash8>
 *   slug  = [a-z0-9]+(-[a-z0-9]+)*   (NO trailing dash)
 *   hash8 = [a-f0-9]{8}
 *
 * Safe rules:
 *   - Updates ONLY: title_id, title_generator_version, updated_at
 *   - Does NOT touch: packet_key, source_ref, feature_id, tree_node_id,
 *     qdrant_point_id, or any other column
 *   - Dry-run by default; requires --apply to write
 *   - Skips rows that already pass the canonical regex (idempotent)
 *   - Reports matched / updated / unchanged / invalid / duplicate / version-mismatch
 *
 * Usage:
 *   node scripts/atlas/backfill-title-identity.mjs [--apply] [--limit N] [--verbose]
 *
 * Safe rollout:
 *   1. --limit 25              → inspect sample output
 *   2. --limit 25 --apply      → apply first 25 rows
 *   3. --limit 25 --apply      → re-run → expect 0 updated (idempotency check)
 *   4. --limit 500 --apply     → apply 500 rows
 *   5. --apply                 → apply all remaining
 */

import pg from 'pg';
import { TITLE_GENERATOR_VERSION, CANONICAL_TITLE_RE as CANONICAL_RE } from '../../packages/atlas/lib/packet-registry.mjs';

const { Pool } = pg;

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 && process.argv[LIMIT_IDX + 1]
  ? parseInt(process.argv[LIMIT_IDX + 1], 10)
  : 0;
const BATCH_SIZE = 200;

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

/**
 * Strip one trailing dash from the slug portion of a title_id.
 * Input:  title:some-slug-:a1b2c3d4
 * Output: title:some-slug:a1b2c3d4
 */
function repairTitleId(titleId) {
  // Split on the last colon to get hash
  const lastColon = titleId.lastIndexOf(':');
  if (lastColon < 0) return null;

  const prefix = titleId.slice(0, lastColon); // "title:some-slug-"
  const hash8  = titleId.slice(lastColon + 1); // "a1b2c3d4"

  // prefix should be "title:<slug>" — strip the extra trailing dash
  const slugStart = prefix.indexOf(':');
  if (slugStart < 0) return null;

  const slug = prefix.slice(slugStart + 1); // "some-slug-"
  const trimmedSlug = slug.replace(/-+$/, '');

  if (!trimmedSlug) return null;

  const repaired = `title:${trimmedSlug}:${hash8}`;
  return CANONICAL_RE.test(repaired) ? repaired : null;
}

async function main() {
  const startTime = Date.now();
  console.log('🔧 Title Identity Backfill\n');
  console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Limit:   ${LIMIT > 0 ? LIMIT : 'all non-canonical rows'}`);
  console.log(`Batch:   ${BATCH_SIZE}`);

  const client = await pool.connect();
  let exitCode = 0;

  try {
    // ── 1. Fetch non-canonical rows ─────────────────────────────────────────
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const candidatesRes = await client.query(`
      SELECT packet_key, source_ref, feature_id, title_id, title_generator_version
      FROM atlas_packets
      WHERE title_id IS NOT NULL
        AND title_id !~ '^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$'
      ORDER BY packet_key
      ${limitClause}
    `);

    const rows = candidatesRes.rows;
    console.log(`\nNon-canonical rows found: ${rows.length.toLocaleString()}`);

    if (rows.length === 0) {
      console.log('\n✅ Nothing to fix. All title_ids are canonical.');
      return;
    }

    // ── 2. Compute repairs in JS, classify each row ─────────────────────────
    const toUpdate      = [];  // { packet_key, new_title_id }
    const invalid       = [];  // rows that can't be repaired
    const alreadyCanon  = [];  // rows that somehow pass (shouldn't happen given WHERE)

    for (const row of rows) {
      if (CANONICAL_RE.test(row.title_id)) {
        alreadyCanon.push(row);
        continue;
      }
      const repaired = repairTitleId(row.title_id);
      if (!repaired) {
        invalid.push(row);
        if (VERBOSE) {
          console.log(`  ⚠️  Cannot repair: ${row.title_id}  [${row.packet_key}]`);
        }
      } else {
        toUpdate.push({ packet_key: row.packet_key, new_title_id: repaired, old_title_id: row.title_id });
        if (VERBOSE) {
          console.log(`  → ${row.title_id}`);
          console.log(`    ${repaired}`);
        }
      }
    }

    console.log(`\nClassification:`);
    console.log(`  Repairable:     ${toUpdate.length.toLocaleString()}`);
    console.log(`  Not repairable: ${invalid.length.toLocaleString()}`);
    console.log(`  Already canon:  ${alreadyCanon.length.toLocaleString()}  (unexpected; WHERE clause should exclude)`);

    if (invalid.length > 0 && !VERBOSE) {
      console.log(`\n  Sample non-repairable rows (run --verbose for full list):`);
      for (const r of invalid.slice(0, 5)) {
        console.log(`    ${r.title_id}  [${r.packet_key}]`);
      }
    }

    // ── 3. Duplicate check on proposed new title_ids ─────────────────────────
    const newIds = toUpdate.map(r => r.new_title_id);
    const newIdSet = new Set(newIds);
    const duplicateAmongNew = newIds.length - newIdSet.size;

    // Check against existing canonical title_ids in DB
    let duplicateWithExisting = 0;
    if (newIds.length > 0) {
      const dupRes = await client.query(`
        SELECT COUNT(*) AS cnt
        FROM atlas_packets
        WHERE title_id = ANY($1::text[])
          AND title_id ~ '^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$'
      `, [newIds]);
      duplicateWithExisting = parseInt(dupRes.rows[0].cnt);
    }

    if (duplicateAmongNew > 0 || duplicateWithExisting > 0) {
      console.log(`\n⚠️  Duplicate warnings:`);
      console.log(`  Duplicates within proposed set:  ${duplicateAmongNew}`);
      console.log(`  Collisions with existing canon:  ${duplicateWithExisting}`);
      if (!APPLY) {
        console.log(`  (Inspect these before applying)`);
      }
    } else {
      console.log(`\n✅ No duplicate title_ids in proposed repairs`);
    }

    // ── 4. Version-mismatch report ───────────────────────────────────────────
    const versionRows = toUpdate.filter(r => {
      const orig = rows.find(x => x.packet_key === r.packet_key);
      return orig && orig.title_generator_version !== TITLE_GENERATOR_VERSION;
    });
    if (versionRows.length > 0) {
      console.log(`\n⚠️  Version-mismatch (not 'deterministic-title-v1'): ${versionRows.length}`);
    }

    // ── 5. Dry-run sample ─────────────────────────────────────────────────────
    if (!APPLY) {
      console.log(`\nDRY RUN — Sample repairs (first ${Math.min(10, toUpdate.length)}):`);
      for (const r of toUpdate.slice(0, 10)) {
        console.log(`  OLD: ${r.old_title_id}`);
        console.log(`  NEW: ${r.new_title_id}`);
        console.log(`  KEY: ${r.packet_key}`);
        console.log('');
      }
      console.log(`Would update ${toUpdate.length.toLocaleString()} row(s).`);
      console.log('Re-run with --apply to write changes.');
      return;
    }

    // ── 6. Apply in batches ──────────────────────────────────────────────────
    console.log(`\nApplying ${toUpdate.length.toLocaleString()} updates in batches of ${BATCH_SIZE}...`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);

      const packetKeys = batch.map(r => r.packet_key);
      const newTitleIds = batch.map(r => r.new_title_id);

      try {
        // UPDATE only the three allowed columns; use a VALUES join to avoid
        // updating rows that already have the target value (idempotency counter).
        const res = await client.query(`
          UPDATE atlas_packets ap
          SET
            title_id                = v.new_title_id,
            title_generator_version = $3,
            updated_at              = NOW()
          FROM (
            SELECT
              unnest($1::text[]) AS packet_key,
              unnest($2::text[]) AS new_title_id
          ) v
          WHERE ap.packet_key = v.packet_key
            AND (
              ap.title_id                IS DISTINCT FROM v.new_title_id
              OR ap.title_generator_version IS DISTINCT FROM $3
            )
        `, [packetKeys, newTitleIds, TITLE_GENERATOR_VERSION]);

        totalUpdated += res.rowCount ?? 0;
        totalSkipped += batch.length - (res.rowCount ?? 0);
      } catch (err) {
        console.error(`  Batch error at offset ${i}: ${err.message}`);
        exitCode = 1;
        totalSkipped += batch.length;
      }

      process.stdout.write(
        `\r  Updated: ${totalUpdated.toLocaleString()} / ${toUpdate.length.toLocaleString()} ...`
      );
    }
    console.log('');

    // ── 7. Verify post-apply ─────────────────────────────────────────────────
    const verifyRes = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE title_id !~ '^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$')
          AS still_non_canonical,
        COUNT(*) FILTER (WHERE title_generator_version = $1)
          AS current_version_count
      FROM atlas_packets
      WHERE title_id IS NOT NULL
    `, [TITLE_GENERATOR_VERSION]);
    const v = verifyRes.rows[0];

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Backfill Complete');
    console.log('═'.repeat(60));
    console.log(`Matched (non-canonical):  ${rows.length.toLocaleString()}`);
    console.log(`Repairable:               ${toUpdate.length.toLocaleString()}`);
    console.log(`Updated this run:         ${totalUpdated.toLocaleString()}`);
    console.log(`Unchanged (idempotent):   ${totalSkipped.toLocaleString()}`);
    console.log(`Not repairable:           ${invalid.length.toLocaleString()}`);
    console.log(`Duplicate (new vs new):   ${duplicateAmongNew}`);
    console.log(`Collision (new vs exist): ${duplicateWithExisting}`);
    console.log(`Version-mismatch:         ${versionRows.length}`);
    console.log('');
    console.log(`Post-apply still non-canonical: ${parseInt(v.still_non_canonical).toLocaleString()}  ${parseInt(v.still_non_canonical) === 0 ? '✅' : '❌'}`);
    console.log(`Rows at ${TITLE_GENERATOR_VERSION}:  ${parseInt(v.current_version_count).toLocaleString()}`);
    console.log(`Duration:                       ${duration}s`);
    console.log('═'.repeat(60));

    if (parseInt(v.still_non_canonical) > 0) {
      exitCode = 1;
    }

  } finally {
    client.release();
    await pool.end();
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
