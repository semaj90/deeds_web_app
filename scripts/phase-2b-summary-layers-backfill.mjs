#!/usr/bin/env node

/**
 * Phase 2B: Summary Projection → atlas_summary_layers
 *
 * Projects chunk summaries from codebase_chunk_index into atlas_summary_layers,
 * using a deterministic priority hierarchy (no blind overwrites):
 *
 * Priority (highest wins):
 *   1. existing atlas_summary_layers row with summary (already promoted — skip)
 *   2. longest chunk summary per source_ref group (deterministic representative)
 *
 * For multi-chunk files (21+ chunks is the common case), uses the longest
 * individual chunk summary as the representative. Does NOT concatenate summaries
 * (would exceed token budgets and lose semantic coherence).
 *
 * Writes to atlas_summary_layers with layer_type='chunk_projection',
 * preserving packet_key FK integrity (cascade-safe).
 *
 * Usage:
 *   node scripts/phase-2b-summary-layers-backfill.mjs [--dry-run] [--verbose] [--limit 500]
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
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
  max: 5,
});

async function main() {
  const startTime = Date.now();
  console.log('📋 Phase 2B: Summary Projection → atlas_summary_layers\n');
  console.log(`Mode:  ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT > 0 ? LIMIT : 'all rows'}`);

  const client = await pool.connect();
  try {
    // ── Count available promotions ─────────────────────────────────────────
    const countRes = await client.query(`
      SELECT COUNT(DISTINCT ap.packet_key) AS promotable
      FROM atlas_packets ap
      JOIN codebase_chunk_index ci
        ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
      WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
        AND NOT EXISTS (
          SELECT 1 FROM atlas_summary_layers sl
          WHERE sl.packet_key = ap.packet_key
            AND sl.layer_type = 'chunk_projection'
            AND sl.summary IS NOT NULL AND length(sl.summary) > 20
        )
    `);
    const promotable = parseInt(countRes.rows[0].promotable);
    console.log(`\nPackets eligible for projection: ${promotable.toLocaleString()}`);

    // Check existing atlas_summary_layers state
    const existingRes = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE layer_type = 'chunk_projection') AS chunk_projection,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND length(summary) > 20) AS has_summary
      FROM atlas_summary_layers
    `);
    const ex = existingRes.rows[0];
    console.log(`Existing atlas_summary_layers: ${parseInt(ex.total).toLocaleString()} rows ` +
      `(${parseInt(ex.chunk_projection)} chunk_projection, ${parseInt(ex.has_summary)} with summary)\n`);

    if (promotable === 0) {
      console.log('✅ All eligible packets already have chunk_projection summaries.');
      return;
    }

    if (DRY_RUN) {
      // Show sample of what would be projected
      const sample = await client.query(`
        SELECT
          ap.packet_key,
          ap.source_ref,
          ap.feature_id,
          COUNT(ci.chunk_id) AS chunk_count,
          length(
            (array_agg(ci.summary ORDER BY length(ci.summary) DESC NULLS LAST))[1]
          ) AS representative_len
        FROM atlas_packets ap
        JOIN codebase_chunk_index ci
          ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
        WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
          AND NOT EXISTS (
            SELECT 1 FROM atlas_summary_layers sl
            WHERE sl.packet_key = ap.packet_key
              AND sl.layer_type = 'chunk_projection'
              AND sl.summary IS NOT NULL AND length(sl.summary) > 20
          )
        GROUP BY ap.packet_key, ap.source_ref, ap.feature_id
        ORDER BY COUNT(ci.chunk_id) DESC
        LIMIT 10
      `);
      console.log('Sample packets that would be projected (top by chunk count):');
      for (const r of sample.rows) {
        console.log(`  [${r.chunk_count} chunks] ${r.source_ref.slice(0, 65)}`);
        console.log(`    packet_key=${r.packet_key}  representative=${r.representative_len} chars`);
      }
      console.log(`\nWould insert up to ${LIMIT > 0 ? Math.min(LIMIT, promotable) : promotable} rows into atlas_summary_layers.`);
      console.log('Re-run without --dry-run to apply.');
      return;
    }

    // ── Build and insert in batches ────────────────────────────────────────
    // Fetch the representative (longest) chunk summary per packet, excluding
    // packets that already have a chunk_projection row.
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const candidates = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.domain_class,
        COUNT(ci.chunk_id) AS chunk_count,
        (array_agg(ci.summary ORDER BY length(ci.summary) DESC NULLS LAST))[1] AS representative_summary
      FROM atlas_packets ap
      JOIN codebase_chunk_index ci
        ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
      WHERE ci.summary IS NOT NULL AND length(ci.summary) > 20
        AND NOT EXISTS (
          SELECT 1 FROM atlas_summary_layers sl
          WHERE sl.packet_key = ap.packet_key
            AND sl.layer_type = 'chunk_projection'
            AND sl.summary IS NOT NULL AND length(sl.summary) > 20
        )
      GROUP BY ap.packet_key, ap.source_ref, ap.feature_id, ap.domain_class
      ORDER BY ap.packet_key
      ${limitClause}
    `);

    console.log(`Fetched ${candidates.rows.length.toLocaleString()} candidates. Inserting in batches of ${BATCH_SIZE}...`);

    let inserted = 0;
    let skipped  = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < candidates.rows.length; i += BATCH_SIZE) {
      const batch = candidates.rows.slice(i, i + BATCH_SIZE);

      const packetKeys    = batch.map(r => r.packet_key);
      const sourceRefs    = batch.map(r => r.source_ref);
      const featureIds    = batch.map(r => r.feature_id);
      const summaries     = batch.map(r => r.representative_summary);
      const chunkCounts   = batch.map(r => parseInt(r.chunk_count));

      // atlas_summary_layers has no unique constraint, so ON CONFLICT is unavailable.
      // Use INSERT ... SELECT with NOT EXISTS guard — same idempotency guarantee,
      // lets Postgres do the existence check atomically per row in one round-trip.
      try {
        const res = await client.query(`
          INSERT INTO atlas_summary_layers (
            packet_key, source_ref, feature_id,
            layer_type, summary_level, summary,
            metadata, generated_at, created_at, updated_at
          )
          SELECT
            v.packet_key,
            v.source_ref,
            v.feature_id,
            'chunk_projection',
            'file',
            v.summary,
            jsonb_build_object(
              'chunk_count',     v.chunk_count::int,
              'strategy',        'longest_chunk',
              'source',          'codebase_chunk_index',
              'projection_run',  $1::text
            ),
            $2::timestamptz,
            NOW(),
            NOW()
          FROM (
            SELECT
              unnest($3::text[]) AS packet_key,
              unnest($4::text[]) AS source_ref,
              unnest($5::text[]) AS feature_id,
              unnest($6::text[]) AS summary,
              unnest($7::int[])  AS chunk_count
          ) v
          WHERE NOT EXISTS (
            SELECT 1 FROM atlas_summary_layers sl
            WHERE sl.packet_key = v.packet_key
              AND sl.layer_type = 'chunk_projection'
              AND sl.summary IS NOT NULL AND length(sl.summary) > 20
          )
        `, [now, now, packetKeys, sourceRefs, featureIds, summaries, chunkCounts]);

        inserted += res.rowCount ?? 0;
      } catch (err) {
        if (VERBOSE) console.error(`  Batch error at ${i}: ${err.message}`);
        skipped += batch.length;
      }

      if (!VERBOSE) {
        process.stdout.write(`\r  Inserted: ${inserted.toLocaleString()} / ${candidates.rows.length.toLocaleString()} ...`);
      }
    }
    if (!VERBOSE) console.log('');

    // ── Verify ──────────────────────────────────────────────────────────────
    const verifyRes = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE layer_type = 'chunk_projection') AS chunk_projection,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND length(summary) > 20) AS has_summary
      FROM atlas_summary_layers
    `);
    const v = verifyRes.rows[0];

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Summary Projection Complete');
    console.log('═'.repeat(60));
    console.log(`Inserted:               ${inserted.toLocaleString()} rows`);
    console.log(`Skipped/errors:         ${skipped}`);
    console.log(`atlas_summary_layers:   ${parseInt(v.total).toLocaleString()} total`);
    console.log(`  chunk_projection:     ${parseInt(v.chunk_projection).toLocaleString()}`);
    console.log(`  has summary:          ${parseInt(v.has_summary).toLocaleString()}`);
    console.log(`Duration:               ${duration}s`);
    console.log('═'.repeat(60));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
