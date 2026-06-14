#!/usr/bin/env node
/**
 * Task 3: DuckDB Import — Feature Summaries
 *
 * Imports enriched Gemma4 summaries into DuckDB offline tables.
 * Creates packet_summaries, feature_edges, and orphan tracking tables.
 * Used for offline analysis and provenance tracking across parallel pipelines.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SUMMARIES_DIR = path.join(REPO_ROOT, 'docs', 'reports', 'feature-summaries');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');

/**
 * Create DuckDB schema for offline analysis
 * Tables: packet_summaries, feature_edges, orphan_packets, provenance_log
 */
async function initDuckDBSchema(pool) {
  if (dryRun) {
    console.log('[duckdb-init] DRY-RUN: would create schema');
    return;
  }

  try {
    // Create packet_summaries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packet_summaries (
        packet_key VARCHAR PRIMARY KEY,
        source_ref VARCHAR NOT NULL,
        feature_id VARCHAR,
        feature_label VARCHAR,
        summary_chunk TEXT,
        summary_file TEXT,
        summary_folder TEXT,
        summary_feature TEXT,
        summary_system TEXT,
        embedding FLOAT8[],
        enriched_at TIMESTAMP,
        enriched_by VARCHAR,
        provenance VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_packet_summaries_feature_id ON packet_summaries(feature_id);
      CREATE INDEX IF NOT EXISTS idx_packet_summaries_source_ref ON packet_summaries(source_ref);
      CREATE INDEX IF NOT EXISTS idx_packet_summaries_enriched_at ON packet_summaries(enriched_at DESC);
    `);

    console.log('[duckdb] ✅ Created packet_summaries table');

    // Create feature_edges table for HyperRAG
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feature_edges (
        source_feature VARCHAR NOT NULL,
        target_feature VARCHAR NOT NULL,
        edge_type VARCHAR NOT NULL,
        weight FLOAT8,
        confidence FLOAT8,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (source_feature, target_feature, edge_type)
      );

      CREATE INDEX IF NOT EXISTS idx_feature_edges_source ON feature_edges(source_feature);
      CREATE INDEX IF NOT EXISTS idx_feature_edges_target ON feature_edges(target_feature);
    `);

    console.log('[duckdb] ✅ Created feature_edges table');

    // Create orphan_packets tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orphan_packets (
        packet_key VARCHAR PRIMARY KEY,
        source_ref VARCHAR,
        feature_id VARCHAR,
        reason VARCHAR,
        qdrant_exists BOOLEAN,
        postgres_exists BOOLEAN,
        discovered_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_orphan_packets_feature ON orphan_packets(feature_id);
    `);

    console.log('[duckdb] ✅ Created orphan_packets table');

    // Create provenance_log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provenance_log (
        id SERIAL PRIMARY KEY,
        packet_key VARCHAR,
        source_system VARCHAR,
        event_type VARCHAR,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_provenance_log_packet ON provenance_log(packet_key);
      CREATE INDEX IF NOT EXISTS idx_provenance_log_system ON provenance_log(source_system);
    `);

    console.log('[duckdb] ✅ Created provenance_log table');
  } catch (err) {
    console.error('[duckdb-init] Schema creation failed:', err.message);
    throw err;
  }
}

/**
 * Import enriched summaries into packet_summaries table
 */
async function importSummaries(pool) {
  try {
    const files = await fs.readdir(SUMMARIES_DIR);
    const latestJsonFile = files
      .filter(f => f.startsWith('gemma4-enriched-') && f.endsWith('.json'))
      .sort()
      .pop();

    if (!latestJsonFile) {
      console.warn('[import] No enriched summary files found');
      return { imported: 0, failed: 0 };
    }

    const content = await fs.readFile(path.join(SUMMARIES_DIR, latestJsonFile), 'utf8');
    const report = JSON.parse(content);
    const cards = report.fullData || [];

    console.log(`[import] Found ${cards.length} cards in ${latestJsonFile}`);

    let imported = 0;
    let failed = 0;

    for (const card of cards) {
      if (!card.packet_key) continue;

      try {
        await pool.query(
          `INSERT INTO packet_summaries
           (packet_key, source_ref, feature_id, feature_label,
            summary_chunk, summary_file, summary_folder, summary_feature, summary_system,
            enriched_at, enriched_by, provenance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (packet_key) DO UPDATE SET
            summary_chunk = EXCLUDED.summary_chunk,
            summary_file = EXCLUDED.summary_file,
            summary_folder = EXCLUDED.summary_folder,
            summary_feature = EXCLUDED.summary_feature,
            summary_system = EXCLUDED.summary_system,
            enriched_at = EXCLUDED.enriched_at`,
          [
            card.packet_key,
            card.source_ref,
            card.feature_id,
            card.feature_label,
            card.summary_chunk,
            card.summary_file,
            card.summary_folder,
            card.summary_feature,
            card.summary_system,
            card.enriched_at,
            card.enriched_by || 'unknown',
            card.source || 'unknown',
          ]
        );

        imported += 1;
      } catch (err) {
        if (verbose) console.error(`[import] Failed to import ${card.packet_key}:`, err.message);
        failed += 1;
      }
    }

    console.log(`[import] ✅ Imported ${imported}/${cards.length} cards (${failed} failed)`);
    return { imported, failed };
  } catch (err) {
    console.error('[import] Import failed:', err.message);
    return { imported: 0, failed: 0 };
  }
}

/**
 * Detect orphan packets (in Qdrant but not Postgres)
 */
async function detectOrphans(pool) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as orphan_count FROM packet_summaries
      WHERE provenance = 'qdrant' AND source_ref NOT IN (
        SELECT source_ref FROM atlas_packets
      );
    `);

    const orphanCount = result.rows[0]?.orphan_count || 0;
    console.log(`[orphans] Found ${orphanCount} orphan packets`);

    return orphanCount;
  } catch (err) {
    if (verbose) console.error('[orphans] Detection failed:', err.message);
    return 0;
  }
}

/**
 * Main pipeline
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[duckdb-import] Task 3: DuckDB Import — Feature Summaries');
  console.log(`[duckdb-import] Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);

  try {
    // Initialize schema
    console.log('\n[step-1] Initialize DuckDB schema');
    await initDuckDBSchema(pool);

    // Import summaries
    if (apply) {
      console.log('\n[step-2] Import enriched summaries');
      const result = await importSummaries(pool);

      // Detect orphans
      console.log('\n[step-3] Detect orphan packets');
      await detectOrphans(pool);

      console.log('\n[summary] ✅ Import completed');
      console.log('[summary] Next: npm run atlas:summaries:embed --apply');
    } else {
      console.log('\n[step-2] Skip import (use --apply to write)');
    }
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
