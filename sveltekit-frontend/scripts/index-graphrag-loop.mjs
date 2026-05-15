#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const STEPS = [
  'graphify:daily',
  'graphify:som',
  'ae:train:js',
  'ae:centroids',
  'ae:backfill',
  'llms:write',
  'llms:index',
  'create:todo',
];

function runStep(step) {
  console.log(`\n[index-loop] ${step}`);
  const result = spawnSync('npm', ['run', step], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    const code = Number.isInteger(result.status) ? result.status : 1;
    throw new Error(`step failed: ${step} (exit ${code})`);
  }
}

function main() {
  console.log(`\n[index-loop] ${DRY_RUN ? 'DRY-RUN' : 'RUN'} canonical graphRAG loop`);
  console.log(`[index-loop] steps=${STEPS.join(' -> ')}`);

  if (DRY_RUN) return;

  for (const step of STEPS) runStep(step);
  console.log('\n[index-loop] complete');
}

try {
  main();
} catch (err) {
  console.error(`[index-loop] ${err.message}`);
  process.exit(1);
}
