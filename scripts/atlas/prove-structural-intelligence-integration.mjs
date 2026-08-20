#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(repoRoot, 'docs/reports');
const reportPath = resolve(reportDir, 'structural-intelligence-integration-proof.json');
const runLive = process.env.ATLAS_PROVE_LIVE_SIDECAR === '1';

const steps = [
  {
    id: 'PARENT_ATLAS_BUILD',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'build'],
    cwd: resolve(repoRoot, 'packages/parent-atlas'),
  },
  {
    id: 'PARENT_ATLAS_CONTRACT_TESTS',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'test:feature-intelligence:all'],
    cwd: resolve(repoRoot, 'packages/parent-atlas'),
  },
  {
    id: 'PYTHON_PROVENANCE_TESTS',
    command: process.platform === 'win32' ? 'python.exe' : 'python',
    args: ['python/test_atlas_structural_provenance.py'],
    cwd: repoRoot,
  },
  {
    id: 'STATIC_PROVENANCE_WIRING_AUDIT',
    command: process.execPath,
    args: ['scripts/atlas/audit-structural-provenance-wiring.mjs'],
    cwd: repoRoot,
  },
  {
    id: 'FRONTEND_STRUCTURAL_INTEGRATION_TESTS',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: [
      'vitest', 'run',
      'src/lib/server/analysis/atlas-ast-evidence-normalizer.spec.ts',
      'src/lib/server/atlas/indexing/graphify-structural-materializer.spec.ts',
      'src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.spec.ts',
      'src/lib/server/nlp/miniforge-nlp-sidecar.spec.ts',
    ],
    cwd: resolve(repoRoot, 'sveltekit-frontend'),
  },
];

if (runLive) {
  steps.push({
    id: 'LIVE_8095_PROVENANCE_PROOF',
    command: process.execPath,
    args: ['scripts/atlas/prove-ast-sidecar.mjs'],
    cwd: repoRoot,
  });
}

const results = [];
let blocked = false;
for (const step of steps) {
  if (blocked) {
    results.push({ id: step.id, status: 'BLOCKED_BY_PRIOR_FAILURE' });
    continue;
  }

  const started = Date.now();
  const run = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
  const status = run.status === 0 ? 'PASS' : 'FAIL';
  results.push({
    id: step.id,
    status,
    exitCode: run.status,
    signal: run.signal,
    durationMs: Date.now() - started,
    stdoutTail: String(run.stdout ?? '').slice(-8000),
    stderrTail: String(run.stderr ?? '').slice(-8000),
  });
  if (status === 'FAIL') blocked = true;
}

const required = results.filter((item) => item.id !== 'LIVE_8095_PROVENANCE_PROOF');
const requiredPass = required.every((item) => item.status === 'PASS');
const liveResult = results.find((item) => item.id === 'LIVE_8095_PROVENANCE_PROOF');
const status = requiredPass
  ? liveResult
    ? liveResult.status === 'PASS' ? 'PROVEN_WITH_LIVE_8095' : 'STATIC_PASS_LIVE_FAIL'
    : 'STATIC_PROOF_PASS_LIVE_NOT_RUN'
  : 'FAIL';

const receipt = {
  schema: 'atlas.structural-intelligence-integration-proof.v1',
  generatedAt: new Date().toISOString(),
  status,
  liveSidecarRequested: runLive,
  rule: 'WRITTEN != WIRED != PROVEN',
  steps: results,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status, reportPath, steps: results.map(({ id, status: stepStatus }) => ({ id, status: stepStatus })) }, null, 2));
if (!requiredPass || (runLive && liveResult?.status !== 'PASS')) process.exitCode = 2;
