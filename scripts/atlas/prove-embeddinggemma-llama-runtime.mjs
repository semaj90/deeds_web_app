#!/usr/bin/env node
/**
 * Read-only EmbeddingGemma llama.cpp runtime proof.
 *
 * This validates the executor boundary only. It does not write Qdrant,
 * Postgres, Valkey, or embedding artifacts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(ROOT, 'docs/reports/embeddinggemma-llama-runtime-proof.json');
const baseUrl = (process.env.LLAMA_EMBED_URL ?? 'http://127.0.0.1:8081').replace(/\/$/, '');
const timeoutMs = Number(process.env.EMBED_PROOF_TIMEOUT_MS ?? 10_000);
const modelCandidates = [
  process.env.EMBED_MODEL_PATH,
  path.join(ROOT, 'models/embeddinggemma-300m-q8_0.gguf'),
  path.join(ROOT, 'models/embeddinggemma-300m-f16.gguf'),
].filter(Boolean);

const fixtures = [
  ['retrieval_query', 'task: search result | query: where is the Graphify AST owner?'],
  ['code_query', 'task: code retrieval query | query: find the Qdrant projection worker'],
  ['document', 'title: graphify.ts\ntext: materialize structural evidence before semantic indexing'],
];

function digest(values) {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function inspectVector(vector) {
  const finite = Array.isArray(vector) && vector.every((value) => Number.isFinite(value));
  const norm = finite ? Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) : 0;
  return {
    dimension: Array.isArray(vector) ? vector.length : 0,
    finite,
    l2Norm: norm,
    normalized: finite && Math.abs(norm - 1) <= 1e-3,
    digest: Array.isArray(vector) ? digest(vector) : null,
  };
}

async function postEmbedding(input) {
  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('EMBEDDING_VECTOR_MISSING');
  return vector;
}

function artifactInfo() {
  const candidate = modelCandidates.find((file) => fs.existsSync(file));
  if (!candidate) return { path: null, sha256: null, bytes: null };
  const bytes = fs.statSync(candidate).size;
  return {
    path: path.relative(ROOT, candidate),
    bytes,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'),
  };
}

const receipt = {
  schema: 'atlas.embeddinggemma.llama.runtime.proof.v1',
  generatedAt: new Date().toISOString(),
  executor: 'llama.cpp',
  endpoint: `${baseUrl}/v1/embeddings`,
  representationId: 'semantic_768',
  modelId: 'google/embeddinggemma-300m',
  nativeDimension: 768,
  normalization: 'L2',
  artifact: artifactInfo(),
  promptModes: fixtures.map(([mode]) => mode),
  samples: [],
  writes: { postgres: false, qdrant: false, valkey: false, embeddingArtifacts: false },
};

try {
  for (const [mode, input] of fixtures) {
    const first = await postEmbedding(input);
    const second = await postEmbedding(input);
    const a = inspectVector(first);
    const b = inspectVector(second);
    const sameDigest = a.digest === b.digest;
    receipt.samples.push({ mode, inputDigest: digest(input), first: a, second: b, sameDigest });
  }
  const valid = receipt.samples.every((sample) =>
    sample.first.dimension === 768 && sample.first.finite && sample.first.normalized &&
    sample.second.dimension === 768 && sample.second.finite && sample.second.normalized &&
    sample.sameDigest,
  );
  receipt.status = valid ? 'PROVEN' : 'FAILED_CONTRACT';
} catch (error) {
  receipt.status = 'RUNTIME_UNAVAILABLE';
  receipt.error = error instanceof Error ? error.message : String(error);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: receipt.status, reportPath: path.relative(ROOT, reportPath), samples: receipt.samples.length }, null, 2));
process.exitCode = receipt.status === 'PROVEN' ? 0 : 2;
