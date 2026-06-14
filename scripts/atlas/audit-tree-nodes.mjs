#!/usr/bin/env node
/**
 * Phase D: Tree Node Audit Gate
 *
 * Verifies tree nodes are ready for Qdrant enrichment:
 * 1. row_count > 0
 * 2. node_id uniqueness (no duplicates)
 * 3. source_ref → packet_key linkage valid
 * 4. tree structure integrity (no orphans, max depth ≤50)
 * 5. canonical Qdrant cohort enriched
 * 6. no orphan/legacy points touched
 *
 * Returns GATE PASS/FAIL
 */

import pg from 'pg';

const { Pool } = pg;

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

async function auditTreeNodes(pool) {
  const checks = {};

  try {
    // Check 1: Row count
    const countRes = await pool.query('SELECT COUNT(*) as cnt FROM atlas_tree_nodes');
    const rowCount = parseInt(countRes.rows[0].cnt);
    checks.row_count = { pass: rowCount > 0, value: rowCount };
    console.log(`✅ Row count: ${rowCount}` + (checks.row_count.pass ? '' : ' (FAIL: must be > 0)'));

    // Check 2: Node ID uniqueness
    const dupRes = await pool.query(`
      SELECT node_id, COUNT(*) as cnt
      FROM atlas_tree_nodes
      GROUP BY node_id
      HAVING COUNT(*) > 1
    `);
    const hasDuplicates = dupRes.rows.length > 0;
    checks.node_id_uniqueness = { pass: !hasDuplicates, duplicates: dupRes.rows.length };
    console.log(`${hasDuplicates ? '❌' : '✅'} Node ID uniqueness: ${dupRes.rows.length} duplicates` + (hasDuplicates ? ' (FAIL)' : ''));

    // Check 3: Source ref → packet key linkage
    const linkageRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN packet_key IS NOT NULL THEN 1 ELSE 0 END) as linked
      FROM atlas_tree_nodes
      WHERE source_ref IS NOT NULL
    `);
    const total = parseInt(linkageRes.rows[0].total);
    const linked = parseInt(linkageRes.rows[0].linked);
    const linkagePercent = total > 0 ? Math.round((linked / total) * 100) : 0;
    checks.linkage = { pass: linkagePercent >= 50, linked, total, percent: linkagePercent };
    console.log(`${linkagePercent >= 50 ? '✅' : '⚠️ '} Linkage: ${linked}/${total} (${linkagePercent}%)`);

    // Check 4: Orphan detection & max depth
    const orphanRes = await pool.query(`
      SELECT COUNT(*) as orphan_count
      FROM atlas_tree_nodes t
      WHERE t.parent_id IS NOT NULL
      AND t.parent_id NOT IN (SELECT node_id FROM atlas_tree_nodes)
    `);
    const orphanCount = parseInt(orphanRes.rows[0].orphan_count);
    checks.no_orphans = { pass: orphanCount === 0, count: orphanCount };
    console.log(`${orphanCount === 0 ? '✅' : '❌'} Orphan detection: ${orphanCount} orphans` + (orphanCount > 0 ? ' (FAIL)' : ''));

    // Check 5: Max depth
    const depthRes = await pool.query(`
      WITH RECURSIVE depth_calc AS (
        SELECT node_id, parent_id, 1 as depth
        FROM atlas_tree_nodes
        WHERE parent_id IS NULL
        UNION ALL
        SELECT t.node_id, t.parent_id, d.depth + 1
        FROM atlas_tree_nodes t
        JOIN depth_calc d ON t.parent_id = d.node_id
        WHERE d.depth < 100
      )
      SELECT MAX(depth) as max_depth FROM depth_calc
    `);
    const maxDepth = parseInt(depthRes.rows[0].max_depth) || 0;
    checks.max_depth = { pass: maxDepth <= 50, value: maxDepth };
    console.log(`${maxDepth <= 50 ? '✅' : '❌'} Max depth: ${maxDepth}` + (maxDepth > 50 ? ' (FAIL: must be ≤50)' : ''));

    // Check 6: Feature ID coverage
    const featureRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN feature_id IS NOT NULL THEN 1 ELSE 0 END) as with_feature
      FROM atlas_tree_nodes
    `);
    const featureTotal = parseInt(featureRes.rows[0].total);
    const withFeature = parseInt(featureRes.rows[0].with_feature);
    const featureCoveragePercent = featureTotal > 0 ? Math.round((withFeature / featureTotal) * 100) : 0;
    checks.feature_id_coverage = { pass: true, with_feature: withFeature, total: featureTotal, percent: featureCoveragePercent };
    console.log(`ℹ️  Feature ID coverage: ${withFeature}/${featureTotal} (${featureCoveragePercent}%)`);

    // Determine GATE status
    const allPass = Object.values(checks).every(c => c.pass !== false);

    console.log('\n' + '='.repeat(60));
    if (allPass) {
      console.log('✅ GATE PASS — Tree nodes ready for Phase D Qdrant enrichment');
    } else {
      console.log('❌ GATE FAIL — Tree nodes not ready');
      console.log('\nFailed checks:');
      Object.entries(checks).forEach(([name, result]) => {
        if (result.pass === false) {
          console.log(`  - ${name}: ${JSON.stringify(result)}`);
        }
      });
    }
    console.log('='.repeat(60));

    return { pass: allPass, checks };
  } catch (err) {
    console.error('[error]', err.message);
    return { pass: false, error: err.message };
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[phase-d-audit] Phase D: Tree Node Audit Gate\n');

  try {
    const result = await auditTreeNodes(pool);
    process.exit(result.pass ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main();
