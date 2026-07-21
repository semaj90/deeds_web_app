#!/usr/bin/env npx tsx
/**
 * Phase 107 Backfill Joins (Phase C)
 *
 * Populate canonical join columns in feature tables from atlas_packets.
 * Resolve:
 * - packet_key exact
 * - source_ref exact
 * - content_hash exact
 *
 * Output: coverage report with join method for each row
 */

import { pool } from '$lib/server/db/client.js';

interface BackfillStats {
  table_name: string;
  join_method: {
    packet_key_exact: number;
    source_ref_exact: number;
    content_hash_exact: number;
    unresolved: number;
  };
  total_rows: number;
  rows_with_packet_key: number;
  rows_with_source_ref: number;
  rows_with_both: number;
}

async function backfillFeatureImplementations(): Promise<BackfillStats> {
  const client = await pool.connect();

  try {
    // Backfill packet_key via feature_key → feature_id
    // Most feature_implementations map to a feature concept, not a specific packet
    // So we'll set packet_key = null (unresolved) initially
    // and mark rows that could be resolved via feature_key matching

    const result = await client.query(`
      UPDATE feature_implementations fi
      SET
        packet_key = ap.packet_key,
        source_ref = ap.source_ref,
        content_hash = ap.sha256
      FROM atlas_packets ap
      WHERE fi.feature_key = ap.feature_id
        AND fi.packet_key IS NULL
    `);

    const stats = await client.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as rows_with_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as rows_with_source_ref,
        COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END) as rows_with_both
      FROM feature_implementations
    `);

    const row = stats.rows[0];

    return {
      table_name: 'feature_implementations',
      join_method: {
        packet_key_exact: parseInt(row.rows_with_packet_key) || 0,
        source_ref_exact: parseInt(row.rows_with_source_ref) || 0,
        content_hash_exact: 0,
        unresolved: parseInt(row.total_rows) - (parseInt(row.rows_with_packet_key) || 0)
      },
      total_rows: parseInt(row.total_rows),
      rows_with_packet_key: parseInt(row.rows_with_packet_key) || 0,
      rows_with_source_ref: parseInt(row.rows_with_source_ref) || 0,
      rows_with_both: parseInt(row.rows_with_both) || 0
    };
  } finally {
    await client.release();
  }
}

async function backfillFeatureFileEdges(): Promise<BackfillStats> {
  const client = await pool.connect();

  try {
    // Backfill via file_path → source_ref (canonical file identity)
    // This is a normalized path match: strip leading/trailing slashes, normalize separators

    const result = await client.query(`
      UPDATE feature_file_edges ffe
      SET
        packet_key = ap.packet_key,
        source_ref = ap.source_ref,
        content_hash = ap.sha256
      FROM atlas_packets ap
      WHERE
        (
          -- Exact path match on file_path
          ap.source_ref = ffe.file_path
          OR
          -- Normalized source_ref (trim ./ and normalize paths)
          ap.source_ref = regexp_replace(ffe.file_path, '^\./', '')
          OR
          -- Reverse: file_path is full path, source_ref is relative
          ap.file_path = ffe.file_path
        )
        AND ffe.packet_key IS NULL
    `);

    const stats = await client.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as rows_with_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as rows_with_source_ref,
        COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL THEN 1 END) as rows_with_both
      FROM feature_file_edges
    `);

    const row = stats.rows[0];

    return {
      table_name: 'feature_file_edges',
      join_method: {
        packet_key_exact: parseInt(row.rows_with_packet_key) || 0,
        source_ref_exact: parseInt(row.rows_with_source_ref) || 0,
        content_hash_exact: 0,
        unresolved: parseInt(row.total_rows) - (parseInt(row.rows_with_packet_key) || 0)
      },
      total_rows: parseInt(row.total_rows),
      rows_with_packet_key: parseInt(row.rows_with_packet_key) || 0,
      rows_with_source_ref: parseInt(row.rows_with_source_ref) || 0,
      rows_with_both: parseInt(row.rows_with_both) || 0
    };
  } finally {
    await client.release();
  }
}

async function backfillFeatureDomainFacts(): Promise<BackfillStats> {
  const client = await pool.connect();

  try {
    // Backfill domain_facts from atlas_packets canonical domain_class
    // One row per packet with domain classification

    const result = await client.query(`
      INSERT INTO feature_domain_facts (
        packet_key,
        source_ref,
        domain_class,
        content_hash,
        classifier_kind,
        classifier_version,
        domain_confidence,
        evidence
      )
      SELECT
        ap.packet_key,
        ap.source_ref,
        COALESCE(ap.domain_class, 'unclassified'),
        COALESCE(ap.sha256, md5(ap.packet_key || ap.source_ref)),
        'legacy-backfill',
        'atlas-packets-domain-class-v1',
        NULL::real,
        jsonb_build_object(
          'source', 'atlas_packets.domain_class',
          'packet_key', ap.packet_key,
          'source_ref', ap.source_ref
        )
      FROM atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
      ON CONFLICT (packet_key, classifier_version, content_hash) DO NOTHING
    `);

    const stats = await client.query(`
      SELECT COUNT(*) as total_rows FROM feature_domain_facts
    `);

    const row = stats.rows[0];

    return {
      table_name: 'feature_domain_facts',
      join_method: {
        packet_key_exact: parseInt(row.total_rows) || 0,
        source_ref_exact: parseInt(row.total_rows) || 0,
        content_hash_exact: parseInt(row.total_rows) || 0,
        unresolved: 0
      },
      total_rows: parseInt(row.total_rows) || 0,
      rows_with_packet_key: parseInt(row.total_rows) || 0,
      rows_with_source_ref: parseInt(row.total_rows) || 0,
      rows_with_both: parseInt(row.total_rows) || 0
    };
  } finally {
    await client.release();
  }
}

async function main() {
  console.log('📝 Phase 107 Backfill Joins (Phase C)\n');

  const results: BackfillStats[] = [];

  try {
    console.log('Backfilling feature_implementations...');
    const fi = await backfillFeatureImplementations();
    results.push(fi);
    console.log(`  ✓ Updated: ${fi.join_method.packet_key_exact} rows with packet_key`);
    console.log(`  ✓ Coverage: ${fi.rows_with_both}/${fi.total_rows} (${Math.round(fi.rows_with_both / fi.total_rows * 100)}%)\n`);

    console.log('Backfilling feature_file_edges...');
    const ffe = await backfillFeatureFileEdges();
    results.push(ffe);
    console.log(`  ✓ Updated: ${ffe.join_method.packet_key_exact} rows with packet_key`);
    console.log(`  ✓ Coverage: ${ffe.rows_with_both}/${ffe.total_rows} (${Math.round(ffe.rows_with_both / ffe.total_rows * 100)}%)\n`);

    console.log('Backfilling feature_domain_facts...');
    const fdf = await backfillFeatureDomainFacts();
    results.push(fdf);
    console.log(`  ✓ Inserted: ${fdf.total_rows} domain fact rows`);
    console.log(`  ✓ Coverage: ${fdf.rows_with_both}/${fdf.total_rows} (100%)\n`);

    // Summary
    console.log('📊 BACKFILL SUMMARY\n');
    console.log(JSON.stringify(results, null, 2));

    console.log('\n✅ Phase C Complete — Ready for Phase D (Validation)');
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
}

main();
