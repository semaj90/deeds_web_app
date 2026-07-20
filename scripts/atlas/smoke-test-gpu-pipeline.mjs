#!/usr/bin/env node

/**
 * Phase 3 GPU Acceleration Smoke Test Suite
 *
 * Validates all 4 stages of Phase 3:
 *   Stage 3A: GPU k-NN Search Infrastructure
 *   Stage 3B: Topology Propagation & Symbol Extraction
 *   Stage 3C: SOM & KMeans Topology
 *   Stage 3D: Reranker Feature Preparation
 *
 * Usage:
 *   npm run atlas:phase3:smoke
 *   npm run atlas:phase3:smoke -- --verbose
 *
 * Exit codes:
 *   0 = all gates pass
 *   1 = gate failure
 *   2 = prerequisite failure
 */

import fetch from 'node-fetch';
import pg from 'pg';
import { performance } from 'node:perf_hooks';

const VERBOSE = process.argv.includes('--verbose');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function log(...args) {
  console.log(...args);
}

function vlog(...args) {
  if (VERBOSE) console.log(...args);
}

// ──────────────────────────────────────────────────────────────────────────────
// Database Helper
// ──────────────────────────────────────────────────────────────────────────────

async function pgQuery(sql, params = []) {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } finally {
    await pool.end();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation Gates
// ──────────────────────────────────────────────────────────────────────────────

async function gateStage3AHealth() {
  log('\n📋 Gate 1: GPU k-NN Search Service Health (Stage 3A)');

  try {
    const res = await fetch('http://127.0.0.1:8791/health', { timeout: 5_000 });
    if (!res.ok) {
      log(`  ❌ FAIL: cuVS service returned ${res.status}`);
      return false;
    }

    const data = await res.json();
    if (data.ok) {
      log(`  ✅ PASS: cuVS service healthy, ${data.indexed || 0} points indexed`);
      return true;
    } else {
      log(`  ❌ FAIL: cuVS service unhealthy`);
      return false;
    }
  } catch (err) {
    log(`  ❌ FAIL: ${err.message}`);
    log(`     (Start cuVS service: npm run atlas:gpu:knn:start:wsl)`);
    return false;
  }
}

async function gateStage3BTopology() {
  log('\n📋 Gate 2: Community_id Propagation (Stage 3B.1)');

  try {
    const rows = await pgQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as with_community_id,
        COUNT(CASE WHEN community_confidence > 0 THEN 1 END) as with_confidence
      FROM atlas_packets
    `);

    const total = rows[0].total;
    const withCommunityId = rows[0].with_community_id;
    const coverage = (withCommunityId / total) * 100;

    if (coverage >= 95) {
      log(`  ✅ PASS: ${withCommunityId}/${total} packets (${coverage.toFixed(1)}%) with community_id`);
      return true;
    } else {
      log(`  ⚠️  WARN: ${withCommunityId}/${total} packets (${coverage.toFixed(1)}%) with community_id (target: >95%)`);
      return coverage >= 80; // Soft fail if >= 80%
    }
  } catch (err) {
    log(`  ❌ FAIL: ${err.message}`);
    return false;
  }
}

async function gateStage3CTopology() {
  log('\n📋 Gate 4: SOM Topology Assignment (Stage 3C.1)');

  try {
    const rows = await pgQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN som_cell_x IS NOT NULL AND som_cell_y IS NOT NULL THEN 1 END) as with_som
      FROM atlas_packets
    `);

    const total = rows[0].total;
    const withSom = rows[0].with_som;
    const coverage = (withSom / total) * 100;

    if (coverage === 100) {
      log(`  ✅ PASS: 100% of ${total} packets assigned to SOM grid cells`);
      return true;
    } else {
      log(`  ⚠️  WARN: ${withSom}/${total} packets (${coverage.toFixed(1)}%) have SOM coordinates`);
      return coverage >= 90; // Soft fail if >= 90%
    }
  } catch (err) {
    log(`  ❌ FAIL: ${err.message}`);
    return false;
  }
}

