#!/usr/bin/env node
/**
 * qdrant-simdjson-parser-smoke.mjs
 *
 * Self-contained smoke test for the Qdrant simdjson hot-path logic.
 * Replicates the threshold + fallback logic inline so it runs as a plain
 * Node.js script without TypeScript compilation or $lib aliases.
 *
 * Tests:
 *   1. Small payload (<5000 bytes) → must use JSON.parse
 *   2. Large payload (>=5000 bytes) → simdjson if addon present, JSON.parse fallback
 *   3. Corrupt JSON → must throw (both parsers propagate errors)
 *
 * Usage:
 *   node scripts/smoke/qdrant-simdjson-parser-smoke.mjs
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const SIMDJSON_THRESHOLD_BYTES = 5000;

// ── Try to load the native simdjson addon (same as simdjson-bridge) ──────────

let _simdjsonAvailable = null;
let _fastJsonParse = null;

function tryLoadSimdjson() {
  if (_simdjsonAvailable !== null) return _simdjsonAvailable;
  const candidates = [
    resolve(ROOT, 'node_modules/simdjson/build/Release/simdjson.node'),
    resolve(ROOT, '../simd-bridge/build/Release/simdjson.node'),
    resolve(ROOT, 'build/Release/simdjson.node'),
  ];
  for (const p of candidates) {
    try {
      const addon = require(p);
      if (typeof addon.parse === 'function') {
        _fastJsonParse = (text) => addon.parse(text);
        _simdjsonAvailable = true;
        return true;
      }
    } catch { /* skip */ }
  }
  // Also try the npm package directly
  try {
    const simdjson = require('simdjson');
    if (typeof simdjson.parse === 'function') {
      _fastJsonParse = (text) => simdjson.parse(text);
      _simdjsonAvailable = true;
      return true;
    }
  } catch { /* not installed */ }
  _simdjsonAvailable = false;
  return false;
}

// ── Inline parse logic (mirrors parse-qdrant-json.ts) ───────────────────────

async function parseQdrantResponse(mockText, operation) {
  const bytes = Buffer.byteLength(mockText, 'utf-8');
  const useSimd = bytes >= SIMDJSON_THRESHOLD_BYTES && tryLoadSimdjson();
  const start = performance.now();

  let parsed;
  let parser;

  if (useSimd) {
    try {
      parsed = _fastJsonParse(mockText);
      parser = 'simdjson';
    } catch {
      parsed = JSON.parse(mockText);
      parser = 'json.parse (simdjson fallback)';
    }
  } else {
    parsed = JSON.parse(mockText);
    parser = 'json.parse';
  }

  const elapsed = (performance.now() - start).toFixed(3);
  return { parsed, trace: { parser, responseBytes: bytes, elapsedMs: elapsed, operation } };
}

// ── Tests ────────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(label) { console.log(`  ✅ ${label}`); pass++; }
function ko(label, detail) { console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`); fail++; }

console.log('=== Qdrant simdjson Parser Smoke Test ===\n');
console.log(`  Threshold: ${SIMDJSON_THRESHOLD_BYTES} bytes`);
console.log(`  simdjson addon: ${tryLoadSimdjson() ? 'available' : 'not found (JSON.parse fallback)'}\n`);

// ── Test 1: Small payload ─────────────────────────────────────────────────

{
  const text = JSON.stringify({ result: 'ok', count: 42 });
  const bytes = Buffer.byteLength(text, 'utf-8');
  const { parsed, trace } = await parseQdrantResponse(text, 'search');

  console.log(`Test 1 — small payload (${bytes} bytes)`);
  if (trace.parser === 'json.parse') {
    ok(`parser = json.parse (correct for ${bytes} < ${SIMDJSON_THRESHOLD_BYTES} bytes)`);
  } else {
    ko('Expected json.parse for small payload', `got ${trace.parser}`);
  }
  if (parsed.result === 'ok' && parsed.count === 42) {
    ok('parsed values correct');
  } else {
    ko('parsed values wrong', JSON.stringify(parsed));
  }
  console.log(`  trace: ${JSON.stringify(trace)}\n`);
}

// ── Test 2: Large payload ─────────────────────────────────────────────────

{
  const items = Array.from({ length: 200 }, (_, i) => ({
    id: i,
    score: 0.99 - i * 0.001,
    payload: {
      feature: `feature_${i}`,
      sourceRef: `source_ref_for_item_${i}_with_extra_padding_to_exceed_threshold`,
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
    },
  }));
  const text = JSON.stringify({ result: 'ok', items });
  const bytes = Buffer.byteLength(text, 'utf-8');
  const { parsed, trace } = await parseQdrantResponse(text, 'scroll');

  console.log(`Test 2 — large payload (${bytes} bytes)`);
  if (bytes >= SIMDJSON_THRESHOLD_BYTES) {
    ok(`payload size ${bytes} >= threshold ${SIMDJSON_THRESHOLD_BYTES}`);
  } else {
    ko(`payload too small to test large path`, `${bytes} bytes`);
  }
  ok(`parser used: ${trace.parser} (simdjson if addon present, json.parse otherwise — both correct)`);
  if (parsed.items?.length === 200) {
    ok('parsed item count correct (200)');
  } else {
    ko('parsed item count wrong', String(parsed.items?.length));
  }
  console.log(`  trace: ${JSON.stringify(trace)}\n`);
}

// ── Test 3: Corrupt JSON ──────────────────────────────────────────────────

{
  console.log('Test 3 — corrupt JSON (should throw)');
  try {
    await parseQdrantResponse('{ corrupt json: [ }', 'upsert');
    ko('Should have thrown on corrupt JSON');
  } catch (err) {
    ok(`threw as expected: ${err.message.slice(0, 60)}`);
  }
  console.log();
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);

