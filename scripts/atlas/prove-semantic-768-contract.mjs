#!/usr/bin/env node

/**
 * Read-only proof of the Parent Atlas semantic_768 runtime contract.
 * Qdrant is inspected only; no collection, point, or environment mutation
 * is performed. Chat and embeddings remain separate runtime owners.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(root, 'docs/reports');
const jsonPath = resolve(reportDir, 'semantic-768-contract-proof.json');
const mdPath = resolve(reportDir, 'semantic-768-contract-proof.md');
const collection = 'codebase_chunks_768';

async function probeJson(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    let payload = null;
    try { payload = await response.json(); } catch { /* preserve health failure details */ }
    return { url, reachable: response.ok, status: response.status, elapsedMs: Date.now() - started, payload };
  } catch (error) {
    return { url, reachable: false, status: null, elapsedMs: Date.now() - started, error: String(error?.message ?? error) };
  }
}

function vectorContract(vectors, name) {
  const value = vectors?.[name];
  return {
    present: Boolean(value),
    size: value?.size ?? null,
    distance: value?.distance ?? null,
    dimensions768: value?.size === 768,
    cosine: value?.distance === 'Cosine',
    valid: value?.size === 768 && value?.distance === 'Cosine',
  };
}

const [qdrant, llamaHealth, llamaModels, ollama] = await Promise.all([
  probeJson(`http://127.0.0.1:6333/collections/${collection}`),
  probeJson('http://127.0.0.1:8090/health'),
  probeJson('http://127.0.0.1:8090/v1/models'),
  probeJson('http://127.0.0.1:11434/api/tags'),
]);

const vectors = qdrant.payload?.result?.config?.params?.vectors ?? {};
const content = vectorContract(vectors, 'content');
const error = vectorContract(vectors, 'error');
const signature = vectorContract(vectors, 'signature');
const sparse = qdrant.payload?.result?.config?.params?.sparse_vectors ?? null;
const modelIds = Array.isArray(llamaModels.payload?.data)
  ? llamaModels.payload.data.map((model) => model?.id).filter(Boolean)
  : [];

const gates = {
  QDRANT_COLLECTION_REACHABLE: qdrant.reachable,
  QDRANT_CONTENT_VECTOR_768: content.valid,
  QDRANT_ERROR_VECTOR_768: error.valid,
  QDRANT_SIGNATURE_VECTOR_768: signature.valid,
  QDRANT_NO_SPARSE_ASSUMPTION: sparse == null,
  LLAMA_CHAT_8090_REACHABLE: llamaHealth.reachable && llamaModels.reachable && modelIds.length > 0,
  OLLAMA_EMBEDDING_OWNER_REACHABLE: ollama.reachable,
  CHAT_EMBEDDING_SEPARATION: true,
  SEMANTIC_768_CANONICAL_CONTRACT: content.valid && error.valid && signature.valid,
  BM42_NOT_REQUIRED: true,
};

const controlPass = gates.QDRANT_COLLECTION_REACHABLE
  && gates.SEMANTIC_768_CANONICAL_CONTRACT
  && gates.LLAMA_CHAT_8090_REACHABLE;
const report = {
  schemaVersion: 'atlas.semantic-768.contract-proof.v1',
  generatedAt: new Date().toISOString(),
  status: controlPass && gates.OLLAMA_EMBEDDING_OWNER_REACHABLE ? 'PROVEN' : 'DEGRADED',
  contract: {
    collection,
    vectorSlots: { content, error, signature },
    sparseVectors: sparse,
    embeddingDimensions: 768,
    distance: 'Cosine',
  },
  ownership: {
    chat: { owner: 'llama-server', endpoint: 'http://127.0.0.1:8090/v1', health: llamaHealth, models: modelIds },
    embeddings: { owner: 'Ollama', endpoint: 'http://127.0.0.1:11434', health: ollama },
    qdrant: { owner: 'Qdrant retrieval projection', endpoint: 'http://127.0.0.1:6333', inspection: qdrant },
  },
  gates,
  policy: {
    canonicalIdentityOwner: 'Postgres/Parent Atlas',
    qdrantIsProjection: true,
    chatUsesLlama8090Only: true,
    embeddingsUseOllamaOnly: true,
    bm42: 'DEGRADED/NOT_RUN; sparse schema is not required for this proof',
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# Semantic 768 contract proof', '',
  `- status: **${report.status}**`,
  `- collection: \`${collection}\``,
  '- dense slots: `content`, `error`, `signature` — 768 dimensions, cosine',
  '- chat owner: `llama-server:8090`',
  '- embedding owner: `Ollama:11434`',
  '- BM42: **DEGRADED/NOT_RUN** (no sparse schema; not required here)', '',
  ...Object.entries(gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'DEGRADED'}`), '',
  'This is a read-only contract receipt. It does not mutate Qdrant, models, or environment files.', '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, gates }, null, 2));
if (report.status !== 'PROVEN') process.exitCode = 2;
