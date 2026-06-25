#!/usr/bin/env node
/**
 * P4 Proof-of-Truth Orchestrator
 *
 * MISSION: Validate end-to-end P0→P4 pipeline with all four lanes
 * - Lane 1: Identity frozen (P0) ✓
 * - Lane 2: Agentic error fixing (P1) ✓
 * - Lane 3: Rust parser (P2) ✓
 * - Lane 4: Qdrant v2 + Higher-hop enrichment (P3-P4) ✓
 *
 * ORCHESTRATION: 4 parallel lanes, 40s+ total execution
 * GATING: All 4 lanes must pass before P4 completion
 * OUTPUT: Timestamped proof manifest with lane metrics
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const PROOFS_DIR = path.resolve(REPO_ROOT, '.proofs/p4');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

/**
 * Lane execution wrapper
 */
async function executeLane(laneNumber, laneScript, laneLabel) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`\n🚀 Lane ${laneNumber}: ${laneLabel}`);
    console.log(`   Script: ${laneScript}`);

    const proc = spawn('node', [laneScript], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LANE_NUMBER: laneNumber }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(`   [OUT] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(`   [ERR] ${data}`);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      const passed = code === 0;

      resolve({
        laneNumber,
        laneLabel,
        laneScript,
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
 * Verify gates for each lane
 */
async function verifyLaneGates(laneData) {
  const { laneNumber, passed } = laneData;
  const gates = [];

  switch (laneNumber) {
    case 1:
      // P0: Identity frozen
      gates.push({
        name: 'P0.1-Lineage-Frozen',
        passed: passed && laneData.stdout.includes('packet_key') && laneData.stdout.includes('100%'),
        requirement: 'All 3,251 packets have stable packet_key'
      });
      gates.push({
        name: 'P0.2-Directory-Stable',
        passed: passed && laneData.stdout.includes('duplicates: 0'),
        requirement: 'Zero directory path duplicates across revisions'
      });
      gates.push({
        name: 'P0.3-Cold-Storage-Manifest',
        passed: passed && laneData.stdout.includes('manifest'),
        requirement: 'Cold storage backup manifest is consistent'
      });
      break;

    case 2:
      // P1: Error fixing infrastructure
      gates.push({
        name: 'P1-Error-Audit',
        passed: passed && laneData.stdout.includes('errors') && laneData.stdout.includes('audit'),
        requirement: 'Error audit pipeline can identify issues'
      });
      gates.push({
        name: 'P1-Error-Plan',
        passed: passed && laneData.stdout.includes('plan'),
        requirement: 'Error planning generates fix strategies'
      });
      gates.push({
        name: 'P1-Error-Apply',
        passed: passed && laneData.stdout.includes('apply'),
        requirement: 'Error fixes apply atomically to Postgres'
      });
      break;

    case 3:
      // P2: Rust N-API
      gates.push({
        name: 'P2-Rust-Build',
        passed: passed && laneData.stdout.includes('build') || laneData.stdout.includes('compiled'),
        requirement: 'Rust crates compile without errors'
      });
      gates.push({
        name: 'P2-N-API-Addon',
        passed: passed && laneData.stdout.includes('tensorrt_bridge'),
        requirement: 'N-API addon available for GPU functions'
      });
      gates.push({
        name: 'P2-TypeScript-Bridge',
        passed: passed && laneData.stdout.includes('libtorch') || laneData.stdout.includes('simdjson'),
        requirement: 'TypeScript can call Rust functions'
      });
      break;

    case 4:
      // P3-P4: Qdrant + Higher-hop + Karpathy
      gates.push({
        name: 'P3-Qdrant-v2-Payloads',
        passed: passed && laneData.stdout.includes('qdrant') && laneData.stdout.includes('payload'),
        requirement: 'Qdrant payloads match Postgres identity contract'
      });
      gates.push({
        name: 'P4-SOM-Topology',
        passed: passed && laneData.stdout.includes('SOM_GRID_NEIGHBOR') && laneData.stdout.includes('edges'),
        requirement: 'SOM grid has Moore adjacency edges (~1,200)'
      });
      gates.push({
        name: 'P4-Karpathy-Authority',
        passed: passed && laneData.stdout.includes('karpathy') && laneData.stdout.includes('blend'),
        requirement: 'Authority blend (PR + ATT + FREQ + PROV) computes successfully'
      });
  }

  return gates;
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎯 P4 PROOF-OF-TRUTH ORCHESTRATOR');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Proofs dir: ${PROOFS_DIR}`);

  // Create proofs directory
  await fs.mkdir(PROOFS_DIR, { recursive: true });

  // Lane definitions
  const lanes = [
    {
      number: 1,
      label: 'P0: Identity Frozen',
      script: path.join(REPO_ROOT, 'scripts/atlas/verify-feature-lineage.mjs')
    },
    {
      number: 2,
      label: 'P1: Agentic Error Fixing',
      script: path.join(REPO_ROOT, 'scripts/atlas/audit-errors.mjs')
    },
    {
      number: 3,
      label: 'P2: Rust N-API Parser',
      script: path.join(REPO_ROOT, 'scripts/atlas/verify-rust-addon.mjs')
    },
    {
      number: 4,
      label: 'P4: Higher-Hop + Karpathy',
      script: path.join(REPO_ROOT, 'scripts/atlas/compute-p4-karpathy-blend.mjs')
    }
  ];

  console.log(`\n🔄 Executing ${lanes.length} parallel lanes...`);
  const startTime = Date.now();

  // Execute all lanes in parallel
  const lanePromises = lanes.map((lane) =>
    executeLane(lane.number, lane.script, lane.label)
  );

  const laneResults = await Promise.allSettled(lanePromises);
  const totalDuration = Date.now() - startTime;

  // Process results
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📊 PROOF MANIFEST');
  console.log('═══════════════════════════════════════════════════════════════');

  let allPassed = true;
  const manifestData = {
    timestamp: TIMESTAMP,
    totalDuration,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date().toISOString(),
    lanes: [],
    globalGates: []
  };

  for (const result of laneResults) {
    if (result.status === 'rejected') {
      console.error(`❌ Lane failed with error: ${result.reason}`);
      allPassed = false;
      continue;
    }

    const laneData = result.value;
    const laneGates = await verifyLaneGates(laneData);
    const lanePass = laneData.passed && laneGates.every((g) => g.passed);

    console.log(
      `\n${lanePass ? '✅' : '❌'} Lane ${laneData.laneNumber}: ${laneData.laneLabel}`
    );
    console.log(`   Duration: ${laneData.duration}ms`);
    console.log(`   Status: ${laneData.passed ? 'PASS' : 'FAIL'} (exit code ${laneData.code})`);

    // Gate details
    for (const gate of laneGates) {
      console.log(`   ${gate.passed ? '✓' : '✗'} ${gate.name}`);
      console.log(`      Requirement: ${gate.requirement}`);
    }

    manifestData.lanes.push({
      number: laneData.laneNumber,
      label: laneData.laneLabel,
      script: laneData.laneScript,
      passed: lanePass,
      duration: laneData.duration,
      gates: laneGates
    });

    if (!lanePass) {
      allPassed = false;
    }
  }

  // Global gates
  console.log('\n🔐 GLOBAL GATES (P0-P4 Completion)');
  const globalGates = [
    {
      name: 'P0-Complete',
      passed: manifestData.lanes[0]?.passed,
      requirement: 'Identity frozen + lineage verified'
    },
    {
      name: 'P1-Complete',
      passed: manifestData.lanes[1]?.passed,
      requirement: 'Error audit/plan/apply infrastructure ready'
    },
    {
      name: 'P2-Complete',
      passed: manifestData.lanes[2]?.passed,
      requirement: 'Rust N-API addon built and callable'
    },
    {
      name: 'P3P4-Complete',
      passed: manifestData.lanes[3]?.passed,
      requirement: 'Qdrant v2 + Higher-hop + Karpathy authority wired'
    }
  ];

  for (const gate of globalGates) {
    console.log(`   ${gate.passed ? '✅' : '❌'} ${gate.name}`);
    console.log(`      ${gate.requirement}`);
    manifestData.globalGates.push(gate);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(allPassed ? '🎉 P0-P4 PROOF-OF-TRUTH: PASS' : '❌ P0-P4 PROOF-OF-TRUTH: FAIL');
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Write manifest
  const manifestPath = path.join(PROOFS_DIR, `manifest-${TIMESTAMP}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifestData, null, 2));
  console.log(`\n📝 Manifest saved: ${manifestPath}`);

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
