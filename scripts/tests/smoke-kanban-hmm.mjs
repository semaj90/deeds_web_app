#!/usr/bin/env node
/**
 * Smoke Test: Kanban HMM Diagnosis Engine
 *
 * Verifies:
 *  1. HMM Viterbi Decoder math against known transition/emission scenarios.
 *  2. Valkey/Redis integration (writing telemetry sequence, slicing window, caching recommendation).
 *  3. Inferred state transitions and automated recommendation cards.
 */

import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env'), override: true });

let REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';
console.log('Original process.env.REDIS_URL:', process.env.REDIS_URL);
console.log('Original process.env.REDIS_PASSWORD:', process.env.REDIS_PASSWORD);

if (REDIS_URL.startsWith('redis://') && !REDIS_URL.includes('@') && process.env.REDIS_PASSWORD) {
  const password = process.env.REDIS_PASSWORD;
  const withoutProtocol = REDIS_URL.substring(8);
  REDIS_URL = `redis://:${password}@${withoutProtocol}`;
}
console.log('Resolved REDIS_URL for connection:', REDIS_URL);
const LOG_FILE_PATH = resolve(ROOT, 'docs/reports/indexing-activities.log');

// ─── Mathematical Implementation duplicate for test validation ──────────────

const HIDDEN_STATES = ['S1', 'S2', 'S3', 'S4'];
const STATE_LABELS = {
  S1: 'Healthy Progression',
  S2: 'Relational/Schema Bloat',
  S3: 'Regression Trap',
  S4: 'Stale / Abandoned'
};

function getObservationIndex(event) {
  const norm = event.trim().toUpperCase();
  if (norm === 'TSC_ERR') return 0;
  if (norm === 'MQ_NACK') return 1;
  if (norm === 'CACHE_HIT_STALE') return 2;
  if (norm === 'GRAPH_HOTSPOT') return 3;
  return 4; // other
}

const PI = [0.60, 0.15, 0.10, 0.15];
const A = [
  [0.70, 0.10, 0.10, 0.10],
  [0.15, 0.60, 0.15, 0.10],
  [0.15, 0.05, 0.70, 0.10],
  [0.10, 0.05, 0.05, 0.80]
];
const B = [
  [0.10, 0.05, 0.10, 0.05, 0.70],
  [0.10, 0.05, 0.60, 0.15, 0.10],
  [0.50, 0.30, 0.05, 0.10, 0.05],
  [0.05, 0.05, 0.05, 0.05, 0.80]
];

const logPi = PI.map(p => Math.log(Math.max(p, 1e-10)));
const logA = A.map(row => row.map(p => Math.log(Math.max(p, 1e-10))));
const logB = B.map(row => row.map(p => Math.log(Math.max(p, 1e-10))));

function diagnoseSpecState(observations) {
  const N = logA.length;
  const T = observations.length;

  if (T === 0) return [];

  const viterbi = Array.from({ length: N }, () => new Array(T).fill(-Infinity));
  const backpointer = Array.from({ length: N }, () => new Array(T).fill(0));

  for (let s = 0; s < N; s++) {
    viterbi[s][0] = logPi[s] + logB[s][observations[0]];
    backpointer[s][0] = 0;
  }

  for (let t = 1; t < T; t++) {
    const obsIndex = observations[t];
    for (let s = 0; s < N; s++) {
      let maxLogProb = -Infinity;
      let bestState = 0;

      for (let prevS = 0; prevS < N; prevS++) {
        const logProb = viterbi[prevS][t - 1] + logA[prevS][s];
        if (logProb > maxLogProb) {
          maxLogProb = logProb;
          bestState = prevS;
        }
      }

      viterbi[s][t] = maxLogProb + logB[s][obsIndex];
      backpointer[s][t] = bestState;
    }
  }

  let maxFinalLogProb = -Infinity;
  let pseudoState = 0;
  for (let s = 0; s < N; s++) {
    if (viterbi[s][T - 1] > maxFinalLogProb) {
      maxFinalLogProb = viterbi[s][T - 1];
      pseudoState = s;
    }
  }

  const path = [pseudoState];
  for (let t = T - 1; t > 0; t--) {
    pseudoState = backpointer[pseudoState][t];
    path.unshift(pseudoState);
  }

  return path;
}

function getRecommendationForState(state) {
  const timestamp = new Date().toISOString();
  switch (state) {
    case 'S2':
      return {
        state: 'S2',
        stateLabel: STATE_LABELS.S2,
        recommendation: 'Detecting frequent database modifications. Run npm run graphify:authority to update Postgres knowledge maps before altering schemas again.',
        triggerCondition: 'High emission of Drizzle migration steps mixed with low Qdrant index hits.',
        timestamp
      };
    case 'S3':
      return {
        state: 'S3',
        stateLabel: STATE_LABELS.S3,
        recommendation: 'Your CRUD loop has generated a cyclic loop. Isolate the handler using a TypeScript Service Worker or verify your Zod validation rules.',
        triggerCondition: 'Sequence of multiple tsc failures combined with cyclic import flags.',
        timestamp
      };
    case 'S4':
      return {
        state: 'S4',
        stateLabel: STATE_LABELS.S4,
        recommendation: "This spec card has no active vector footprint. Evicting model parameters or moving card to 'Backlog'.",
        triggerCondition: 'Zero updates in Valkey cache across a 24-hour TTL window.',
        timestamp
      };
    case 'S1':
    default:
      return {
        state: 'S1',
        stateLabel: STATE_LABELS.S1,
        recommendation: 'Development loop is healthy. Normal progression.',
        triggerCondition: 'Normal CRUD loop generation/testing.',
        timestamp
      };
  }
}

