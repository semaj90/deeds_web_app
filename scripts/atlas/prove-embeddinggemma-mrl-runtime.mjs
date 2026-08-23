#!/usr/bin/env node
/** Read-only live MRL proof from the canonical llama.cpp 768d executor. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = (process.env.LLAMA_EMBED_URL ?? 'http://127.0.0.1:8081').replace(/\/$/, '');
const reportPath = path.join(ROOT, 'docs/reports/embeddinggemma-mrl-runtime-proof.json');
const dimensions = [768, 512, 256, 128];

function digest(values) {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function project(vector, dimension) {
  if (!Array.isArray(vector) || vector.length !== 768) throw new Error('NATIVE_DIMENSION_768_REQUIRED');
  const output = vector.slice(0, dimension);
  const norm = Math.sqrt(output.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('MRL_ZERO_NORM');
  return output.map((value) => value / norm);
}

const receipt = {
  schema: 'atlas.embeddinggemma.mrl.runtime.proof.v1',
  generatedAt: new Date().toISOString(),
  executor: 'llama.cpp',
  endpoint: `${url}/v1/embeddings`,
  sourceRepresentationId: 'semantic_768',
  modelId: 'google/embeddinggemma-300m',
  projectionMethod: 'MRL_PREFIX_TRUNCATE_L2',
  dimensions,
  input: 'task: code retrieval query | query: locate the canonical Graphify materializer',
  outputs: [],
  writes: { postgres: false, qdrant: false, valkey: false, embeddingArtifacts: false },
};

try {
  const response = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input: receipt.input }),
    signal: AbortSignal.timeout(Number(process.env.EMBED_PROOF_TIMEOUT_MS ?? 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  const native = payload?.data?.[0]?.embedding;
  if (!Array.isArray(native) || native.length !== 768) throw new Error('NATIVE_VECTOR_INVALID');
  const nativeNorm = Math.sqrt(native.reduce((sum, value) => sum + value * value, 0));
  for (const dimension of dimensions) {
    const vector = project(native, dimension);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    receipt.outputs.push({
      representationId: dimension === 768 ? 'semantic_768' : `semantic_mrl_${dimension}`,
      sourceRepresentationId: dimension === 768 ? null : 'semantic_768',
      dimension,
      nativeDimension: 768,
      finite: vector.every(Number.isFinite),
      l2Norm: norm,
      normalized: Math.abs(norm - 1) <= 1e-6,
      vectorDigest: digest(vector),
    });
  }
  receipt.nativeNorm = nativeNorm;
  receipt.nativeDigest = digest(native);
  receipt.status = receipt.outputs.every((output) => output.finite && output.normalized)
    ? 'PROVEN'
    : 'FAILED_CONTRACT';
} catch (error) {
  receipt.status = 'RUNTIME_UNAVAILABLE';
  receipt.error = error instanceof Error ? error.message : String(error);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: receipt.status, reportPath: path.relative(ROOT, reportPath), outputs: receipt.outputs.length }, null, 2));
process.exitCode = receipt.status === 'PROVEN' ? 0 : 2;