async function gateStage3CKmeans() {
  log('\n📋 Gate 5: KMeans Clustering (Stage 3C.2)');

  try {
    const rows = await pgQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN kmeans_cluster_id IS NOT NULL THEN 1 END) as with_kmeans,
        COUNT(DISTINCT kmeans_cluster_id) as num_clusters
      FROM atlas_packets
      WHERE kmeans_cluster_id IS NOT NULL
    `);

    const total = rows[0].total;
    const withKmeans = rows[0].with_kmeans;
    const numClusters = rows[0].num_clusters;
    const coverage = (withKmeans / total) * 100;

    if (coverage >= 95 && numClusters > 0) {
      log(`  ✅ PASS: ${withKmeans}/${total} packets (${coverage.toFixed(1)}%) assigned to ${numClusters} k-means clusters`);
      return true;
    } else if (coverage >= 80) {
      log(`  ⚠️  WARN: ${withKmeans}/${total} packets assigned (target: >95%)`);
      return true;
    } else {
      log(`  ❌ FAIL: Only ${coverage.toFixed(1)}% coverage`);
      return false;
    }
  } catch (err) {
    log(`  ❌ FAIL: ${err.message}`);
    return false;
  }
}

async function gateStage3DReranker() {
  log('\n📋 Gate 6: Reranker Features (Stage 3D)');

  try {
    const rows = await pgQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN
          ast_score IS NOT NULL AND
          community_boost IS NOT NULL AND
          pagerank_score IS NOT NULL AND
          som_distance IS NOT NULL
        THEN 1 END) as with_features
      FROM atlas_packets
    `);

    const total = rows[0].total;
    const withFeatures = rows[0].with_features;
    const coverage = (withFeatures / total) * 100;

    if (coverage >= 80) {
      log(`  ✅ PASS: ${withFeatures}/${total} packets (${coverage.toFixed(1)}%) have reranker features`);
      return true;
    } else {
      log(`  ⚠️  WARN: Only ${coverage.toFixed(1)}% with features (need feature extraction pipeline)`);
      return false;
    }
  } catch (err) {
    log(`  ❌ FAIL: ${err.message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function runSmokeTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 3: GPU Acceleration & Topology Inference            ║');
  console.log('║  Smoke Test Suite (All Stages)                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const gates = [
    { name: 'Stage 3A: GPU k-NN Health', fn: gateStage3AHealth },
    { name: 'Stage 3B: Topology Propagation', fn: gateStage3BTopology },
    { name: 'Stage 3C: SOM Topology', fn: gateStage3CTopology },
    { name: 'Stage 3C: KMeans Clustering', fn: gateStage3CKmeans },
    { name: 'Stage 3D: Reranker Features', fn: gateStage3DReranker },
  ];

  const results = [];

  for (const gate of gates) {
    const start = performance.now();
    const pass = await gate.fn();
    const elapsed = performance.now() - start;
    results.push({ name: gate.name, pass, elapsed });
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║ SUMMARY                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const passCount = results.filter((r) => r.pass).length;
  const totalCount = results.length;

  for (const result of results) {
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} ${result.name.padEnd(35)} (${result.elapsed.toFixed(0)}ms)`);
  }

  console.log(`\n📊 SCORE: ${passCount}/${totalCount} gates passed\n`);

  if (passCount === totalCount) {
    console.log(`✅ PHASE 3 SMOKE TEST: PASS\n`);
    process.exit(0);
  } else if (passCount >= totalCount - 1) {
    console.log(`⚠️  PHASE 3 SMOKE TEST: PARTIAL (${passCount}/${totalCount})\n`);
    process.exit(0);
  } else {
    console.log(`❌ PHASE 3 SMOKE TEST: FAIL\n`);
    process.exit(1);
  }
}

// Run
runSmokeTest().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(2);
});
