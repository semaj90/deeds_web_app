#!/usr/bin/env node
/**
 * atlas-verify — unified pipeline health check
 *
 * Runs all 5 smoke tests in order and prints one consolidated report.
 * Each test is a standalone script; this is a thin orchestrator.
 *
 * Usage:
 *   node scripts/atlas/atlas-verify.mjs
 *   node scripts/atlas/atlas-verify.mjs --fail-fast
 *   node scripts/atlas/atlas-verify.mjs --json          (machine-readable output)
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const FAIL_FAST = process.argv.includes('--fail-fast');
const JSON_OUT  = process.argv.includes('--json');

const TESTS = [
  { id: 'packets',  name: 'Postgres Packet Readiness',  script: 'verify-packet-readiness.mjs' },
  { id: 'qdrant',   name: 'Qdrant / HNSW Readiness',    script: 'verify-qdrant-payloads.mjs' },
  { id: 'som',      name: 'SOM Contract',               script: 'verify-som-contract.mjs' },
  { id: 'neo4j',    name: 'Neo4j GDS Readiness',        script: 'verify-neo4j-gds-readiness.mjs' },
  { id: 'features', name: 'XGBoost Feature Dataset',    script: 'verify-xgboost-feature-dataset.mjs' },
];

const results = [];
const started = Date.now();

if (!JSON_OUT) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Atlas Pipeline Verification                     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
}

for (const test of TESTS) {
  const scriptPath = resolve(__dir, test.script);
  const t0 = Date.now();
  let passed = false;
  let output = '';
  let error = '';

  try {
    output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: process.env,
      timeout: 60_000,
    });
    passed = output.includes('Result: ✅ PASS');
    if (!passed && !output.includes('Result:')) passed = true; // script exited 0 without explicit result
  } catch (err) {
    error = err.message;
    output = (err.stdout || '') + (err.stderr || '');
    passed = false;
  }

  const ms = Date.now() - t0;
  results.push({ id: test.id, name: test.name, passed, ms, output, error });

  if (!JSON_OUT) {
    const icon = passed ? '✅' : '❌';
    console.log(`  ${icon} ${test.name.padEnd(34)} (${ms}ms)`);
    if (!passed) {
      // print last 8 lines of output for context
      const lines = output.trim().split('\n').filter(l => !l.includes('injected env'));
      lines.slice(-8).forEach(l => console.log('     ' + l));
    }
    if (!passed && FAIL_FAST) {
      console.log('\n  --fail-fast: stopping.\n');
      break;
    }
  }
}

const totalMs  = Date.now() - started;
const allPass  = results.every(r => r.passed);
const passCount = results.filter(r => r.passed).length;

if (JSON_OUT) {
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: results.length, ms: totalMs, results }, null, 2));
} else {
  console.log(`\n  ─────────────────────────────────────────────────`);
  console.log(`  ${allPass ? '✅ ALL PASS' : `❌ ${results.length - passCount} FAILED`}  (${passCount}/${results.length} passed, ${totalMs}ms)\n`);

  if (!allPass) {
    console.log('  Remediation order:');
    if (!results.find(r => r.id === 'neo4j')?.passed) {
      console.log('    1. node scripts/atlas/write-used-concept-edges-from-packets.mjs --apply');
    }
    console.log('    2. node scripts/atlas/compute-pagerank-neo4j.mjs --apply');
    console.log('    3. node scripts/atlas/atlas-verify.mjs  (re-run after fixes)');
    console.log('');
  }
}

process.exit(allPass ? 0 : 1);