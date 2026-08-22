#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const node = process.execPath;
const probe = resolve(root, 'scripts/atlas/probe-graphify-runtime-observability.mjs');
const compare = resolve(root, 'scripts/atlas/compare-graphify-runtime-observability.mjs');
const graphify = resolve(root, 'scripts/startup/run-graphify-daily-startup.mjs');

const before = 'docs/reports/graphify-runtime-before.json';
const after = 'docs/reports/graphify-runtime-after.json';
const delta = 'docs/reports/graphify-runtime-delta.json';

function run(args, options = {}) {
  return execFileSync(node, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function tryProbe(phase, out) {
  try {
    run([probe, `--phase=${phase}`, `--out=${out}`], { timeout: 60_000 });
    return true;
  } catch (error) {
    console.warn(`[graphify:observed] ${phase} telemetry deferred: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

console.log('[graphify:observed] Capturing PostgreSQL/Valkey baseline...');
const beforeOk = tryProbe('before', before);

let graphifyExit = 0;
try {
  run([graphify], { timeout: 4 * 60 * 60 * 1000 });
} catch (error) {
  graphifyExit = Number.isInteger(error?.status) ? error.status : 1;
  console.error(`[graphify:observed] graphify:daily exited ${graphifyExit}`);
}

console.log('[graphify:observed] Capturing PostgreSQL/Valkey completion snapshot...');
const afterOk = tryProbe('after', after);

if (beforeOk && afterOk) {
  try {
    run([compare, `--before=${before}`, `--after=${after}`, `--out=${delta}`], { timeout: 30_000 });
  } catch (error) {
    console.warn(`[graphify:observed] telemetry delta deferred: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`[graphify:observed] complete; graphifyExit=${graphifyExit}`);
process.exit(graphifyExit);
