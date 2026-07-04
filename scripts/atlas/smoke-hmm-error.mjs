#!/usr/bin/env node
/**
 * HMM Error Classifier smoke test
 * Tests observation normalization and Viterbi decode without hitting Postgres.
 *
 * Usage: node scripts/atlas/smoke-hmm-error.mjs
 */

import { createHash } from 'node:crypto';

// ── Mirror of hmm-error-classifier.ts (standalone, no $lib imports) ──────────

const OBS_PATTERNS = [
  { pattern: /relation.*does not exist|table.*not found/i,    obs: 'SQL_RELATION_MISSING' },
  { pattern: /column.*does not exist/i,                        obs: 'COLUMN_MISSING' },
  { pattern: /cannot find module|import.*fail|ERR_MODULE/i,    obs: 'IMPORT_FAIL' },
  { pattern: /404|not found/i,                                 obs: 'HTTP_404' },
  { pattern: /500|internal server error/i,                     obs: 'HTTP_500' },
  { pattern: /timeout|timed out|ETIMEDOUT|AbortError/i,        obs: 'TIMEOUT' },
  { pattern: /empty result|no rows|0 rows/i,                   obs: 'EMPTY_RESULT' },
  { pattern: /decode.*fail|msgpack|BYTEA|binary.*invalid/i,    obs: 'DECODE_FAIL' },
  { pattern: /TypeScript|TS\d{4}|type.*error|svelte-check/i,  obs: 'TYPECHECK_FAIL' },
];

function normalizeObs(raw) {
  for (const { pattern, obs } of OBS_PATTERNS) {
    if (pattern.test(raw)) return obs;
  }
  return null;
}

const EMISSION = {
  schema_mismatch:    { SQL_RELATION_MISSING: 0.9, COLUMN_MISSING: 0.8, HTTP_500: 0.3, TYPECHECK_FAIL: 0.4 },
  missing_dependency: { IMPORT_FAIL: 0.9, HTTP_404: 0.5, TYPECHECK_FAIL: 0.6 },
  stale_cache:        { EMPTY_RESULT: 0.7, HTTP_404: 0.4 },
  retrieval_miss:     { EMPTY_RESULT: 0.9, HTTP_404: 0.6, HTTP_500: 0.2 },
  worker_timeout:     { TIMEOUT: 0.95, HTTP_500: 0.4, EMPTY_RESULT: 0.3 },
  codec_failure:      { DECODE_FAIL: 0.95, HTTP_500: 0.3, TYPECHECK_FAIL: 0.5 },
  unknown:            { HTTP_500: 0.3, EMPTY_RESULT: 0.2, TIMEOUT: 0.2 },
};

const PRIOR = {
  schema_mismatch: 0.20, missing_dependency: 0.15, stale_cache: 0.15,
  retrieval_miss: 0.20,  worker_timeout: 0.15,     codec_failure: 0.10, unknown: 0.05,
};

const SUGGESTED_ACTION = {
  schema_mismatch:    'Run drizzle-kit introspect and verify migration was applied',
  missing_dependency: 'Verify npm install ran; check $lib alias resolution',
  stale_cache:        'Invalidate BitFrost keys; re-warm from Postgres',
  retrieval_miss:     'Check Qdrant collection count and chunk_index population',
  worker_timeout:     'Increase AbortSignal.timeout; reduce batch size; check Gemma4 :8090',
  codec_failure:      'Verify @msgpack/msgpack round-trip; check BYTEA column integrity',
  unknown:            'Inspect evidence for raw error text; escalate to operator',
};

function classify(observations) {
  if (!observations.length) return { state: 'unknown', confidence: 0 };
  const states = Object.keys(EMISSION);
  let scores = {};
  for (const s of states) scores[s] = (PRIOR[s] ?? 0.05) * (EMISSION[s][observations[0]] ?? 0.01);
  for (let t = 1; t < observations.length; t++) {
    const next = {};
    for (const s of states) next[s] = scores[s] * (EMISSION[s][observations[t]] ?? 0.01);
    scores = next;
  }
  let best = 'unknown', bestScore = -1;
  for (const [s, v] of Object.entries(scores)) if (v > bestScore) { bestScore = v; best = s; }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { state: best, confidence: total > 0 ? bestScore / total : 0 };
}

// ── Test cases ────────────────────────────────────────────────────────────────

const TESTS = [
  {
    label: 'schema_mismatch — relation does not exist',
    raw: 'ERROR: relation "atlas_higher_hop_index" does not exist',
    expectedState: 'schema_mismatch',
  },
  {
    label: 'missing_dependency — ERR_MODULE_NOT_FOUND',
    raw: 'Error: Cannot find module @ast-grep/napi (ERR_MODULE_NOT_FOUND)',
    expectedState: 'missing_dependency',
  },
  {
    label: 'worker_timeout — AbortError',
    raw: 'AbortError: The operation was aborted due to timeout',
    expectedState: 'worker_timeout',
  },
  {
    label: 'codec_failure — msgpack decode failed',
    raw: 'Failed to decode msgpack: BYTEA sequence invalid at offset 4',
    expectedState: 'codec_failure',
  },
  {
    label: 'retrieval_miss — empty result',
    raw: 'Query returned 0 rows — empty result for packet_key lookup',
    expectedState: 'retrieval_miss',
  },
  {
    label: 'sequence: TIMEOUT + EMPTY_RESULT → worker_timeout',
    rawSeq: ['AbortError: timed out', 'Query returned 0 rows'],
    expectedState: 'worker_timeout',
  },
  {
    label: 'sequence: SQL_RELATION + COLUMN → schema_mismatch',
    rawSeq: ['relation "atlas_codebase_packets" does not exist', 'column "latent_64" does not exist'],
    expectedState: 'schema_mismatch',
  },
];

let passed = 0, failed = 0;

for (const test of TESTS) {
  const raws = test.rawSeq ?? [test.raw];
  const observations = raws.map(r => normalizeObs(r)).filter(Boolean);
  const result = classify(observations);

  const ok = result.state === test.expectedState;
  const icon = ok ? '✅' : '❌';
  console.log(
    `${icon} ${test.label}\n` +
    `   obs=${JSON.stringify(observations)} → state=${result.state}` +
    ` (conf=${result.confidence.toFixed(3)})` +
    `${ok ? '' : ` EXPECTED=${test.expectedState}`}`
  );

  if (ok) passed++; else failed++;
}

console.log(`\n[smoke:hmm] ${passed}/${TESTS.length} passed${failed ? ` — ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
