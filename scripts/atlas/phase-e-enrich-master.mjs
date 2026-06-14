#!/usr/bin/env node
/**
 * Phase E: Master Enrichment Orchestrator
 *
 * Sequence:
 * 1. Neo4j: USED_CONCEPT edges (Packet → Concept)
 * 2. Neo4j: SIMILAR_TOPOLOGY edges (Packet → Packet via SOM grid)
 * 3. Autoencoder: 768 → 64 latent dimensionality reduction
 * 4. SOM: 20×20 routing grid for hierarchical clustering
 * 5. Karpathy: GPU authority blending (PageRank + Attention + Authority)
 * 6. Redis cache: Store enrichment results for ACE retrieval
 *
 * Prerequisites:
 * - Phase D identity reconciliation complete (feature_id + feature_label at 100%)
 * - Postgres atlas_packets canonical (17,476 packets)
 * - Qdrant codebase_chunks_768 synced (52,606 points after cleanup)
 * - Neo4j ready (173K nodes, 341K SIMILAR_TOPOLOGY edges)
 *
 * Exit codes:
 * 0 = all lanes complete
 * 1 = critical lane failed
 */

import pg from 'pg';
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load .env from repo root
const __file = fileURLToPath(import.meta.url);
const __dir = dirname(__file);
const repoRoot = resolve(__dir, '..', '..');
config({ path: resolve(repoRoot, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const lane = process.argv.find(a => a.startsWith('--lane='))?.split('=')[1];

const lanes = [
  {
    name: 'neo4j-used-concept',
    script: 'phase-d-enrich-qdrant.mjs',
    args: [dryRun ? '--dry-run' : '--apply'],
    critical: false,
    description: 'Neo4j: USED_CONCEPT edges (Packet → Concept)'
  },
  {
    name: 'karpathy-authority',
    script: 'karpathy-gpu-enrich.mjs',
    args: [dryRun ? '--dry-run' : '--apply'],
    critical: true,
    description: 'Karpathy: GPU authority blending'
  }
];

// Deferred lanes (scripts not yet implemented)
const deferredLanes = [
  {
    name: 'autoencoder-train',
    script: 'train-autoencoder-768-64.mjs',
    description: 'Autoencoder: 768 → 64 latent (deferred)'
  },
  {
    name: 'som-topology',
    script: 'train-som-20x20.mjs',
    description: 'SOM: 20×20 routing grid (deferred)'
  },
  {
    name: 'redis-cache',
    script: 'cache-enrichment-results.mjs',
    description: 'Redis: Cache enrichment for ACE retrieval (deferred)'
  }
];

async function checkPrerequisites() {
  console.log('\n=== Checking Prerequisites ===\n');

  try {
    // Check Postgres canonical packets
    const pgRes = await pool.query('SELECT COUNT(*) as count FROM atlas_packets');
    const packetCount = parseInt(pgRes.rows[0].count);
    console.log(`✓ Postgres atlas_packets: ${packetCount} packets`);

    if (packetCount < 15000) {
      console.error(`✗ Insufficient packets: ${packetCount} < 15000 minimum`);
      return false;
    }

    // Check feature_id + feature_label alignment
    const alignRes = await pool.query(`
      SELECT
        SUM(CASE WHEN feature_id IS NOT NULL THEN 1 ELSE 0 END) as has_feature_id,
        SUM(CASE WHEN feature_label IS NOT NULL THEN 1 ELSE 0 END) as has_label,
        COUNT(*) as total
      FROM atlas_packets
    `);
    const { has_feature_id, has_label, total } = alignRes.rows[0];
    const fidCov = (parseInt(has_feature_id) / parseInt(total) * 100).toFixed(1);
    const labelCov = (parseInt(has_label) / parseInt(total) * 100).toFixed(1);

    console.log(`✓ feature_id coverage: ${fidCov}%`);
    console.log(`✓ feature_label coverage: ${labelCov}%`);

    if (fidCov < 95 || labelCov < 95) {
      console.error(`✗ Coverage below 95%: feature_id ${fidCov}%, feature_label ${labelCov}%`);
      return false;
    }

    console.log('\n✅ All prerequisites satisfied\n');
    return true;
  } catch (err) {
    console.error(`✗ Prerequisite check failed: ${err.message}`);
    return false;
  }
}

async function runLane(laneConfig) {
  return new Promise((resolve) => {
    console.log(`\n[${'▶'.repeat(3)}] ${laneConfig.description}`);
    console.log(`    Script: ${laneConfig.script}`);
    console.log(`    Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log('');

    // Scripts are in the same directory as this orchestrator (scripts/atlas/)
    const scriptPath = `${__dir}/${laneConfig.script}`;

    const child = spawn('node', [scriptPath, ...laneConfig.args], {
      stdio: verbose ? 'inherit' : 'pipe',
      timeout: 600000 // 10 minutes
    });

    let output = '';
    let errorOutput = '';

    if (!verbose) {
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[${'✓'.repeat(3)}] ${laneConfig.name} complete`);
      } else {
        console.error(`[${'✗'.repeat(3)}] ${laneConfig.name} failed (exit ${code})`);
        if (!verbose && errorOutput) {
          console.error(errorOutput.slice(0, 500));
        }
      }

      resolve({
        lane: laneConfig.name,
        code,
        critical: laneConfig.critical,
        output
      });
    });

    child.on('error', (err) => {
      console.error(`[${'✗'.repeat(3)}] ${laneConfig.name} error: ${err.message}`);
      resolve({
        lane: laneConfig.name,
        code: 1,
        critical: laneConfig.critical,
        error: err.message
      });
    });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Phase E: Enrichment Master Orchestrator     ║');
  console.log('║  Identity → Topology → Ranking               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nMode: ${dryRun ? 'DRY-RUN (preview only)' : 'APPLY (live updates)'}`);

  // Check prerequisites
  const prereqOk = await checkPrerequisites();
  if (!prereqOk) {
    process.exit(1);
  }

  // Filter lanes if --lane specified
  const lanesToRun = lane
    ? lanes.filter(l => l.name === lane)
    : lanes;

  if (lanesToRun.length === 0) {
    console.error(`Lane '${lane}' not found`);
    console.log('Available lanes:', lanes.map(l => l.name).join(', '));
    process.exit(1);
  }

  console.log(`\n=== Running ${lanesToRun.length} lane(s) ===`);

  const results = [];
  for (const laneConfig of lanesToRun) {
    const result = await runLane(laneConfig);
    results.push(result);

    if (result.code !== 0 && result.critical) {
      console.error(`\n⚠️  Critical lane failed: ${result.lane}`);
      console.error('Stopping enrichment pipeline');
      process.exit(1);
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Phase E Summary                             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.code === 0).length;
  const failed = results.filter(r => r.code !== 0).length;

  results.forEach(r => {
    const status = r.code === 0 ? '✅' : '❌';
    console.log(`${status} ${r.lane}`);
  });

  if (deferredLanes.length > 0) {
    console.log('\n=== Deferred Lanes (not yet implemented) ===\n');
    deferredLanes.forEach(l => {
      console.log(`⏳ ${l.name}`);
      console.log(`   ${l.description}`);
    });
  }

  console.log(`\n${passed} passed, ${failed} failed, ${deferredLanes.length} deferred\n`);

  if (failed > 0 && !dryRun) {
    console.log('⚠️  Some lanes failed. Review logs above.');
    process.exit(1);
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Orchestrator error:', err);
  process.exit(1);
});
