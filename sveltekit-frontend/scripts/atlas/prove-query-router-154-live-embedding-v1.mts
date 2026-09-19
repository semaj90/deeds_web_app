#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeClassificationInput, projectEmbeddingGemmaMrlV1 } from '../../src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.js';
import { projectQueryFeaturesV1, QUERY_FEATURE_ORDER_V1 } from '../../src/lib/server/atlas/classification/query-feature-projection-v1.js';

const repoRoot = resolve(process.cwd(), '..');
const output = resolve(repoRoot, 'docs/reports/query-router-154-live-embedding-v1.json');
const endpoint = (process.env.EMBEDDING_PROOF_URL ?? `${(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/embed`).replace(/\/+$/, '');
const isOllamaEmbed = endpoint.endsWith('/api/embed');
const query = 'trace the current Graphify packet to chunk and AST lineage';
const formatted = encodeClassificationInput(query);
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const finiteAndNormalized = (values: readonly number[]) => {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return false;
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return Math.abs(norm - 1) <= 1e-3;
};

const reportBase = {
  schema: 'ParentAtlasQueryRouter154LiveEmbeddingV1',
  generatedAt: new Date().toISOString(),
  endpoint,
  executor: isOllamaEmbed ? 'ollama_http_read_only' : 'configured_embedding_http',
  request: { query, formattedTextSha256: sha256(formatted.formattedText), promptRevision: formatted.promptRevision, mode: formatted.mode },
  canonicalAuthority: false,
  writesPerformed: false,
  fallbackUsed: false,
  promotionEligibility: 'CHALLENGER_ONLY',
};

let report;
try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(isOllamaEmbed
      ? { model: process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest', input: [formatted.formattedText] }
      : { model: process.env.EMBEDDING_MODEL ?? 'embeddinggemma', input: formatted.formattedText }),
    signal: AbortSignal.timeout(Number(process.env.EMBED_PROOF_TIMEOUT_MS ?? 10_000)),
  });
  if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}`);
  const body = await response.json();
  const native = body?.embeddings?.[0] ?? body?.data?.[0]?.embedding;
  if (!Array.isArray(native)) throw new Error('EMBEDDING_VECTOR_MISSING');
  if (native.length !== 768) throw new Error(`EMBEDDING_DIMENSION_MISMATCH:${native.length}`);
  if (native.some((value) => !Number.isFinite(value))) throw new Error('EMBEDDING_NATIVE_NONFINITE');
  const mrl128 = Array.from(projectEmbeddingGemmaMrlV1(native, 128));
  const queryFeatures = projectQueryFeaturesV1(query);
  const deterministic26 = QUERY_FEATURE_ORDER_V1.map((name) => Number(queryFeatures[name]));
  const tensor154 = [...mrl128, ...deterministic26];
  if (tensor154.length !== 154) throw new Error(`ROUTER_TENSOR_DIMENSION_MISMATCH:${tensor154.length}`);
  if (!finiteAndNormalized(mrl128)) throw new Error('CLASSIFICATION_MRL_128_NOT_FINITE_OR_NORMALIZED');
  report = {
    ...reportBase,
    status: 'LIVE_CLASSIFICATION_MRL_128_TENSOR_PROVEN',
    model: body?.model ?? process.env.EMBEDDING_MODEL ?? (isOllamaEmbed ? 'embeddinggemma:latest' : 'embeddinggemma'),
    nativeDimension: native.length,
    nativeFinite: true,
    classificationMrl128: { dimensions: 128, l2Normalized: true, checksumSha256: sha256(mrl128) },
    deterministicFeatures: { dimensions: deterministic26.length, featureRevision: queryFeatures.revision, checksumSha256: sha256(deterministic26) },
    tensor: { dimensions: tensor154.length, revision: 'atlas.query-router-tensor.v1', checksumSha256: sha256(tensor154) },
    nextRequirement: 'EXPLICIT_ROUTER_TENSOR_OWNER_RECONCILIATION_BEFORE_PROMOTION',
  };
} catch (error) {
  report = { ...reportBase, status: 'LIVE_CLASSIFICATION_PROBE_BLOCKED', error: error instanceof Error ? error.message : String(error), nextRequirement: 'LIVE_CLASSIFICATION_MRL_128_AND_DETERMINISTIC_26_TENSOR_PROOF' };
}

mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output, error: report.error ?? null }, null, 2));
