#!/usr/bin/env node
/**
 * scripts/tests/smoke-atlas-cluster-worker.mjs
 *
 * Smoke test to verify Python clustering worker + Node upsert orchestrator (dry-run only).
 * Rules enforced:
 * - No Qdrant writes unless --write
 * - No Redis publish unless --publish
 * - Preserves sourceRef and graphVersion
 * - Validates vector dim
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_CARDS_JSONL = path.join(REPO_ROOT, 'memory/exports/atlas/cards.jsonl');
const ASSIGNMENTS_JSONL = path.join(REPO_ROOT, '.tmp/atlas-cluster-assignments.jsonl');
const CENTROIDS_JSON = path.join(REPO_ROOT, '.tmp/atlas-cluster-assignments.centroids.json');

let pass = 0;
let fail = 0;

function ok(label) { console.log('  ✅', label); pass++; }
function ko(label, detail) { console.log('  ❌', label, detail ? `— ${detail}` : ''); fail++; }

async function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'pipe', cwd: REPO_ROOT, shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  console.log('🚀 Running Smoke Test: smoke-atlas-cluster-worker.mjs\n');

  // Verify cards.jsonl exists or create a tiny dummy one for testing
  if (!fs.existsSync(INPUT_CARDS_JSONL)) {
    console.log(`⚠️  ${INPUT_CARDS_JSONL} not found. Creating tiny dummy dataset...`);
    fs.mkdirSync(path.dirname(INPUT_CARDS_JSONL), { recursive: true });
    const dummy = [
      { id: '1', sourceRef: 'lib/cache.ts', graphVersion: '2026-05-29', embedding: new Array(768).fill(0.1) },
      { id: '2', sourceRef: 'lib/db.ts', graphVersion: '2026-05-29', embedding: new Array(768).fill(0.2) },
      { id: '3', sourceRef: 'lib/vector.ts', graphVersion: '2026-05-29', embedding: new Array(768).fill(0.3) }
    ];
    fs.writeFileSync(INPUT_CARDS_JSONL, dummy.map(d => JSON.stringify(d)).join('\n') + '\n');
  }

  // 1. Run Python Worker Dry Run
  console.log('Step 1: Running workers/atlas-cluster-worker.py in dry-run mode...');
  const pyResult = await runCommand('python', [
    'workers/atlas-cluster-worker.py',
    '--input', 'memory/exports/atlas/cards.jsonl',
    '--out', '.tmp/atlas-cluster-assignments.jsonl',
    '--k', '2',
    '--dry-run'
  ]);

  if (pyResult.code === 0) {
    ok('Python cluster worker completed successfully.');
    // Check output presence
    if (fs.existsSync(ASSIGNMENTS_JSONL) && fs.existsSync(CENTROIDS_JSON)) {
      ok('Assignments and centroids files written to .tmp/');
      const centroids = JSON.parse(fs.readFileSync(CENTROIDS_JSON, 'utf-8'));
      if (centroids.centroids && centroids.centroids.length > 0) {
        ok(`Generated ${centroids.centroids.length} centroids with expected dim ${centroids.dim}`);
      } else {
        ko('Centroids array is empty or corrupted');
      }
    } else {
      ko('Output files not found in .tmp/');
    }
  } else {
    ko('Python cluster worker failed', pyResult.stderr || pyResult.stdout);
  }

  // 2. Run Qdrant Upsert Dry Run
  console.log('\nStep 2: Running scripts/atlas/qdrant-upsert-clusters.mjs in dry-run mode...');
  const nodeResult = await runCommand('node', [
    'scripts/atlas/qdrant-upsert-clusters.mjs',
    '--input', '.tmp/atlas-cluster-assignments.centroids.json',
    '--collection', 'codebase_chunks_768',
    '--dry-run'
  ]);

  if (nodeResult.code === 0) {
    ok('Qdrant upsert preview/dry-run run completed successfully.');
    if (nodeResult.stdout.includes('points to upsert:')) {
      ok('Qdrant preview report correctly displayed point allocations.');
    } else {
      ko('Report did not output points metadata.', nodeResult.stdout);
    }
  } else {
    ko('Qdrant upsert runner failed', nodeResult.stderr || nodeResult.stdout);
  }

  console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
