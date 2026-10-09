#!/usr/bin/env node
/** Offline Gemma 4 Transformers.js ↔ LiteRT-LM evaluation contract preflight.
 * Does not load weights, fetch URLs, or access the GPU. Not a runtime parity result.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(root, 'scripts/atlas/fixtures/gemma4-browser-paired-eval-v1.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));
function sha(x) { return 'sha256:' + createHash('sha256').update(JSON.stringify(x)).digest('hex'); }
export function evaluatePairingReadinessV1(data) {
  assert.equal(data.schema, 'atlas.gemma4-browser-paired-eval-fixtures.v1');
  assert.ok(Array.isArray(data.cases) && data.cases.length > 0 && data.cases.length <= 32);
  const ids = new Set();
  for (const row of data.cases) {
    assert.ok(typeof row.id === 'string' && row.id.length > 0 && !ids.has(row.id), 'UNIQUE_CASE_ID_REQUIRED');
    ids.add(row.id);
    assert.ok(typeof row.prompt === 'string' && row.prompt.length > 0 && row.prompt.length <= 2000, 'BOUNDED_PROMPT_REQUIRED');
    assert.ok(['classification', 'grounded_extract', 'abstention'].includes(row.task), 'TASK_INVALID');
    assert.ok(row.expect && typeof row.expect === 'object' && !Array.isArray(row.expect), 'EXPECTED_OUTPUT_REQUIRED');
  }
  const engines = ['transformersjs-webgpu', 'litertlm-web'];
  const readiness = Object.fromEntries(engines.map(engine => [engine, {
    artifactSha256: null, modelRevision: null, tokenizerSha256: null,
    runtimeVersion: null, modelLoaded: false, backendVerified: false,
    executionReceipt: null, status: 'NOT_PROVEN',
  }]));
  return {
    schema: 'atlas.gemma4-browser-paired-eval-preflight.v1',
    status: 'FIXTURE_CONTRACT_VALID_RUNTIME_PARITY_NOT_PROVEN',
    fixtureCount: data.cases.length, fixtureChecksum: sha(data),
    engines: readiness, comparable: false,
    canonicalAuthority: false, runtimePromotionEligible: false,
    modelLoaded: false, networkRequests: false, storeWrites: false,
    nextGates: ['PIN_MODEL_TOKENIZER_AND_GRAPH_DIGESTS', 'VERIFY_WEBGPU_RUNTIME_CAPABILITIES',
      'VERIFY_LITERTLM_WEB_COMPATIBLE_ASSET', 'CAPTURE_SEPARATE_RUNTIME_EXECUTION_RECEIPTS',
      'NORMALIZE_SAME_PROMPT_AND_DECODING_SETTINGS', 'COMPARE_QUALITY_LATENCY_MEMORY_AND_ABSTENTION'],
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(evaluatePairingReadinessV1(fixtures), null, 2) + '\n');
}
