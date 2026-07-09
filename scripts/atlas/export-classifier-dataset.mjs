#!/usr/bin/env node
/**
 * Export classifier feature matrix for XGBoost training
 *
 * Builds feature vectors from atlas_packets + packet_vector_bundles + Neo4j signals
 * Target: best_retrieval_lane (qdrant-dense, neo4j-authority, som-topology, bm25-fallback)
 *
 * Features:
 *   pagerank (Neo4j authority)
 *   som_row, som_col (SOM grid position)
 *   community_id (Louvain community)
 *   days_old (freshness)
 *   has_content_vec, has_summary_vec, has_keyword_vec (vector coverage)
 *   graph_degree (Neo4j relationships)
 *   bm25_score (FTS match)
 *
 * Output: CSV for XGBoost training
 *
 * Usage:
 *   node scripts/atlas/export-classifier-dataset.mjs --dry-run
 *   node scripts/atlas/export-classifier-dataset.mjs --apply
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const OUTPUT_DIR = './classifier-datasets';
const OUTPUT_FILE = `${OUTPUT_DIR}/classifier-features-${new Date().toISOString().slice(0, 10)}.csv`;

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Export Classifier Dataset                                       ║');
console.log(`║  Mode: ${(APPLY ? 'APPLY' : 'DRY-RUN').padEnd(57)}║`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

async function main() {
  console.log('  Step 1: Query feature matrix from atlas_packets + signals...\n');

  const query = `
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.domain_class,
      ap.pagerank::float4 as pagerank,
      ap.som_row,
      ap.som_col,
      ap.community_id,
      EXTRACT(EPOCH FROM (NOW() - ap.updated_at)) / 86400.0 as days_old,

      -- Vector coverage indicators
      COALESCE(pvb.content_vector IS NOT NULL, false)::int as has_content_vec,
      COALESCE(pvb.summary_vector IS NOT NULL, false)::int as has_summary_vec,
      COALESCE(pvb.keyword_vector IS NOT NULL, false)::int as has_keyword_vec,

      -- Neo4j degree (stub - would be computed from Neo4j)
      0 as graph_degree,

      -- BM25 score (stub - would be computed from FTS)
      0.5 as bm25_score,

      -- Target: canonical lane assignment based on available signals
      CASE
        WHEN pvb.content_vector IS NOT NULL THEN 'qdrant-dense'
        WHEN ap.pagerank > 0.5 THEN 'neo4j-authority'
        WHEN ap.som_row IS NOT NULL THEN 'som-topology'
        ELSE 'bm25-fallback'
      END as best_retrieval_lane

    FROM atlas_packets ap
    LEFT JOIN packet_vector_bundles pvb ON pvb.packet_key = ap.packet_key
    WHERE ap.domain_class IS NOT NULL
    ORDER BY ap.packet_key
  `;

  const result = await pgPool.query(query);
  console.log(`  Loaded ${result.rows.length} packets with features\n`);

  if (DRY_RUN) {
    console.log('  DRY-RUN: Sample rows:\n');
    result.rows.slice(0, 5).forEach((row, i) => {
      console.log(`    ${i + 1}. ${row.packet_key} | domain=${row.domain_class} | pr=${row.pagerank.toFixed(2)} | lane=${row.best_retrieval_lane}`);
    });
    console.log(`\n  DRY-RUN: Would export ${result.rows.length} rows to ${OUTPUT_FILE}`);
    console.log('  Re-run with --apply to write CSV\n');
    await pgPool.end();
    return;
  }

  // Step 2: Write CSV
  console.log('  Step 2: Write CSV file...\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // CSV header
  const header = [
    'packet_key',
    'source_ref',
    'domain_class',
    'pagerank',
    'som_row',
    'som_col',
    'community_id',
    'days_old',
    'has_content_vec',
    'has_summary_vec',
    'has_keyword_vec',
    'graph_degree',
    'bm25_score',
    'best_retrieval_lane'
  ].join(',');

  const rows = result.rows.map(row => [
    row.packet_key,
    row.source_ref,
    row.domain_class,
    row.pagerank ?? '',
    row.som_row ?? '',
    row.som_col ?? '',
    row.community_id ?? '',
    (typeof row.days_old === 'number' ? row.days_old.toFixed(1) : ''),
    row.has_content_vec,
    row.has_summary_vec,
    row.has_keyword_vec,
    row.graph_degree,
    row.bm25_score,
    row.best_retrieval_lane
  ].map(v => `"${v}"`).join(','));

  const csv = [header, ...rows].join('\n');
  fs.writeFileSync(OUTPUT_FILE, csv);

  console.log(`  OK Exported ${result.rows.length} rows to ${OUTPUT_FILE}\n`);

  await pgPool.end();

  // Step 3: Summary stats
  const featureStats = {
    total_rows: result.rows.length,
    with_pagerank: result.rows.filter(r => r.pagerank > 0).length,
    with_content_vec: result.rows.filter(r => r.has_content_vec).length,
    with_summary_vec: result.rows.filter(r => r.has_summary_vec).length,
    with_keyword_vec: result.rows.filter(r => r.has_keyword_vec).length,
    with_som: result.rows.filter(r => r.som_row !== null).length,
    with_community: result.rows.filter(r => r.community_id !== null).length,
    domains: [...new Set(result.rows.map(r => r.domain_class))].length,
    lanes: [...new Set(result.rows.map(r => r.best_retrieval_lane))].length
  };

  console.log('  Feature coverage:\n');
  Object.entries(featureStats).forEach(([key, value]) => {
    const pct = (value / featureStats.total_rows * 100).toFixed(1);
    console.log(`    ${key.padEnd(25)}: ${String(value).padStart(5)} (${pct}%)`);
  });

  console.log('\n  Next steps:\n');
  console.log('    1. Review classifier-datasets/*.csv\n');
  console.log('    2. Train XGBoost: python scripts/atlas/train-xgboost-classifier.py --train\n');
  console.log('    3. Convert to ONNX for Go sidecar integration\n');
}

main().catch(err => { console.error('ERROR', err.message); process.exit(1); });
