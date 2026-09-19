#!/usr/bin/env node
/**
 * Fail-closed WebGPU proof for the local EmbeddingGemma semantic_768 artifact.
 *
 * This intentionally has no WASM/CPU fallback. A successful receipt means the
 * requested WebGPU pipeline loaded and produced a repeatable 768-wide vector.
 * It is a challenger proof only; it does not write canonical embeddings.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifactRoot = path.join(packageRoot, 'sveltekit-frontend', 'static', 'embeddinggemma_300m_onnx');
const modelRoot = process.env.ATLAS_EMBEDDINGGEMMA_MODEL_ROOT ?? artifactRoot;
const modelPath = process.env.ATLAS_EMBEDDINGGEMMA_MODEL_PATH ?? path.join(modelRoot, 'model.onnx');
const tokenizerPath = process.env.ATLAS_EMBEDDINGGEMMA_TOKENIZER_PATH ?? path.join(modelRoot, 'tokenizer.json');
const MODEL_REF = process.env.ATLAS_EMBEDDINGGEMMA_MODEL_REF ?? modelRoot;
const PROBE_TEXT = 'Parent Atlas semantic_768 WebGPU-only proof.';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dataOf(value) {
  return Array.from(value?.data ?? value ?? [], (item) => typeof item === 'bigint' ? item.toString() : item);
}

async function main() {
  const report = {
    schema: 'atlas.embeddinggemma-onnx-webgpu-only-proof.v1',
    mode: 'READ_ONLY_PROOF',
    requestedProvider: 'webgpu',
    fallbackAllowed: false,
    writes: false,
    modelRef: MODEL_REF,
    modelRoot,
    modelPath,
    tokenizerPath,
    nodeVersion: process.version,
    platform: process.platform,
  };

  try {
    for (const filePath of [modelPath, tokenizerPath]) {
      if (!fs.existsSync(filePath)) throw new Error(`ARTIFACT_MISSING:${filePath}`);
    }
    report.modelChecksum = `sha256:${sha256File(modelPath)}`;
    report.tokenizerChecksum = `sha256:${sha256File(tokenizerPath)}`;

    const { pipeline } = await import('@huggingface/transformers');
    const started = Date.now();
    // No catch-and-retry is intentional: any WebGPU failure fails this proof.
    const extractor = await pipeline('feature-extraction', modelRoot, {
      device: 'webgpu',
      local_files_only: true,
      subfolder: '',
    });
    report.loadMs = Date.now() - started;
    report.providerUsed = 'webgpu';

    const tokenized = extractor.tokenizer(PROBE_TEXT, { padding: true, truncation: true });
    const inputIds = dataOf(tokenized.input_ids);
    const attentionMask = dataOf(tokenized.attention_mask);
    report.renderedInputChecksum = `sha256:${sha256Json(PROBE_TEXT)}`;
    report.tokenTensorChecksum = `sha256:${sha256Json({ inputIds, attentionMask })}`;
    report.tokenCount = inputIds.length;

    const vectors = [];
    const inferenceStarted = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const output = await extractor(PROBE_TEXT, { pooling: 'mean', normalize: true });
      const vector = dataOf(output);
      output?.dispose?.();
      vectors.push(vector);
      if (vector.length !== 768) throw new Error(`DIMENSION_MISMATCH:${vector.length}`);
      if (!vector.every((value) => Number.isFinite(value))) throw new Error('NON_FINITE_VECTOR');
    }
    report.inferMs = Date.now() - inferenceStarted;
    const first = vectors[0];
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    report.dimensions = first.length;
    report.expectedDimensions = 768;
    report.allFinite = true;
    report.l2Norm = norm;
    report.normalizedAsExpected = Math.abs(norm - 1) < 0.01;
    report.repeatable = vectors.slice(1).every((vector) => sha256Json(vector) === sha256Json(first));
    report.vectorChecksum = `sha256:${sha256Json(first)}`;
    report.status = report.normalizedAsExpected && report.repeatable ? 'PROVEN_READ_ONLY' : 'FAILED_PROOF_GATE';
    await extractor.dispose?.();
  } catch (error) {
    report.status = 'FAILED_WEBGPU_ONLY';
    report.error = error instanceof Error ? error.message : String(error);
  }

  console.log(JSON.stringify(report, null, 2));
  const exitCode = report.status === 'PROVEN_READ_ONLY'
    && report.providerUsed === 'webgpu'
    && report.fallbackAllowed === false ? 0 : 1;
  // ORT WebGPU can crash during Node's native finalizer after all proof data
  // has been emitted. This is a short-lived proof process; exit explicitly so
  // post-receipt teardown cannot rewrite a completed proof as a failure.
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED_WEBGPU_ONLY', error: error instanceof Error ? error.stack : String(error) }, null, 2));
  process.exitCode = 1;
});
