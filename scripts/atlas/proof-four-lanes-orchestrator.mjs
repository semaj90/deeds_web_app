#!/usr/bin/env node
/**
 * Four-Lane Proof-of-Truth Orchestrator
 *
 * MISSION: Validate the complete proof-of-truth pipeline across all four lanes:
 * 1. REPLAY LANE: Historical query replay validates identity + behavior consistency
 * 2. CACHE LANE: BitFrost + Redis cache proof validates L1-L3 consistency
 * 3. PROVENANCE LANE: Packet lineage materialization validates source_ref → feature_id → community_id chain
 * 4. TELEMETRY LANE: Evidence quality assessment validates breadth/depth/signals/tracing
 *
 * All 4 lanes must PASS for proof-of-truth to complete.
 * Each lane runs independently; results aggregated at end.
 */

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');

const LANES = [
  {
    number: 1,
    name: 'REPLAY',
    script: 'scripts/atlas/run-replay-breadth-50.mjs',
    description: 'Historical query replay (identity + behavior consistency)',
    timeout: 120000
  },
  {
    number: 2,
    name: 'CACHE',
    script: 'scripts/atlas/audit-cache-namespace-proof.mjs',
    description: 'BitFrost + Redis cache proof (L1-L3 consistency)',
    timeout: 60000
  },
  {
    number: 3,
    name: 'PROVENANCE',
    script: 'scripts/atlas/materialize-provenance-tree.mjs',
    description: 'Packet lineage materialization (lineage chain validation)',
    timeout: 120000
  },
  {
    number: 4,
    name: 'TELEMETRY',
    script: 'scripts/atlas/telemetry-evidence-quality-layer.mjs',
    description: 'Evidence quality assessment (breadth/depth/signals/tracing)',
    timeout: 60000,
    args: ['--apply']
  }
];

const PROOF_DIR = resolve('.proofs/four-lanes');
mkdirSync(PROOF_DIR, { recursive: true });

/**
 * Execute a single lane
 */
function executeLane(lane) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const laneLog = [];

    if (VERBOSE) {
      console.log(`\n🚀 Lane ${lane.number}: ${lane.name}`);
      console.log(`   Script: ${lane.script}`);
      console.log(`   Description: ${lane.description}`);
    }

    const args = lane.args ? [...lane.args] : [];
    const proc = spawn('node', [lane.script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: lane.timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      laneLog.push(text);
      if (VERBOSE) process.stdout.write(`   [${lane.name}] ${text}`);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      laneLog.push(text);
      if (VERBOSE) process.stderr.write(`   [${lane.name}] ${text}`);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;

      // Write lane log
      writeFileSync(
        resolve(PROOF_DIR, `lane-${lane.number}-${lane.name.toLowerCase()}.log`),
        laneLog.join('')
      );

      resolve({
        lane: lane.number,
        name: lane.name,
        passed,
        code,
        duration,
        stdout,
        stderr,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         FOUR-LANE PROOF-OF-TRUTH ORCHESTRATOR                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Proof dir: ${PROOF_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

  const startTime = Date.now();

  // Execute all lanes in parallel
  console.log(`Executing ${LANES.length} lanes in parallel...\n`);
  const lanePromises = LANES.map((lane) => executeLane(lane));
  const results = await Promise.all(lanePromises);

  const totalDuration = Date.now() - startTime;

  // Aggregate results
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    PROOF MANIFEST                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let allPassed = true;
  const manifest = {
    timestamp: new Date().toISOString(),
    totalDuration,
    lanes: []
  };

  for (const result of results) {
    const lane = LANES.find((l) => l.number === result.lane);
    const status = result.passed ? '✅' : '❌';

    console.log(`${status} Lane ${result.lane}: ${result.name}`);
    console.log(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`   Status: ${result.passed ? 'PASS' : 'FAIL'} (exit code ${result.code})`);
    console.log(`   Description: ${lane.description}\n`);

    manifest.lanes.push({
      number: result.lane,
      name: result.name,
      passed: result.passed,
      duration: result.duration,
      exitCode: result.code
    });

    if (!result.passed) {
      allPassed = false;
    }
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  ${allPassed ? '🎉' : '❌'} PROOF-OF-TRUTH: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`║  Lanes Passed: ${passedCount}/${LANES.length}`);
  console.log(`║  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Write manifest
  const manifestPath = resolve(PROOF_DIR, `manifest-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📝 Manifest: ${manifestPath}`);

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
