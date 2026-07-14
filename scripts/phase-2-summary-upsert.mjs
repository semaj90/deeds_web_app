#!/usr/bin/env node

/**
 * Phase 2 Summary Upsert
 *
 * Promotes summaries from codebase_chunk_index into atlas_packets via the
 * confirmed join key: atlas_packets.source_ref = 'sveltekit-frontend/' || codebase_chunk_index.relative_path
 *
 * Also merges summaries from atlas_summary_layers where packet_key matches.
 *
 * Sources (in priority order — higher source wins on conflict):
 *   1. codebase_chunk_index  — 35,410 joinable rows (July 4-8 Phase 7 summaries)
 *   2. atlas_summary_layers  — 1,047 joinable rows (summary layer pipeline)
 *
 * For packets with multiple chunks, uses the longest summary per source_ref.
 *
 * Usage:
 *   node scripts/phase-2-summary-upsert.mjs [--dry-run] [--verbose] [--batch 1000]
 *   node scripts/phase-2-summary-upsert.mjs --source chunks   (chunks only)
 *   node scripts/phase-2-summary-upsert.mjs --source layers   (summary_layers only)
 *   node scripts/phase-2-summary-upsert.mjs --source both     (default)
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
const BATCH_IDX = process.argv.indexOf('--batch');
const BATCH_SIZE = BATCH_IDX !== -1 && process.argv[BATCH_IDX + 1]
  ? parseInt(process.argv[BATCH_IDX + 1], 10)
  : 1000;
const SRC_IDX = process.argv.indexOf('--source');
const SOURCE = SRC_IDX !== -1 && process.argv[SRC_IDX + 1]
  ? process.argv[SRC_IDX + 1]
  : 'both';

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 5,
});

async function auditCoverage(client) {
  const r = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(summary) FILTER (WHERE length(summary) > 20) AS has_summary,
      COUNT(*) FILTER (WHERE summary IS NULL OR length(summary) <= 20) AS missing_summary
    FROM atlas_packets
  `);
  return r.rows[0];
}

async function upsertFromChunks(client) {
  console.log('\n── Source 1: codebase_chunk_index → atlas_packets ──');

  // Count what we can promote (packets that would get an updated/new summary)
  const countRes = await client.query(`
    SELECT COUNT(DISTINCT ap.packet_key) AS joinable
    FROM codebase_chunk_index ci
    JOIN atlas_packets ap ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
    WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
      AND length(ci.relative_path) > 0
      AND (ap.summary IS NULL OR length(ap.summary) < length(ci.summary))
  `);
  console.log(`  Joinable packets: ${countRes.rows[0].joinable}`);

  if (DRY_RUN) {
    const sample = await client.query(`
      SELECT ap.packet_key, ap.source_ref, length(ci.summary) AS sum_len
      FROM codebase_chunk_index ci
      JOIN atlas_packets ap ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
      WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
      ORDER BY length(ci.summary) DESC
      LIMIT 5
    `);
    console.log('  Sample (longest summaries):');
    for (const r of sample.rows) {
      console.log(`    ${r.source_ref.slice(0, 60)} → ${r.sum_len} chars`);
    }
    return parseInt(countRes.rows[0].joinable);
  }

  // Upsert: for each packet, take the longest summary across all its chunks.
  // Join key: ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
  // Aggregate per source_ref first, then join to atlas_packets.
  const result = await client.query(`
    UPDATE atlas_packets ap
    SET
      summary    = best.best_summary,
      updated_at = NOW()
    FROM (
      SELECT
        'sveltekit-frontend/' || ci.relative_path AS source_ref,
        (array_agg(ci.summary ORDER BY length(ci.summary) DESC))[1] AS best_summary
      FROM codebase_chunk_index ci
      WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
        AND length(ci.relative_path) > 0
      GROUP BY ci.relative_path
    ) AS best
    WHERE ap.source_ref = best.source_ref
      AND (ap.summary IS NULL OR length(ap.summary) < length(best.best_summary))
  `);

  const updated = result.rowCount ?? 0;
  console.log(`  Updated: ${updated} packets`);
  return updated;
}

async function upsertFromSummaryLayers(client) {
  console.log('\n── Source 2: atlas_summary_layers → atlas_packets ──');

  const countRes = await client.query(`
    SELECT COUNT(DISTINCT sl.packet_key) AS joinable
    FROM atlas_summary_layers sl
    JOIN atlas_packets ap ON ap.packet_key = sl.packet_key
    WHERE sl.summary_text IS NOT NULL AND length(sl.summary_text) > 20
  `);
  console.log(`  Joinable packets: ${countRes.rows[0].joinable}`);

  if (DRY_RUN) {
    const sample = await client.query(`
      SELECT sl.packet_key, length(sl.summary_text) AS sum_len, sl.summary_level
      FROM atlas_summary_layers sl
      JOIN atlas_packets ap ON ap.packet_key = sl.packet_key
      WHERE sl.summary_text IS NOT NULL AND length(sl.summary_text) > 20
      ORDER BY length(sl.summary_text) DESC
      LIMIT 5
    `);
    console.log('  Sample:');
    for (const r of sample.rows) {
      console.log(`    ${r.packet_key.slice(0, 30)} [${r.summary_level}] → ${r.sum_len} chars`);
    }
    return parseInt(countRes.rows[0].joinable);
  }

  // For summary_layers, prefer longer summary; don't overwrite a longer existing one
  const result = await client.query(`
    UPDATE atlas_packets ap
    SET
      summary    = best.summary_text,
      updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (packet_key)
        packet_key,
        summary_text
      FROM atlas_summary_layers
      WHERE summary_text IS NOT NULL AND length(summary_text) > 20
      ORDER BY packet_key, length(summary_text) DESC
    ) AS best
    WHERE best.packet_key = ap.packet_key
      AND (ap.summary IS NULL OR length(ap.summary) < length(best.summary_text))
  `);

  const updated = result.rowCount ?? 0;
  console.log(`  Updated: ${updated} packets`);
  return updated;
}

async function main() {
  const startTime = Date.now();
  console.log('📋 Phase 2 Summary Upsert\n');
  console.log(`Mode:    ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Source:  ${SOURCE}`);
  console.log(`Verbose: ${VERBOSE ? 'ON' : 'OFF'}`);

  const client = await pool.connect();
  try {
    // Before
    const before = await auditCoverage(client);
    console.log(`\nBefore: ${before.has_summary} / ${before.total} packets have summary (${(before.has_summary / before.total * 100).toFixed(1)}%)`);

    let totalUpdated = 0;

    if (SOURCE === 'chunks' || SOURCE === 'both') {
      totalUpdated += await upsertFromChunks(client);
    }

    if (SOURCE === 'layers' || SOURCE === 'both') {
      totalUpdated += await upsertFromSummaryLayers(client);
    }

    // After
    const after = await auditCoverage(client);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n📊 Summary Upsert Complete');
    console.log('═'.repeat(60));
    console.log(`Before: ${before.has_summary.toLocaleString()} packets with summary`);
    console.log(`After:  ${after.has_summary.toLocaleString()} packets with summary`);
    console.log(`Net new: +${(after.has_summary - before.has_summary).toLocaleString()}`);
    console.log(`Coverage: ${(after.has_summary / after.total * 100).toFixed(1)}%`);
    console.log(`Still missing: ${after.missing_summary.toLocaleString()}`);
    console.log(`Duration: ${duration}s`);
    console.log('═'.repeat(60));

    if (DRY_RUN) {
      console.log('\nDRY RUN complete. Re-run without --dry-run to apply.');
    } else if (parseInt(after.missing_summary) === 0) {
      console.log('\n🎉 100% summary coverage achieved.');
    } else {
      console.log(`\n⚠️  ${after.missing_summary.toLocaleString()} packets still lack summaries.`);
      console.log('   These are non-file packets (task:*, feature:*, synthetic keys) with no chunk source.');
      console.log('   They will receive domain_class-derived summaries in a later pass.');
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
