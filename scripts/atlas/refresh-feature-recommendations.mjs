#!/usr/bin/env node
/**
 * Refresh the structural feature recommendation lane in resumable batches.
 *
 * Phase A:
 *   - materialize atlas_feature_recommendation_index in batches
 *
 * Phase B:
 *   - generate TODO recommendations from the refreshed index
 *
 * Defaults:
 *   - batch size: 500
 *   - dry-run first unless --apply is explicit
 *   - resumable via offset
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MATERIALIZER = path.join(ROOT, 'scripts', 'atlas', 'materialize-feature-recommendation-index.mjs');
const TODOS = path.join(ROOT, 'scripts', 'atlas', 'generate-feature-todos.mjs');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'atlas-feature-recommendation-index.json');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const LIMIT_ARG = process.argv.find((v) => v.startsWith('--limit='));
const LIMIT = Number(LIMIT_ARG ? LIMIT_ARG.split('=')[1] : 500);
const MAX_BATCHES_ARG = process.argv.find((v) => v.startsWith('--max-batches='));
const MAX_BATCHES = Number(MAX_BATCHES_ARG ? MAX_BATCHES_ARG.split('=')[1] : 0);

function log(...args) {
  console.log('[feature-recommendations-refresh]', ...args);
}

function runNode(script, args = []) {
  return execFileSync('node', [script, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function lastNonEmptyLine(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

async function readBatchSize() {
  try {
    const raw = await fs.readFile(REPORT_JSON, 'utf8');
    const parsed = JSON.parse(raw);
    return Number(parsed.total ?? 0);
  } catch {
    return 0;
  }
}

async function refreshBatches() {
  if (DRY_RUN) {
    log(`Dry-run batch: limit=${LIMIT} offset=0`);
    const out = runNode(MATERIALIZER, ['--dry-run', `--limit=${LIMIT}`, '--offset=0']);
    process.stdout.write(out);
    log('Dry-run complete');
    return;
  }

  let offset = 0;
  let batch = 0;

  while (true) {
    batch += 1;
    if (MAX_BATCHES > 0 && batch > MAX_BATCHES) {
      log(`Reached max-batches=${MAX_BATCHES}; stopping at offset=${offset}`);
      break;
    }

    log(`Batch ${batch}: limit=${LIMIT} offset=${offset}`);
    const out = runNode(MATERIALIZER, ['--apply', `--limit=${LIMIT}`, `--offset=${offset}`]);
    process.stdout.write(out);

    const written = await readBatchSize();
    log(`Batch ${batch} wrote ${written} rows`);
    if (written <= 0 || written < LIMIT) {
      log('No more rows to process; batch refresh complete');
      break;
    }

    offset += LIMIT;
  }

  log('Generating feature TODO recommendations...');
  const todoOut = runNode(TODOS, ['--limit=100', '--apply']);
  process.stdout.write(todoOut);
  log('Feature recommendation refresh complete');
}

refreshBatches().catch((error) => {
  const tail = lastNonEmptyLine(error?.stdout || error?.stderr || error?.message);
  console.error('[feature-recommendations-refresh] fatal:', tail || error.message);
  process.exit(1);
});
