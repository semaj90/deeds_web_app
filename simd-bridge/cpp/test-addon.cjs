/**
 * tensorrt_bridge.node — Eval Test Suite
 *
 * Assertion-based tests for all 14 N-API exports.
 * Run: powershell -Command '$env:PATH = "C:\libtorch-...\lib;" + $env:PATH; node test-addon.cjs'
 */

const path = require('path');
const { strict: assert } = require('assert');

const addonPath = path.join(__dirname, 'build', 'Release', 'tensorrt_bridge.node');
const a = require(addonPath);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

function approxEqual(actual, expected, eps = 1e-4) {
  assert(Math.abs(actual - expected) < eps,
    `Expected ~${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`);
}

// ── Diagnostics ─────────────────────────────────────────────────────

console.log('\n=== Diagnostics ===');
console.log('  simdjson backend:', a.simdJsonBackend());
console.log('  CUDA available:', a.checkCudaAvailable());
console.log('  Exports:', Object.keys(a).length);

// ── Module exports ──────────────────────────────────────────────────

console.log('\n=== Module Exports ===');

test('exports all 14 functions', () => {
  const expected = [
    'bridgeSIMD', 'checkCudaAvailable',
    'graphSimilarity', 'clusterEmbeddings', 'computeCaseEmbedding',
    'lstmAdd', 'somCache', 'dotProduct', 'scale', 'relu',
    'simdJsonParse', 'simdJsonValidate', 'simdJsonExtractNumbers', 'simdJsonBackend',
  ];
  for (const name of expected) {
    assert(typeof a[name] === 'function', `Missing export: ${name}`);
  }
});

test('checkCudaAvailable returns 0 or 1', () => {
  const val = a.checkCudaAvailable();
  assert(val === 0 || val === 1, `Expected 0 or 1, got ${val}`);
});

test('simdJsonBackend returns non-empty string', () => {
  const backend = a.simdJsonBackend();
  assert(typeof backend === 'string' && backend.length > 0, `Got: "${backend}"`);
});

// ── SIMD dot product ────────────────────────────────────────────────

console.log('\n=== SIMD: dotProduct ===');

test('dotProduct([1,2,3], [4,5,6]) = 32', () => {
  const r = a.dotProduct(new Float32Array([1,2,3]), new Float32Array([4,5,6]), 3);
  assert(r instanceof Float32Array, 'Expected Float32Array');
  approxEqual(r[0], 32);
});

test('dotProduct zero vectors = 0', () => {
  const r = a.dotProduct(new Float32Array([0,0,0]), new Float32Array([1,2,3]), 3);
  approxEqual(r[0], 0);
});

test('dotProduct orthogonal = 0', () => {
  const r = a.dotProduct(new Float32Array([1,0]), new Float32Array([0,1]), 2);
  approxEqual(r[0], 0);
});

// ── SIMD scale ──────────────────────────────────────────────────────

console.log('\n=== SIMD: scale ===');

test('scale([1,2,3], 2.0) = [2,4,6]', () => {
  const r = a.scale(new Float32Array([1,2,3]), 2.0, 3);
  assert(r instanceof Float32Array);
  approxEqual(r[0], 2); approxEqual(r[1], 4); approxEqual(r[2], 6);
});

test('scale by 0 returns zeros', () => {
  const r = a.scale(new Float32Array([5,10,15]), 0, 3);
  for (let i = 0; i < 3; i++) approxEqual(r[i], 0);
});

test('scale by -1 negates', () => {
  const r = a.scale(new Float32Array([3, -2, 0]), -1, 3);
  approxEqual(r[0], -3); approxEqual(r[1], 2); approxEqual(r[2], 0);
});

// ── SIMD relu ───────────────────────────────────────────────────────

console.log('\n=== SIMD: relu ===');

test('relu([-1, 0, 1, 2]) = [0, 0, 1, 2]', () => {
  const r = a.relu(new Float32Array([-1, 0, 1, 2]), 4);
  approxEqual(r[0], 0); approxEqual(r[1], 0);
  approxEqual(r[2], 1); approxEqual(r[3], 2);
});

test('relu all negative = all zeros', () => {
  const r = a.relu(new Float32Array([-5, -3, -0.1]), 3);
  for (let i = 0; i < 3; i++) approxEqual(r[i], 0);
});

test('relu all positive = identity', () => {
  const r = a.relu(new Float32Array([1, 2, 3]), 3);
  approxEqual(r[0], 1); approxEqual(r[1], 2); approxEqual(r[2], 3);
});

// ── GPU: graphSimilarity ────────────────────────────────────────────

console.log('\n=== GPU: graphSimilarity ===');

