#!/usr/bin/env node
/**
 * Phase D Gate: Tree Node Audit
 *
 * Validates tree node ingestion before Phase D Qdrant enrichment.
 * Gate PASS conditions:
 * - atlas_tree_nodes row_count > 0
 * - node_id uniqueness verified
 * - source_ref links to atlas_packets
 * - tree structure integrity (no orphaned nodes)
 * - max depth reasonable
 */

import pg from 'pg';

const { Pool } = pg;

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

/**
 * Run audit checks
 */
async function auditTreeNodes(pool) {
  const results = {
    checks: {},
    gate_pass: false,
    errors: [],
  };

  try {
    // Check 1: Row count > 0
    console.log('[audit] Check 1: Row count > 0');
    const countRes = await pool.query('SELECT COUNT(*) as count FROM atlas_tree_nodes');
    const rowCount = countRes.rows[0]?.count || 0;

    results.checks.row_count = rowCount;
    if (rowCount > 0) {
      console.log(`✅ ${rowCount} tree nodes present`);
    } else {
      console.log('❌ No tree nodes found');
      results.errors.push('Empty atlas_tree_nodes table');
    }

    // Check 2: node_id uniqueness
    console.log('\n[audit] Check 2: node_id uniqueness');
    const uniqueRes = await pool.query(`
      SELECT COUNT(DISTINCT node_id) as unique_count FROM atlas_tree_nodes;
    `);
    const uniqueCount = uniqueRes.rows[0]?.unique_count || 0;

    results.checks.unique_node_ids = uniqueCount === rowCount;
    if (uniqueCount === rowCount) {
      console.log('✅ All node_ids are unique');
    } else {
      console.log(`❌ Duplicate node_ids detected: ${rowCount} total vs ${uniqueCount} unique`);
      results.errors.push('Duplicate node_ids');
    }

    // Check 3: source_ref links to packets
    console.log('\n[audit] Check 3: source_ref links to atlas_packets');
    const linkRes = await pool.query(`
      SELECT
        COUNT(*) as with_source_ref,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as linked_to_packets
      FROM atlas_tree_nodes
      WHERE source_ref IS NOT NULL;
    `);
    const withSourceRef = linkRes.rows[0]?.with_source_ref || 0;
    const linkedPackets = linkRes.rows[0]?.linked_to_packets || 0;

    results.checks.source_ref_linkage = (linkedPackets / Math.max(withSourceRef, 1) * 100).toFixed(1) + '%';
    const linkagePercent = (linkedPackets / Math.max(withSourceRef, 1)) * 100;
    console.log(`✅ ${linkedPackets}/${withSourceRef} nodes linked to packets (${results.checks.source_ref_linkage})`);

    // Check 4: Tree structure integrity
    console.log('\n[audit] Check 4: Tree structure integrity');
    const orphanRes = await pool.query(`
      SELECT COUNT(*) as orphaned_count
      FROM atlas_tree_nodes t
      WHERE t.parent_id IS NOT NULL
      AND t.parent_id NOT IN (SELECT node_id FROM atlas_tree_nodes);
    `);
    const orphanedCount = orphanRes.rows[0]?.orphaned_count || 0;

    results.checks.orphaned_nodes = orphanedCount;
    if (orphanedCount === 0) {
      console.log('✅ No orphaned nodes (all parents exist)');
    } else {
      console.log(`❌ ${orphanedCount} orphaned nodes detected`);
      results.errors.push(`${orphanedCount} orphaned nodes`);
    }

    // Check 5: Max depth reasonable
    console.log('\n[audit] Check 5: Tree depth sanity');
    const depthRes = await pool.query(`
      WITH RECURSIVE path AS (
        SELECT node_id, parent_id, 1 as depth
        FROM atlas_tree_nodes
        WHERE parent_id IS NULL
        UNION ALL
        SELECT tn.node_id, tn.parent_id, p.depth + 1
        FROM atlas_tree_nodes tn
        JOIN path p ON tn.parent_id = p.node_id
        WHERE p.depth < 100
      )
      SELECT MAX(depth) as max_depth, COUNT(*) as node_count FROM path;
    `);
    const maxDepth = depthRes.rows[0]?.max_depth || 0;

    results.checks.max_tree_depth = maxDepth;
    if (maxDepth > 0 && maxDepth <= 50) {
      console.log(`✅ Tree depth: ${maxDepth} (reasonable)`);
    } else if (maxDepth > 50) {
      console.log(`❌ Tree depth: ${maxDepth} (too deep, possible cycle)`);
      results.errors.push('Tree depth > 50');
    } else {
      console.log('❌ Unable to compute tree depth');
      results.errors.push('Tree depth computation failed');
    }

    // Check 6: Feature ID coverage
    console.log('\n[audit] Check 6: Feature ID coverage');
    const featureRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id
      FROM atlas_tree_nodes;
    `);
    const totalNodes = featureRes.rows[0]?.total || 0;
    const withFeatureId = featureRes.rows[0]?.with_feature_id || 0;
    const featureCoverage = (withFeatureId / Math.max(totalNodes, 1) * 100).toFixed(1);

    results.checks.feature_id_coverage = featureCoverage + '%';
    console.log(`✅ Feature ID coverage: ${withFeatureId}/${totalNodes} (${featureCoverage}%)`);

    // Determine gate pass/fail
    console.log('\n[audit] Gate Decision');
    const gatePass =
      rowCount > 0 &&
      uniqueCount === rowCount &&
      orphanedCount === 0 &&
      maxDepth > 0 &&
      maxDepth <= 50 &&
      linkagePercent >= 50; // At least 50% of nodes linked

    results.gate_pass = gatePass;

    if (gatePass) {
      console.log('✅ GATE PASS — Tree nodes ready for Phase D Qdrant enrichment');
    } else {
      console.log('❌ GATE FAIL — Fix issues above before proceeding');
    }

    // Summary
    console.log('\n[summary] Tree Node Audit Report');
    console.log(JSON.stringify(results, null, 2));

    return gatePass;
  } catch (err) {
    console.error('[error]', err.message);
    results.errors.push(err.message);
    return false;
  }
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[tree-audit] Phase D Gate: Tree Node Audit\n');

  try {
    const gatePassed = await auditTreeNodes(pool);
    process.exit(gatePassed ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main();
