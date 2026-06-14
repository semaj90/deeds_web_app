#!/usr/bin/env node
/**
 * Task 5: Feature Prune Report — Orphan Detection & Recommendations
 *
 * Analyzes packet_summaries for orphaned, stale, or duplicate features.
 * Generates recommendations for pruning Qdrant and consolidating Postgres.
 * Output: pruning-report-YYYY-MM-DD.json with safeguards and verification gates.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

/**
 * Detect orphaned packets (in Qdrant, not in Postgres)
 */
async function detectOrphans(pool) {
  try {
    const result = await pool.query(`
      SELECT
        ps.packet_key,
        ps.source_ref,
        ps.feature_id,
        ps.provenance,
        ps.created_at,
        COUNT(ap.packet_key) as postgres_match_count
      FROM packet_summaries ps
      LEFT JOIN atlas_packets ap ON ps.source_ref = ap.source_ref
      WHERE ps.provenance = 'qdrant' OR ap.packet_key IS NULL
      GROUP BY ps.packet_key, ps.source_ref, ps.feature_id, ps.provenance, ps.created_at
      HAVING COUNT(ap.packet_key) = 0
      ORDER BY ps.created_at DESC
      LIMIT 1000;
    `);

    const orphans = result.rows.map(row => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      provenance: row.provenance,
      discovered_at: row.created_at,
      action: 'INVESTIGATE', // User should verify before deletion
    }));

    console.log(`[prune] Found ${orphans.length} orphaned packets`);
    return orphans;
  } catch (err) {
    console.error('[prune] Orphan detection failed:', err.message);
    return [];
  }
}

/**
 * Detect stale packets (enriched >30 days ago, never updated)
 */
async function detectStale(pool) {
  try {
    const result = await pool.query(`
      SELECT
        ps.packet_key,
        ps.source_ref,
        ps.feature_id,
        ps.enriched_at,
        ps.created_at,
        COUNT(ps.packet_key) OVER (PARTITION BY ps.feature_id) as feature_packet_count
      FROM packet_summaries ps
      WHERE ps.enriched_at < NOW() - INTERVAL '30 days'
      ORDER BY ps.enriched_at ASC
      LIMIT 500;
    `);

    const stale = result.rows.map(row => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      enriched_at: row.enriched_at,
      days_old: Math.floor((new Date() - new Date(row.enriched_at)) / (1000 * 60 * 60 * 24)),
      feature_packet_count: row.feature_packet_count,
      action: 'RE_ENRICH', // Should be re-enriched with fresh Gemma4
    }));

    console.log(`[prune] Found ${stale.length} stale packets`);
    return stale;
  } catch (err) {
    console.error('[prune] Stale detection failed:', err.message);
    return [];
  }
}

/**
 * Detect duplicate packets (same source_ref, multiple summaries)
 */
async function detectDuplicates(pool) {
  try {
    const result = await pool.query(`
      SELECT
        source_ref,
        COUNT(*) as duplicate_count,
        ARRAY_AGG(packet_key) as packet_keys,
        ARRAY_AGG(enriched_at) as enriched_dates
      FROM packet_summaries
      GROUP BY source_ref
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 100;
    `);

    const duplicates = result.rows.map(row => ({
      source_ref: row.source_ref,
      count: row.duplicate_count,
      packet_keys: row.packet_keys,
      enriched_dates: row.enriched_dates,
      action: 'CONSOLIDATE', // Keep newest, archive others
    }));

    console.log(`[prune] Found ${duplicates.length} duplicate groups`);
    return duplicates;
  } catch (err) {
    console.error('[prune] Duplicate detection failed:', err.message);
    return [];
  }
}

/**
 * Generate summary statistics
 */