test('similarity matrix diagonal = 1.0', () => {
  const data = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const r = a.graphSimilarity(data, 2, 3);
  assert(r instanceof Float32Array);
  assert.equal(r.length, 4); // 2x2
  approxEqual(r[0], 1.0); // [0][0]
  approxEqual(r[3], 1.0); // [1][1]
});

test('similarity matrix is symmetric', () => {
  const data = new Float32Array([1,0,0, 0,1,0, 0,0,1]); // 3 orthogonal vectors
  const r = a.graphSimilarity(data, 3, 3);
  // r[i*3+j] should equal r[j*3+i]
  for (let i = 0; i < 3; i++) {
    for (let j = i; j < 3; j++) {
      approxEqual(r[i*3+j], r[j*3+i]);
    }
  }
});

test('identical vectors have similarity 1.0', () => {
  const data = new Float32Array([1,2,3, 1,2,3]);
  const r = a.graphSimilarity(data, 2, 3);
  approxEqual(r[1], 1.0); // [0][1]
  approxEqual(r[2], 1.0); // [1][0]
});

test('orthogonal vectors have similarity 0.0', () => {
  const data = new Float32Array([1,0, 0,1]);
  const r = a.graphSimilarity(data, 2, 2);
  approxEqual(r[1], 0.0);
});

// ── GPU: clusterEmbeddings ──────────────────────────────────────────

console.log('\n=== GPU: clusterEmbeddings ===');

test('cluster 4 points into 2 groups', () => {
  // Two clear clusters: (1,1), (1.1,1.1) and (10,10), (10.1,10.1)
  const data = new Float32Array([1,1, 1.1,1.1, 10,10, 10.1,10.1]);
  const r = a.clusterEmbeddings(data, 4, 2, 2, 100);
  assert(r instanceof Int32Array);
  assert.equal(r.length, 4);
  // Points 0,1 should share a cluster; points 2,3 should share a different one
  assert.equal(r[0], r[1], 'Nearby points 0,1 should cluster together');
  assert.equal(r[2], r[3], 'Nearby points 2,3 should cluster together');
  assert.notEqual(r[0], r[2], 'Distant groups should be different clusters');
});

test('cluster assignments in valid range [0, k)', () => {
  const data = new Float32Array([1,2, 3,4, 5,6, 7,8, 9,10]);
  const k = 3;
  const r = a.clusterEmbeddings(data, 5, 2, k, 100);
  for (let i = 0; i < r.length; i++) {
    assert(r[i] >= 0 && r[i] < k, `Assignment ${r[i]} out of range [0, ${k})`);
  }
});

// ── GPU: computeCaseEmbedding ───────────────────────────────────────

console.log('\n=== GPU: computeCaseEmbedding ===');

test('weighted embedding result has correct dimension', () => {
  const weights = new Float32Array([0.5, 0.5]);
  const embeddings = new Float32Array([1,0,0, 0,1,0]); // 2 vectors of dim 3
  const r = a.computeCaseEmbedding(weights, embeddings, 2, 3);
  assert(r instanceof Float32Array);
  assert.equal(r.length, 3);
});

test('equal weights produce normalized midpoint', () => {
  const weights = new Float32Array([1, 1]);
  const embeddings = new Float32Array([1,0, 0,1]); // 2 vectors of dim 2
  const r = a.computeCaseEmbedding(weights, embeddings, 2, 2);
  // Should be normalized (0.5, 0.5) → ~(0.707, 0.707)
  approxEqual(r[0], r[1]); // symmetric
  const norm = Math.sqrt(r[0]*r[0] + r[1]*r[1]);
  approxEqual(norm, 1.0, 0.01); // unit length
});

// ── LSTM add ────────────────────────────────────────────────────────

console.log('\n=== GPU: lstmAdd ===');

test('lstmAdd([1,2], [3,4]) = [4,6]', () => {
  const r = a.lstmAdd(new Float32Array([1,2]), new Float32Array([3,4]), 2);
  assert(r instanceof Float32Array);
  approxEqual(r[0], 4); approxEqual(r[1], 6);
});

test('lstmAdd with zeros = identity', () => {
  const r = a.lstmAdd(new Float32Array([5,10]), new Float32Array([0,0]), 2);
  approxEqual(r[0], 5); approxEqual(r[1], 10);
});

test('lstmAdd negative values', () => {
  const r = a.lstmAdd(new Float32Array([1,-2,3]), new Float32Array([-1,2,-3]), 3);
  approxEqual(r[0], 0); approxEqual(r[1], 0); approxEqual(r[2], 0);
});

// ── SOM Cache ───────────────────────────────────────────────────────

console.log('\n=== GPU: somCache ===');

test('somCache copies input to output', () => {
  const input = new Float32Array([1.5, 2.5, 3.5, 4.5]);
  const r = a.somCache(input, 4);
  assert(r instanceof Float32Array);
  assert.equal(r.length, 4);
  for (let i = 0; i < 4; i++) approxEqual(r[i], input[i]);
});

