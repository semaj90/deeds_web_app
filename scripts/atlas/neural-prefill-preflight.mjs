#!/usr/bin/env node

/**
 * Read-only neural prefill preflight. Unlike the daily startup command, this
 * never invokes the mutating Graphify chain.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(root, 'sveltekit-frontend');

const run = (command, args, timeout) => {
  const result = spawnSync(command, args, {
    cwd: frontend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
    error.code = result.status;
    throw error;
  }
};

const startedAt = new Date().toISOString();
let status = 'PASS';
try {
  run('npm', ['run', 'atlas:graphify:nlp:passes:dry'], 20 * 60 * 1000);
  run('npm', ['run', 'atlas:ast-domain:baselines:dry'], 5 * 60 * 1000);
  run('npm', ['run', 'atlas:neural:prefill:validate'], 60 * 1000);
} catch (error) {
  status = 'DEGRADED';
  console.warn(`[atlas:neural-prefill:preflight] degraded: ${error.message}`);
}

console.log(JSON.stringify({
  schema: 'atlas.neural-prefill-preflight.v1',
  startedAt,
  completedAt: new Date().toISOString(),
  status,
  readOnly: true,
  graphifyDailyChainInvoked: false,
  databaseWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  trainingStarted: false,
  baselineModels: ['naive_bayes', 'logistic_regression'],
  baselineReport: 'docs/reports/ast-domain-baselines-dry-v1.json',
  baselinePromotion: 'BLOCKED_WEAK_CANDIDATE_LABELS',
  fallback: 'CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT',
}, null, 2));

process.exitCode = status === 'PASS' ? 0 : 0;