async function generateStats(pool) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(DISTINCT feature_id) as unique_features,
        COUNT(CASE WHEN summary_chunk IS NOT NULL THEN 1 END) as enriched_chunk,
        COUNT(CASE WHEN summary_file IS NOT NULL THEN 1 END) as enriched_file,
        COUNT(CASE WHEN summary_folder IS NOT NULL THEN 1 END) as enriched_folder,
        COUNT(CASE WHEN summary_feature IS NOT NULL THEN 1 END) as enriched_feature,
        COUNT(CASE WHEN summary_system IS NOT NULL THEN 1 END) as enriched_system,
        COUNT(CASE WHEN summary_chunk_embedding IS NOT NULL THEN 1 END) as embedded_chunk,
        COUNT(CASE WHEN provenance = 'postgres' THEN 1 END) as postgres_packets,
        COUNT(CASE WHEN provenance = 'qdrant' THEN 1 END) as qdrant_packets
      FROM packet_summaries;
    `);

    const stats = result.rows[0] || {};
    return {
      total_packets: stats.total_packets || 0,
      unique_features: stats.unique_features || 0,
      enrichment_coverage: {
        chunk: (stats.enriched_chunk || 0),
        file: (stats.enriched_file || 0),
        folder: (stats.enriched_folder || 0),
        feature: (stats.enriched_feature || 0),
        system: (stats.enriched_system || 0),
      },
      embedding_coverage: {
        chunk: (stats.embedded_chunk || 0),
      },
      provenance: {
        postgres: (stats.postgres_packets || 0),
        qdrant: (stats.qdrant_packets || 0),
      },
    };
  } catch (err) {
    console.error('[prune] Stats generation failed:', err.message);
    return {};
  }
}

/**
 * Main pipeline
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const startTime = Date.now();

  console.log('[feature-prune] Task 5: Feature Prune Report');
  console.log(`[feature-prune] Mode: ${dryRun ? 'DRY-RUN' : 'REPORT'}`);

  try {
    console.log('\n[step-1] Generate statistics');
    const stats = await generateStats(pool);
    console.log(`[prune] Total packets: ${stats.total_packets}`);
    console.log(`[prune] Unique features: ${stats.unique_features}`);

    console.log('\n[step-2] Detect orphaned packets');
    const orphans = await detectOrphans(pool);

    console.log('\n[step-3] Detect stale packets');
    const stale = await detectStale(pool);

    console.log('\n[step-4] Detect duplicate packets');
    const duplicates = await detectDuplicates(pool);

    // Generate report
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = path.join(REPORTS_DIR, `pruning-report-${timestamp}.json`);

    const report = {
      generatedAt: new Date().toISOString(),
      statistics: stats,
      findings: {
        orphaned_count: orphans.length,
        stale_count: stale.length,
        duplicate_groups: duplicates.length,
      },
      safeguards: {
        no_automatic_deletion: true,
        manual_review_required: true,
        backup_before_pruning: true,
        verify_qdrant_consistency: true,
      },
      recommendations: {
        orphans: {
          description: 'Packets in Qdrant but not in Postgres (parallel pipeline divergence)',
          action: 'INVESTIGATE_THEN_CONSOLIDATE',
          samples: orphans.slice(0, 10),
          total_affected: orphans.length,
        },
        stale: {
          description: 'Packets enriched >30 days ago, may need re-enrichment',
          action: 'RE_ENRICH_ON_DEMAND',
          samples: stale.slice(0, 10),
          total_affected: stale.length,
        },
        duplicates: {
          description: 'Multiple summaries for same source_ref, consolidation needed',
          action: 'KEEP_NEWEST_ARCHIVE_OTHERS',
          samples: duplicates.slice(0, 5),
          total_affected: duplicates.length,
        },
      },
      nextSteps: [
        '1. Review all findings in the samples above',
        '2. Verify Qdrant consistency (npm run atlas:qdrant:payload:debug)',
        '3. Decide on orphan consolidation strategy (back-sync, prune, or gate)',
        '4. Run manual deletions with confirmation',
        '5. Monitor enrichment pipeline for future divergence',
      ],
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n[export] ✅ Report written to ${reportPath}`);
    console.log(`[prune] Recommendations: ${orphans.length} orphans, ${stale.length} stale, ${duplicates.length} duplicates`);

    const elapsed = Date.now() - startTime;
    console.log(`\n[summary] Completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log('[summary] Review: docs/reports/pruning-report-*.json');
    console.log('[summary] Next: Manual review → consolidation strategy → apply fixes');
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
