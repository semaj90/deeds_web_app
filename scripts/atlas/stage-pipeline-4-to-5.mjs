#!/usr/bin/env node
/**
 * Pipeline wrapper: Stage 4 → Stage 5
 * Waits for Stage 4 to complete, then runs Stage 5
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.cwd();
const STAGE4_OUTPUT = path.join(REPO_ROOT, 'docs', 'stage4', 'topology_facts.ndjson');
const CHECK_INTERVAL = 2000; // 2 seconds

async function waitForStage4() {
  console.log('[Pipeline] Waiting for Stage 4 to complete...');

  let waited = 0;
  const maxWait = 10 * 60 * 1000; // 10 minutes max

  while (!fs.existsSync(STAGE4_OUTPUT) && waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    waited += CHECK_INTERVAL;

    if (waited % 30000 === 0) {
      console.log(`[Pipeline] Still waiting... (${(waited / 1000).toFixed(0)}s elapsed)`);
    }
  }

  if (!fs.existsSync(STAGE4_OUTPUT)) {
    console.error('[ERROR] Stage 4 did not complete within timeout');
    process.exit(1);
  }

  console.log(`[Pipeline] ✅ Stage 4 complete (${(waited / 1000).toFixed(0)}s waited)`);
}

async function runStage5() {
  console.log('[Pipeline] Starting Stage 5...');

  const result = spawnSync('node', ['scripts/atlas/stage5-pagerank-authority.mjs'], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('[ERROR] Stage 5 failed');
    process.exit(result.status);
  }

  console.log('[Pipeline] ✅ Stage 5 complete');
}

async function main() {
  await waitForStage4();
  await runStage5();
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
