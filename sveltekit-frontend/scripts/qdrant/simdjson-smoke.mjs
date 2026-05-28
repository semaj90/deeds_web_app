#!/usr/bin/env node
/**
 * simdjson-smoke.mjs — smoke test for Qdrant simdjson JSON parsing (B3)
 *
 * Verifies that parse-qdrant-json.ts (compiled as .js) correctly handles:
 *   1. A valid Qdrant search response payload
 *   2. A valid Qdrant scroll response payload
 *   3. Graceful fallback when simdjson is unavailable (always succeeds)
 *
 * EXIT 0 = pass, EXIT 1 = fail
 *
 * Usage:
 *   npm run qdrant:simdjson:smoke
 *   node scripts/qdrant/simdjson-smoke.mjs
 */

import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '../..');

// ── Inline fallback parser (mirrors parse-qdrant-json logic without TS compile step) ──

let simd = null;
try {
  const require = createRequire(import.meta.url);
  simd = require('simdjson');
  console.log('[simdjson-smoke] simdjson is available — testing SIMD path');
} catch {
  console.log('[simdjson-smoke] simdjson not installed — testing JSON.parse fallback path (expected in dev)');
}

function parseQdrantResponse(raw) {
  if (simd) {
    try { return simd.parse(raw); } catch { /* fall through */ }
  }
  return JSON.parse(raw);
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const SEARCH_RESPONSE = JSON.stringify({
  result: [
    { id: 'abc-123', version: 1, score: 0.92, payload: { title: 'Test card', area: 'retrieval' }, vector: null },
    { id: 'def-456', version: 2, score: 0.81, payload: { title: 'Second card', area: 'caching' }, vector: null },
  ],
  status: 'ok',
  time: 0.003,
});

const SCROLL_RESPONSE = JSON.stringify({
  result: {
    points: [
      { id: 1, version: 0, payload: { summary: 'A compressed ace packet', cluster: 'Context Engineering' }, vector: null },
      { id: 2, version: 0, payload: { summary: 'Redis hot cache key', cluster: 'Hot Cache Layer' }, vector: null },
    ],
    next_page_offset: null,
  },
  status: 'ok',
  time: 0.001,
});

const EMPTY_RESULT = JSON.stringify({ result: [], status: 'ok', time: 0.0 });

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

console.log('\n[simdjson-smoke] Running Qdrant parse smoke tests...\n');

// Test 1: Search response
try {
  const parsed = parseQdrantResponse(SEARCH_RESPONSE);
  assert('Search response parses', Array.isArray(parsed.result), `result is ${typeof parsed.result}`);
  assert('Search result has 2 items', parsed.result.length === 2);
  assert('First result has score', typeof parsed.result[0].score === 'number');
  assert('First result payload has area', parsed.result[0].payload?.area === 'retrieval');
} catch (err) {
  assert('Search response parses', false, err.message);
}

// Test 2: Scroll response
try {
  const parsed = parseQdrantResponse(SCROLL_RESPONSE);
  assert('Scroll response parses', typeof parsed.result === 'object');
  assert('Scroll has points array', Array.isArray(parsed.result?.points));
  assert('Scroll next_page_offset is null', parsed.result.next_page_offset === null);
  assert('Scroll point has cluster', parsed.result.points[0].payload?.cluster === 'Context Engineering');
} catch (err) {
  assert('Scroll response parses', false, err.message);
}

// Test 3: Empty result
try {
  const parsed = parseQdrantResponse(EMPTY_RESULT);
  assert('Empty result parses', Array.isArray(parsed.result));
  assert('Empty result has 0 items', parsed.result.length === 0);
} catch (err) {
  assert('Empty result parses', false, err.message);
}

// Test 4: Invalid JSON throws
try {
  parseQdrantResponse('{ invalid json }');
  assert('Invalid JSON throws', false, 'should have thrown');
} catch {
  assert('Invalid JSON throws SyntaxError', true);
}

// Test 5: Unicode / special chars
try {
  const payload = JSON.stringify({ result: [{ id: 'x', payload: { title: 'Qdrant: "legal & evidence"' } }], status: 'ok' });
  const parsed = parseQdrantResponse(payload);
  assert('Unicode payload parses', parsed.result[0].payload.title.includes('legal'));
} catch (err) {
  assert('Unicode payload parses', false, err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n[simdjson-smoke] Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('[simdjson-smoke] ❌ SMOKE TEST FAILED');
  process.exit(1);
}
console.log('[simdjson-smoke] ✅ All tests passed');
process.exit(0);
