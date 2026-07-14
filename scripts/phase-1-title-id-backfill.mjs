#!/usr/bin/env node

/**
 * Phase 1 Title ID Backfill
 *
 * Applies the canonical title:slug:hash8 formula to every atlas_packets row
 * that currently has a non-canonical title_id (or NULL).
 *
 * Usage:
 *   node scripts/phase-1-title-id-backfill.mjs [--dry-run] [--verbose] [--batch 500]
 *
 * Canonical formula:
 *   hash8  = sha256(`${packet_key}\0deterministic-title-v1`).hex.slice(0, 8)
 *   slug   = feature_id.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 64) || 'untitled'
 *   title_id = `title:${slug}:${hash8}`
 *
 * Idempotent — already-canonical rows are skipped via WHERE filter.
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// ── CLI args ────────────────────────────────────────────────────────────────
const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
const BATCH_IDX = process.argv.indexOf('--batch');
const BATCH_SIZE = BATCH_IDX !== -1 && process.argv[BATCH_IDX + 1]
  ? parseInt(process.argv[BATCH_IDX + 1], 10)
  : 500;

const CANONICAL_RE = /^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/;
const GENERATOR_VERSION = 'deterministic-title-v1';

// ── Title generation (mirrors title-id-generator.ts) ─────────────────────
function generateTitleId(packetKey, featureId = '') {
  const hash8 = crypto
    .createHash('sha256')
    .update(`${packetKey}\0${GENERATOR_VERSION}`)
    .digest('hex')
    .slice(0, 8);

  const slug = (featureId || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'untitled';

  return `title:${slug}:${hash8}`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('📋 Phase 1 Title ID Backfill\n');
  console.log(`Mode:       ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Verbose:    ${VERBOSE ? 'ON' : 'OFF'}`);
  console.log('');

  const pool = new Pool({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '5434'),
    user:     process.env.DB_USER     || 'legal_admin',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME     || 'legal_ai_db',
    max: 5,
  });

  const client = await pool.connect();

  try {
    // ── Count totals ────────────────────────────────────────────────────────
    const countResult = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE title_id ~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$') AS already_canonical,
        COUNT(*) FILTER (WHERE title_id IS NULL OR title_id !~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$') AS needs_backfill
      FROM atlas_packets
    `);

    const { total, already_canonical, needs_backfill } = countResult.rows[0];
    console.log(`Total packets:      ${parseInt(total).toLocaleString()}`);
    console.log(`Already canonical:  ${parseInt(already_canonical).toLocaleString()}`);
    console.log(`Needs backfill:     ${parseInt(needs_backfill).toLocaleString()}`);
    console.log('');

    if (parseInt(needs_backfill) === 0) {
      console.log('✅ All packets already have canonical title_ids. Nothing to do.');
      return;
    }

    if (DRY_RUN) {
      // Sample a few rows to preview what would be generated
      const sample = await client.query(`
        SELECT packet_key, feature_id, title_id
        FROM atlas_packets
        WHERE title_id IS NULL OR title_id !~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$'
        LIMIT 5
      `);

      console.log('📋 Sample (DRY RUN — no writes):');
      for (const row of sample.rows) {
        const canonical = generateTitleId(row.packet_key, row.feature_id);
        console.log(`  ${row.packet_key.slice(0, 20)}...`);
        console.log(`    was:  ${row.title_id ?? '(null)'}`);
        console.log(`    will: ${canonical}`);
      }
      console.log('');
      console.log(`Would update ${parseInt(needs_backfill).toLocaleString()} packets.`);
      console.log('Re-run without --dry-run to apply.');
      return;
    }

    // ── Batch update ────────────────────────────────────────────────────────
    let offset = 0;
    let totalUpdated = 0;
    let batchNum = 0;

    while (true) {
      // Fetch a batch of non-canonical rows
      const rows = await client.query(`
        SELECT packet_key, feature_id
        FROM atlas_packets
        WHERE title_id IS NULL OR title_id !~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$'
        ORDER BY packet_key
        LIMIT $1
      `, [BATCH_SIZE]);

      if (rows.rows.length === 0) break;
      batchNum++;

      // Build VALUES for batch update
      const updates = rows.rows.map(row => ({
        packet_key: row.packet_key,
        title_id: generateTitleId(row.packet_key, row.feature_id),
      }));

      // Write each row (could be a single unnest query but keeping clear for auditability)
      await client.query('BEGIN');
      try {
        for (const u of updates) {
          await client.query(
            `UPDATE atlas_packets
             SET title_id = $1, title_generator_version = $2, updated_at = NOW()
             WHERE packet_key = $3`,
            [u.title_id, GENERATOR_VERSION, u.packet_key]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      totalUpdated += updates.length;

      if (VERBOSE) {
        const sample = updates[0];
        console.log(`  Batch ${batchNum}: ${updates.length} rows | example: ${sample.packet_key.slice(0,16)}... → ${sample.title_id}`);
      } else {
        process.stdout.write(`\r  Updated ${totalUpdated.toLocaleString()} / ${parseInt(needs_backfill).toLocaleString()} packets...`);
      }

      if (rows.rows.length < BATCH_SIZE) break; // Last batch
    }

    if (!VERBOSE) console.log(''); // newline after progress line

    // ── Verify ─────────────────────────────────────────────────────────────
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE title_id ~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$') AS canonical_after,
        COUNT(*) FILTER (WHERE title_id IS NULL OR title_id !~ '^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$') AS remaining
      FROM atlas_packets
    `);

    const { canonical_after, remaining } = verifyResult.rows[0];
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('📊 Backfill Complete');
    console.log('═'.repeat(60));
    console.log(`Updated:          ${totalUpdated.toLocaleString()} packets`);
    console.log(`Canonical after:  ${parseInt(canonical_after).toLocaleString()}`);
    console.log(`Still legacy:     ${parseInt(remaining).toLocaleString()}`);
    console.log(`Duration:         ${duration}s`);
    console.log('═'.repeat(60));

    if (parseInt(remaining) === 0) {
      console.log('\n🎉 All 58,365 packets now have canonical title_ids.');
      console.log('✅ Title identity contract fully satisfied.\n');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${parseInt(remaining).toLocaleString()} packets still have non-canonical title_ids.`);
      process.exit(1);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
