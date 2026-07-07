#!/usr/bin/env node

/**
 * Phase 6: Production Traffic Ramp Control
 *
 * Gradually routes requests from unified retrieval to multi-vector RRF.
 * Three stages: 5% (canary) → 25% (ramp) → 100% (full deployment)
 *
 * Usage:
 *   node phase6-traffic-ramp-control.mjs [5|25|100|rollback]
 *
 * Environment Variables (set via .env):
 *   MULTI_VECTOR_RAMP_ENABLED=true              // Enable traffic ramp
 *   MULTI_VECTOR_CANARY_PERCENT=5               // Canary traffic %
 *   MULTI_VECTOR_RAMP_STARTED_MS=<timestamp>    // Ramp start time
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const ENV_FILE = path.join(PROJECT_ROOT, 'sveltekit-frontend/.env.local');

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    return {};
  }
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  }
  return env;
}

function writeEnv(env) {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
}

function setRampStage(stage) {
  const env = readEnv();
  const timestamp = Date.now();

  switch (stage) {
    case '5':
      console.log('🟢 [CANARY] Enabling multi-vector for 5% of traffic');
      env.MULTI_VECTOR_RAMP_ENABLED = 'true';
      env.MULTI_VECTOR_CANARY_PERCENT = '5';
      env.MULTI_VECTOR_RAMP_STARTED_MS = String(timestamp);
      env.MULTI_VECTOR_RAMP_STAGE = 'canary-5pct';
      break;

    case '25':
      console.log('🟡 [RAMP] Enabling multi-vector for 25% of traffic');
      env.MULTI_VECTOR_RAMP_ENABLED = 'true';
      env.MULTI_VECTOR_CANARY_PERCENT = '25';
      env.MULTI_VECTOR_RAMP_STARTED_MS = String(timestamp);
      env.MULTI_VECTOR_RAMP_STAGE = 'ramp-25pct';
      break;

    case '100':
      console.log('🟢 [LIVE] Enabling multi-vector for 100% of traffic');
      env.MULTI_VECTOR_RAMP_ENABLED = 'true';
      env.MULTI_VECTOR_CANARY_PERCENT = '100';
      env.MULTI_VECTOR_RAMP_STARTED_MS = String(timestamp);
      env.MULTI_VECTOR_RAMP_STAGE = 'live-100pct';
      break;

    case 'rollback':
      console.log('🔴 [ROLLBACK] Disabling multi-vector, reverting to unified');
      env.MULTI_VECTOR_RAMP_ENABLED = 'false';
      env.MULTI_VECTOR_CANARY_PERCENT = '0';
      delete env.MULTI_VECTOR_RAMP_STARTED_MS;
      env.MULTI_VECTOR_RAMP_STAGE = 'rollback';
      break;

    default:
      console.error(`❌ Unknown stage: ${stage}`);
      console.error('Usage: node phase6-traffic-ramp-control.mjs [5|25|100|rollback]');
      process.exit(1);
  }

  writeEnv(env);

  // Print status
  console.log(`
[PHASE 6 TRAFFIC RAMP STATUS]

Stage: ${env.MULTI_VECTOR_RAMP_STAGE}
Enabled: ${env.MULTI_VECTOR_RAMP_ENABLED}
Traffic Percentage: ${env.MULTI_VECTOR_CANARY_PERCENT}%
Started: ${new Date(parseInt(env.MULTI_VECTOR_RAMP_STARTED_MS)).toISOString()}

Next Actions:
- Monitor latency p95, error rate, recall@100 for 30 minutes
- Check logs: tail -f sveltekit-frontend/.logs/multi-vector-ramp.log
- If metrics healthy: advance to next stage
- If metrics degrade: run 'node phase6-traffic-ramp-control.mjs rollback'
  `);
}

// Main
const stage = process.argv[2];
if (!stage) {
  console.error('❌ Stage required');
  console.error('Usage: node phase6-traffic-ramp-control.mjs [5|25|100|rollback]');
  process.exit(1);
}

setRampStage(stage);
console.log('✅ Traffic ramp configured. Restart dev server to apply.');
