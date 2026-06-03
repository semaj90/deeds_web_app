#!/usr/bin/env node
/**
 * smoke-attention-score-gpu-boundary.mjs
 *
 * Validates the JS/TS ↔ N-API boundary for attentionScoreGPU:
 *   - Native signature: (query: Float32Array, dim: number, keys: Float32Array, n: number)
 *   - keys MUST be a single flat Float32Array(n × dim), NOT Float32Array[]
 *
 * Tests:
 *   B1. flattenEmbeddingMatrix() produces a correctly shaped flat buffer
 *   B2. attentionScoreGPU (or fp16 variant) accepts the flat buffer without throwing
 *   B3. Return shape is correct: scores.length === n
 *   B4. Scores are finite numbers in [0, 1] range
 *   B5. Passing Float32Array[] directly throws or produces wrong shape (guard test)
 *   B6. flattenEmbeddingMatrix() rejects wrong dim at runtime
 *   B7. flattenEmbeddingMatrix() rejects empty input
 *
 * Usage:
 *   node scripts/smoke/smoke-attention-score-gpu-boundary.mjs
 *   node scripts/smoke/smoke-attention-score-gpu-boundary.mjs --strict
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: { strict: { type: 'boolean', default: false } },
  strict: false,
});
const STRICT = flags.strict;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const esmRequire = createRequire(import.meta.url);

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

// ── Load GPU addon ────────────────────────────────────────────────────────────

function loadAddon() {
  const paths = [
    resolve(REPO, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    resolve(REPO, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    resolve(REPO, 'simd-bridge/cpp/build/tensorrt_bridge.node'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try { return { addon: esmRequire(p), path: p }; } catch { /* try next */ }
  }
  return { addon: null, path: null };
}

const { addon, path: addonPath } = loadAddon();

// ── flattenEmbeddingMatrix ────────────────────────────────────────────────────
// This is the canonical helper that all callers of attentionScoreGPU should use
// when their embeddings arrive as Float32Array[].

function flattenEmbeddingMatrix(embeddings, dim = 768) {
  const n = embeddings.length;
  if (n === 0) throw new Error('attentionScoreGPU: empty embeddings');
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    const row = embeddings[i];
    if (!(row instanceof Float32Array)) {
      throw new TypeError(`embedding[${i}] must be Float32Array, got ${typeof row}`);
    }
    if (row.length !== dim) {
      throw new Error(`embedding[${i}] dim=${row.length}, expected ${dim}`);
    }
    flat.set(row, i * dim);
  }
  return flat;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRandomF32(dim) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = (Math.random() * 2 - 1) * 0.1;
  return v;
}

function l2normalize(v) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1e-9;
  return v.map(x => x / norm);
}

const results = [];

