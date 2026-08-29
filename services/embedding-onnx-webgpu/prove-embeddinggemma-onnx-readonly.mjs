#!/usr/bin/env node
/**
 * Read-only WebGPU/ONNX capability proof for Parent Atlas semantic_768.
 *
 * Loads onnx-community/embeddinggemma-300m-ONNX (the community fp32 ONNX export of
 * google/embeddinggemma-300m — verified 2026-08-30, no ONNX export exists on Google's own
 * canonical HF repo, this is the community-maintained one the wider ecosystem, including
 * transformers.js's own EmbeddingGemma support, points at) via @huggingface/transformers,
 * runs ONE embedding, and reports which execution provider actually ran (webgpu vs wasm vs
 * cpu — transformers.js falls back automatically if webgpu isn't available in the runtime).
 *
 * This does NOT wire anything into the live app. It answers exactly one question: does this
 * machine/runtime actually get a working embedding out of this model via this library, and
 * on which backend. That answer is what onnx-server.ts / dev-gpu-runtime.mjs's
 * 'onnx_directml' backend selection should be validated against before it's trusted as a
 * default — not assumed from documentation alone.
 *
 * First run downloads the model to the transformers.js cache (~1.2GB fp32) — real disk +
 * memory cost. Confirm available headroom before running; this repo's own dev-gpu-runtime.mjs
 * already documents the VRAM/RAM tradeoffs between embedding backends in its header comment.
 *
 * Usage: node prove-embeddinggemma-onnx-readonly.mjs
 */

import { performance } from 'node:perf_hooks';

const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
const PROBE_TEXT = 'Parent Atlas semantic_768 canonical embedding proof.';

async function main() {
  const { pipeline } = await import('@huggingface/transformers');

  // Report what execution providers are actually available in this runtime before attempting
  // to force one — never assume webgpu is present just because the code path exists.
  const report = {
    schema: 'atlas.embeddinggemma-onnx-readonly-proof.v1',
    mode: 'READ_ONLY_PROOF',
    writes: false,
    modelId: MODEL_ID,
    nodeVersion: process.version,
    platform: process.platform,
  };

  const startedAt = performance.now();
  let extractor;
  let backendUsed = 'unknown';
  try {
    // transformers.js device selection: try 'webgpu' first (browser/Node WebGPU via the
    // 'webgpu' npm polyfill if present), falling back to 'wasm' — matches
    // dev-gpu-runtime.mjs's own documented DirectML→CUDA→CPU fallback philosophy for the
    // in-process ONNX path, but for the *browser*-facing WebGPU lane specifically.
    extractor = await pipeline('feature-extraction', MODEL_ID, { device: 'webgpu' });
    backendUsed = 'webgpu';
  } catch (webgpuError) {
    report.webgpuError = webgpuError instanceof Error ? webgpuError.message : String(webgpuError);
    try {
      extractor = await pipeline('feature-extraction', MODEL_ID, { device: 'wasm' });
      backendUsed = 'wasm';
    } catch (wasmError) {
      report.status = 'FAILED';
      report.wasmError = wasmError instanceof Error ? wasmError.message : String(wasmError);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
  }
  const loadMs = Math.round(performance.now() - startedAt);

  const inferStartedAt = performance.now();
  const output = await extractor(PROBE_TEXT, { pooling: 'mean', normalize: true });
  const inferMs = Math.round(performance.now() - inferStartedAt);

  const vector = Array.from(output.data ?? output);
  const finite = vector.every((v) => Number.isFinite(v));
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));

  report.status = finite ? 'PROVEN_READ_ONLY' : 'DEGRADED_NON_FINITE_VECTOR';
  report.backendUsed = backendUsed;
  report.loadMs = loadMs;
  report.inferMs = inferMs;
  report.dimensions = vector.length;
  report.expectedDimensions = 768;
  report.dimensionsMatchExpected = vector.length === 768;
  report.allFinite = finite;
  report.l2Norm = norm;
  report.normalizedAsExpected = Math.abs(norm - 1) < 0.01; // normalize:true should give ~unit norm

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PROVEN_READ_ONLY' || !report.dimensionsMatchExpected) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', error: error instanceof Error ? error.stack : String(error) }, null, 2));
  process.exitCode = 1;
});