// ── simdjson ────────────────────────────────────────────────────────

console.log('\n=== simdjson ===');

test('parse valid JSON returns minified string', () => {
  const r = a.simdJsonParse('{"hello":"world","num":42}');
  assert.equal(typeof r, 'string');
  const parsed = JSON.parse(r);
  assert.equal(parsed.hello, 'world');
  assert.equal(parsed.num, 42);
});

test('parse invalid JSON throws', () => {
  assert.throws(() => a.simdJsonParse('{bad json}'));
});

test('validate returns true for valid JSON', () => {
  assert.equal(a.simdJsonValidate('{"valid":true}'), true);
  assert.equal(a.simdJsonValidate('[1,2,3]'), true);
  assert.equal(a.simdJsonValidate('"hello"'), true);
});

test('validate returns false for invalid JSON', () => {
  assert.equal(a.simdJsonValidate('{bad}'), false);
  assert.equal(a.simdJsonValidate('not json'), false);
});

test('extractNumbers with JSON Pointer', () => {
  const json = '{"vec":[1.0, 2.5, 3.14]}';
  const r = a.simdJsonExtractNumbers(json, '/vec');
  assert(r instanceof Float64Array);
  assert.equal(r.length, 3);
  approxEqual(r[0], 1.0); approxEqual(r[1], 2.5); approxEqual(r[2], 3.14, 0.001);
});

test('extractNumbers nested pointer', () => {
  const json = '{"a":{"b":{"c":[10,20,30]}}}';
  const r = a.simdJsonExtractNumbers(json, '/a/b/c');
  assert.equal(r.length, 3);
  approxEqual(r[0], 10); approxEqual(r[1], 20); approxEqual(r[2], 30);
});

test('extractNumbers bad pointer throws', () => {
  assert.throws(() => a.simdJsonExtractNumbers('{"a":1}', '/nonexistent'));
});

// ── Error handling ──────────────────────────────────────────────────

console.log('\n=== Error handling ===');

test('dotProduct rejects wrong type', () => {
  assert.throws(() => a.dotProduct([1,2,3], [4,5,6], 3));
});

test('graphSimilarity rejects bad dimensions', () => {
  assert.throws(() => a.graphSimilarity(new Float32Array([1,2,3]), 10, 10));
});

test('clusterEmbeddings rejects insufficient args', () => {
  assert.throws(() => a.clusterEmbeddings(new Float32Array([1,2]), 1));
});

// ── Larger workloads ────────────────────────────────────────────────

console.log('\n=== Performance: larger workloads ===');

test('dotProduct 10K elements', () => {
  const n = 10000;
  const a1 = new Float32Array(n).fill(1);
  const b1 = new Float32Array(n).fill(2);
  const t0 = performance.now();
  const r = a.dotProduct(a1, b1, n);
  const ms = (performance.now() - t0).toFixed(2);
  approxEqual(r[0], 20000, 1); // 10000 * 1 * 2
  console.log(`         (10K dot: ${ms}ms)`);
});

test('graphSimilarity 50x768 (realistic embedding batch)', () => {
  const n = 50, dim = 768;
  const data = new Float32Array(n * dim);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() - 0.5;
  const t0 = performance.now();
  const r = a.graphSimilarity(data, n, dim);
  const ms = (performance.now() - t0).toFixed(2);
  assert.equal(r.length, n * n);
  // Diagonal should be ~1.0
  for (let i = 0; i < n; i++) approxEqual(r[i * n + i], 1.0, 0.01);
  console.log(`         (50x768 sim: ${ms}ms)`);
});

test('clusterEmbeddings 200x128, k=5', () => {
  const n = 200, dim = 128, k = 5;
  const data = new Float32Array(n * dim);
  for (let i = 0; i < data.length; i++) data[i] = Math.random();
  const t0 = performance.now();
  const r = a.clusterEmbeddings(data, n, dim, k, 50);
  const ms = (performance.now() - t0).toFixed(2);
  assert.equal(r.length, n);
  for (let i = 0; i < n; i++) assert(r[i] >= 0 && r[i] < k);
  console.log(`         (200x128 k=5: ${ms}ms)`);
});

test('simdJsonParse large object (10K keys)', () => {
  const obj = {};
  for (let i = 0; i < 10000; i++) obj[`key_${i}`] = i * 1.1;
  const json = JSON.stringify(obj);
  const t0 = performance.now();
  const r = a.simdJsonParse(json);
  const ms = (performance.now() - t0).toFixed(2);
  const parsed = JSON.parse(r);
  assert.equal(parsed.key_0, 0);
  approxEqual(parsed.key_9999, 10998.9, 0.1);
  console.log(`         (10K keys parse: ${ms}ms, ${(json.length/1024).toFixed(0)}KB)`);
});

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