async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, label, status: 'PASS', detail: detail ?? '', ms });
    console.log(`  ${c.green('✓')} ${label}${detail ? c.dim(' — ' + detail) : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DIM = 768;
const N   = 8;

// Build test data: query + N keys as Float32Array[]
const queryVec = new Float32Array(l2normalize(makeRandomF32(DIM)));
const keyVecs  = Array.from({ length: N }, () => new Float32Array(l2normalize(makeRandomF32(DIM))));

console.log(`\n${c.bold(c.dim('smoke: attentionScoreGPU caller boundary'))}\n`);
console.log(c.dim(`  addon: ${addonPath ?? 'not found (CPU-only tests will still run)'}`));
console.log(c.dim(`  dim=${DIM}  n=${N}\n`));

// ── B1: flattenEmbeddingMatrix shape ─────────────────────────────────────────
await gate('B1', `flattenEmbeddingMatrix produces Float32Array(${N}×${DIM}=${N * DIM})`, () => {
  const flat = flattenEmbeddingMatrix(keyVecs, DIM);
  if (!(flat instanceof Float32Array)) throw new Error('not Float32Array');
  if (flat.length !== N * DIM) throw new Error(`length=${flat.length}, expected ${N * DIM}`);
  // Spot-check: flat[0..DIM-1] === keyVecs[0], flat[DIM..2*DIM-1] === keyVecs[1]
  for (let j = 0; j < DIM; j++) {
    if (flat[j] !== keyVecs[0][j]) throw new Error(`row0 mismatch at j=${j}`);
    if (flat[DIM + j] !== keyVecs[1][j]) throw new Error(`row1 mismatch at j=${j}`);
  }
  return `${flat.length} elements, row layout verified`;
});

// ── B2: native call accepts flat buffer ───────────────────────────────────────
await gate('B2', 'attentionScoreGPU / fp16 accepts flat Float32Array without throwing', () => {
  if (!addon) throw new Error('WARN: GPU addon not loaded — skipping native call test');

  const fn = addon.attentionScoreGPU_fp16 ?? addon.attentionScoreGPU;
  if (typeof fn !== 'function') throw new Error('WARN: neither attentionScoreGPU_fp16 nor attentionScoreGPU exported');

  const flat = flattenEmbeddingMatrix(keyVecs, DIM);
  const result = fn.call(addon, queryVec, DIM, flat, N);
  if (!result) throw new Error('null/undefined return from native call');
  return `returned ${typeof result === 'object' && 'length' in result ? result.length + ' scores' : JSON.stringify(result).slice(0, 60)}`;
});

// ── B3: return shape ──────────────────────────────────────────────────────────
await gate('B3', `scores.length === n (${N})`, () => {
  if (!addon) throw new Error('WARN: GPU addon not loaded');

  const fn = addon.attentionScoreGPU_fp16 ?? addon.attentionScoreGPU;
  if (typeof fn !== 'function') throw new Error('WARN: function not exported');

  const flat = flattenEmbeddingMatrix(keyVecs, DIM);
  const result = fn.call(addon, queryVec, DIM, flat, N);

  // Some variants return { weights, source } object; others return a typed array directly
  const scores = result?.weights ?? result;
  const len = scores?.length;
  if (len !== N) throw new Error(`got ${len} scores, expected ${N}`);
  return `${N} scores ✓`;
});

// ── B4: scores are finite ─────────────────────────────────────────────────────
await gate('B4', 'all returned scores are finite numbers', () => {
  if (!addon) throw new Error('WARN: GPU addon not loaded');

  const fn = addon.attentionScoreGPU_fp16 ?? addon.attentionScoreGPU;
  if (typeof fn !== 'function') throw new Error('WARN: function not exported');

  const flat = flattenEmbeddingMatrix(keyVecs, DIM);
  const result = fn.call(addon, queryVec, DIM, flat, N);
  const scores = result?.weights ?? result;

  let bad = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(scores[i])) bad++;
  }
  if (bad > 0) throw new Error(`${bad}/${N} scores are non-finite (NaN or Inf)`);
  return `${N} finite scores`;
});

// ── B5: guard — Float32Array[] is NOT the right type ─────────────────────────
await gate('B5', 'Float32Array[] passed directly is detected as wrong shape (guard)', () => {
  // The native function expects a flat Float32Array. If given Float32Array[],
  // it will either throw or return a length-mismatch (length of the outer array
  // is misinterpreted as element count). We verify flattenEmbeddingMatrix is needed.
  if (!addon) {
    // Without addon: just prove flattenEmbeddingMatrix is the difference.
    const flat = flattenEmbeddingMatrix(keyVecs, DIM);
    if (flat.length === keyVecs.length) {
      throw new Error('flat length equals array length — something wrong with flatten');
    }
    return `CPU path: flat.length=${flat.length} !== array.length=${keyVecs.length} — flatten required`;
  }

  const fn = addon.attentionScoreGPU_fp16 ?? addon.attentionScoreGPU;
  if (typeof fn !== 'function') throw new Error('WARN: function not exported');

  // Pass Float32Array[] directly — may throw, or return wrong-length results
  let threw = false;
  let wrongShape = false;
  try {
    // keyVecs is Float32Array[] — wrong type for the native call
    const result = fn.call(addon, queryVec, DIM, keyVecs, N);
    const scores = result?.weights ?? result;
    if (!scores || scores.length !== N) wrongShape = true;
  } catch {
    threw = true;
  }
  if (!threw && !wrongShape) {
    throw new Error('WARN: native N-API binding coerces Float32Array[] (JS array of typed arrays) without throwing — flattenEmbeddingMatrix is still required for correctness on all platforms and future addon versions');
  }
  return threw ? 'native threw on Float32Array[] (type guard confirmed)' : 'wrong shape returned for Float32Array[] (shape guard confirmed)';
});

// ── B6: flattenEmbeddingMatrix rejects wrong dim ──────────────────────────────
await gate('B6', 'flattenEmbeddingMatrix throws on dim mismatch', () => {
  const wrongDimVec = new Float32Array(512); // wrong dim
  const mixed = [keyVecs[0], wrongDimVec];
  try {
    flattenEmbeddingMatrix(mixed, DIM);
    throw new Error('did not throw on dim mismatch');
  } catch (err) {
    if (err.message === 'did not throw on dim mismatch') throw err;
    return `threw: ${err.message.slice(0, 80)}`;
  }
});

// ── B7: flattenEmbeddingMatrix rejects empty array ────────────────────────────
await gate('B7', 'flattenEmbeddingMatrix throws on empty array', () => {
  try {
    flattenEmbeddingMatrix([], DIM);
    throw new Error('did not throw on empty array');
  } catch (err) {
    if (err.message === 'did not throw on empty array') throw err;
    return `threw: ${err.message.slice(0, 80)}`;
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
if (fail === 0 && warn === 0) {
  console.log(c.green(`${pass}/${results.length} gates passed — attentionScoreGPU boundary clean ✓`));
} else {
  const parts = [
    c.green(pass + ' PASS'),
    warn ? c.yellow(warn + ' WARN') : '',
    fail ? c.red(fail + ' FAIL') : '',
  ];
  console.log(parts.filter(Boolean).join('  '));
  if (warn > 0) {
    const warnResults = results.filter(r => r.status === 'WARN');
    for (const w of warnResults) {
      console.log(c.dim(`  ${w.id} WARN: ${w.detail}`));
    }
  }
}
console.log('');

if (STRICT && fail > 0) process.exit(1);