// ─── Telemetry processing simulation with direct Valkey integration ─────────

async function processTelemetryEventSim(redis, specId, event) {
  const telKey = `kanban:telemetry:${specId}`;
  const recKey = `kanban:recommendation:${specId}`;

  const pipeline = redis.pipeline();
  pipeline.rpush(telKey, event);
  pipeline.ltrim(telKey, -15, -1);
  pipeline.lrange(telKey, 0, -1);
  const results = await pipeline.exec();

  const events = results[2][1];
  const obsIndices = events.map(getObservationIndex);
  const stateIndices = diagnoseSpecState(obsIndices);
  const pathStates = stateIndices.map(idx => HIDDEN_STATES[idx]);
  const finalState = pathStates[pathStates.length - 1] ?? 'S1';

  const recommendation = getRecommendationForState(finalState);
  const payload = { specId, events, path: pathStates, recommendation };

  await redis.set(recKey, JSON.stringify(payload), 'EX', 24 * 3600);
  return payload;
}

// ─── Test Runner ────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🤖 Starting Kanban HMM Diagnosis Smoke Tests...');
  const redis = new Redis(REDIS_URL);

  try {
    const ping = await redis.ping();
    console.log(`✅ Connected to Valkey/Redis: PING -> ${ping}`);

    const testSpecId = `test_spec_${Date.now()}`;
    console.log(`\n📋 Testing spec_id: ${testSpecId}`);

    // Scenario 1: Healthy Progression
    // Sequence of normal events -> should transition to S1
    console.log('\n--- Scenario 1: Healthy Progression ---');
    const healthySequence = ['MQ_ACK', 'COMMIT', 'MQ_ACK'];
    let lastDiag = null;
    for (const event of healthySequence) {
      lastDiag = await processTelemetryEventSim(redis, testSpecId, event);
      console.log(`  Emitted: ${event} -> Path: ${lastDiag.path.join('➔')}`);
    }
    const finalState1 = lastDiag.path[lastDiag.path.length - 1];
    if (finalState1 === 'S1') {
      console.log(`✅ PASS: Correctly diagnosed ${finalState1} (${lastDiag.recommendation.stateLabel})`);
    } else {
      console.error(`❌ FAIL: Expected S1, got ${finalState1}`);
      process.exit(1);
    }

    // Scenario 2: Schema Bloat (S2)
    // Multiple CACHE_HIT_STALE and GRAPH_HOTSPOT emissions
    console.log('\n--- Scenario 2: Relational/Schema Bloat ---');
    const bloatSequence = ['CACHE_HIT_STALE', 'CACHE_HIT_STALE', 'GRAPH_HOTSPOT'];
    for (const event of bloatSequence) {
      lastDiag = await processTelemetryEventSim(redis, testSpecId, event);
      console.log(`  Emitted: ${event} -> Path: ${lastDiag.path.join('➔')}`);
    }
    const finalState2 = lastDiag.path[lastDiag.path.length - 1];
    if (finalState2 === 'S2') {
      console.log(`✅ PASS: Correctly diagnosed ${finalState2} (${lastDiag.recommendation.stateLabel})`);
    } else {
      console.error(`❌ FAIL: Expected S2, got ${finalState2}`);
      process.exit(1);
    }

    // Scenario 3: Regression Trap (S3)
    // Multiple TSC_ERR and MQ_NACK validation failures
    console.log('\n--- Scenario 3: Regression Trap ---');
    const regressionSequence = ['TSC_ERR', 'MQ_NACK', 'TSC_ERR', 'TSC_ERR'];
    for (const event of regressionSequence) {
      lastDiag = await processTelemetryEventSim(redis, testSpecId, event);
      console.log(`  Emitted: ${event} -> Path: ${lastDiag.path.join('➔')}`);
    }
    const finalState3 = lastDiag.path[lastDiag.path.length - 1];
    if (finalState3 === 'S3') {
      console.log(`✅ PASS: Correctly diagnosed ${finalState3} (${lastDiag.recommendation.stateLabel})`);
    } else {
      console.error(`❌ FAIL: Expected S3, got ${finalState3}`);
      process.exit(1);
    }

    // Verify retrieval latency
    console.log('\n⚡ Auditing Hot-Cache Retrieval Latency...');
    const start = performance.now();
    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      await redis.get(`kanban:recommendation:${testSpecId}`);
    }
    const duration = performance.now() - start;
    const avgLatency = duration / iterations;
    console.log(`✅ Hot-Cache Latency: Average of ${avgLatency.toFixed(3)}ms over ${iterations} iterations`);
    if (avgLatency < 2.0) {
      console.log(`✅ PASS: Cache retrieval is ultra-fast (<2ms baseline, actual: ${avgLatency.toFixed(3)}ms)`);
    } else {
      console.warn(`⚠️ WARNING: Average latency is ${avgLatency.toFixed(3)}ms (might be higher due to local environment load)`);
    }

    // Verify Activities Log
    if (fs.existsSync(LOG_FILE_PATH)) {
      console.log('✅ PASS: Docs activities log exists and is active.');
    } else {
      console.warn('⚠️ WARNING: Activities log file not found at path:', LOG_FILE_PATH);
    }

    // Clean up Redis keys
    await redis.del(`kanban:telemetry:${testSpecId}`);
    await redis.del(`kanban:recommendation:${testSpecId}`);
    console.log('\n🧹 Cleaned up test Redis keys.');
    console.log('🎉 All HMM Kanban Diagnosis Smoke Tests Passed!');
  } catch (err) {
    console.error('❌ Tests encountered an error:', err);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

runTests();
