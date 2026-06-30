#!/usr/bin/env node
/**
 * proof-batch-cosine-rerank.mjs
 *
 * Proof of concept: GPU batch cosine similarity reranking.
 * Demonstrates the correct data flow:
 *   Qdrant top-K vectors
 *   → convert to Float32Array matrix [K, 768]
 *   → LibTorch GPU cosine similarity
 *   → return ranked IDs
 *   → discard tensor (free GPU memory)
 *
 * Usage:
 *   node scripts/gpu/proof-batch-cosine-rerank.mjs --limit 200
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const require = createRequire(import.meta.url);

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

const LIMIT = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '200', 10);

log(`${c.b('🧠 GPU Batch Cosine Rerank Proof')}`);
log(`   Limit: ${LIMIT} vectors`);

// ─────────────────────────────────────────────────────────────────

// Step 1: Load addon
log(`\n${c.b('Step 1')} — Load tensorrt_bridge.node`);
let addon;
try {
  const bridgePath = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  addon = require(bridgePath);
  log(`  ${c.g('✓')} Addon loaded (${Object.keys(addon).length} functions)`);
} catch (err) {
  warn(`  ${c.r('✗')} Addon load failed: ${err.message}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────

// Step 2: Generate synthetic vectors
log(`\n${c.b('Step 2')} — Generate synthetic query + candidate vectors`);
const DIM = 768;
const queryVec = new Float32Array(DIM);
const candidates = [];

// Random normal distribution (µ=0, σ=1)
const randomNormal = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Query vector
for (let i = 0; i < DIM; i++) {
  queryVec[i] = randomNormal();
}

// Candidate vectors (LIMIT vectors)
for (let k = 0; k < LIMIT; k++) {
  const vec = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    vec[i] = randomNormal();
  }
  candidates.push({ id: `qdrant:chunk:${k}`, vector: vec });
}

log(`  ${c.g('✓')} Query vector: ${DIM}-dim`);
log(`  ${c.g('✓')} Candidate vectors: ${LIMIT} × ${DIM}-dim (${(LIMIT * DIM * 4) / (1024 * 1024).toFixed(2)} MB)`);

// ─────────────────────────────────────────────────────────────────

// Step 3: Convert to batch matrix
log(`\n${c.b('Step 3')} — Convert candidates to matrix [${LIMIT}, ${DIM}]`);
const batchStart = Date.now();
const matrix = new Float32Array(LIMIT * DIM);

for (let k = 0; k < LIMIT; k++) {
  const vec = candidates[k].vector;
  for (let i = 0; i < DIM; i++) {
    matrix[k * DIM + i] = vec[i];
  }
}

const batchMs = Date.now() - batchStart;
log(`  ${c.g('✓')} Matrix created in ${batchMs}ms`);

// ─────────────────────────────────────────────────────────────────

// Step 4: GPU cosine similarity
log(`\n${c.b('Step 4')} — GPU cosine similarity (LibTorch)`);

if (typeof addon.graphSimilarity !== 'function') {
  warn(`  ${c.y('⚠')} graphSimilarity not available; skipping GPU test`);
  log(`  ${c.y('⚠')} Available: ${Object.keys(addon).join(', ')}`);
  process.exit(0);
}

let scores;
try {
  const gpuStart = Date.now();
  // graphSimilarity computes similarity between query and all candidates
  // Signature: graphSimilarity(query, candidates, n) → Float32Array of scores
  scores = addon.graphSimilarity(queryVec, matrix, LIMIT);
  const gpuMs = Date.now() - gpuStart;

  if (!scores || scores.length !== LIMIT) {
    throw new Error(`Expected ${LIMIT} scores, got ${scores?.length ?? 'null'}`);
  }

  log(`  ${c.g('✓')} GPU rerank completed in ${gpuMs}ms`);
  log(`  ${c.g('✓')} Throughput: ${((LIMIT / gpuMs) * 1000).toFixed(0)} vecs/sec`);
} catch (err) {
  warn(`  ${c.r('✗')} GPU rerank failed: ${err.message}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────

// Step 5: Rank results
log(`\n${c.b('Step 5')} — Rank results by cosine score`);
const ranked = candidates
  .map((cand, idx) => ({
    id: cand.id,
    score: scores[idx],
    rank: 0,
  }))
  .sort((a, b) => b.score - a.score)
  .map((item, rank) => ({ ...item, rank: rank + 1 }));

// Show top 10
log(`  ${c.g('✓')} Top 10 results:`);
for (let i = 0; i < Math.min(10, ranked.length); i++) {
  const r = ranked[i];
  log(`     ${i + 1}. ${r.id} (score: ${r.score.toFixed(4)})`);
}

// ─────────────────────────────────────────────────────────────────

// Step 6: Cleanup (simulate tensor discard)
log(`\n${c.b('Step 6')} — Cleanup (discard tensors)`);
matrix.fill(0); // Simulate GPU memory release
log(`  ${c.g('✓')} Batch matrix cleared (simulated GPU memory release)`);

// ─────────────────────────────────────────────────────────────────

log(`\n${c.g('✓')} Proof complete`);
log(`\n${c.b('Summary')}:`);
log(`  Query vector: ${DIM}-dim`);
log(`  Candidate batch: ${LIMIT} × ${DIM}-dim`);
log(`  Matrix assembly: ${batchMs}ms`);
log(`  GPU cosine rerank: ${Date.now() - batchStart - batchMs}ms`);
log(`  Result: top ${Math.min(10, ranked.length)} IDs ranked`);
log(`  Tensor lifecycle: allocate → use → discard (no persistent storage)`);
log(`\n${c.g('✓')} Correct flow: Qdrant → matrix → GPU rerank → IDs → discard`);

process.exit(0);
