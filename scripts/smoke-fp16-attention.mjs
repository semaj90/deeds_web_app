#!/usr/bin/env node
/**
 * FP16 Attention Lane smoke test (H4 Smoke).
 * Called by smoke-all-gpu-lanes.mjs via require('./smoke-fp16-attention.mjs').runSmokeTest()
 */
import { createRequire } from 'module';
import path from 'path';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

export function runSmokeTest() {
  const addonPath = path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  if (!existsSync(addonPath)) {
    return { skipped: true, reason: 'addon not found at ' + addonPath };
  }

  const addon = require(addonPath);

  if (typeof addon.attentionScoreGPU !== 'function') {
    return { skipped: true, reason: 'attentionScoreGPU not exported' };
  }

  const DIM = 768;
  const N = 4;
  // probe: single query vs N candidates (same layout as libtorch-bridge)
  const query = new Float32Array(DIM).fill(0.1);
  const corpus = new Float32Array(DIM * N).map((_, i) => (i % DIM) / DIM);

  const t0 = Date.now();
  const scores = addon.attentionScoreGPU(query, DIM, corpus, N);
  const latency_ms = Date.now() - t0;

  if (!scores || scores.length !== N) {
    throw new Error(`Expected ${N} scores, got ${scores?.length ?? 'null'}`);
  }

  const hasNaN = Array.from(scores).some((v) => !isFinite(v));
  if (hasNaN) throw new Error('attentionScoreGPU returned NaN/Inf');

  return {
    dim: DIM,
    n: N,
    latency_ms,
    scores: Array.from(scores).map((v) => +v.toFixed(4)),
    fp16_ready: true,
  };
}
