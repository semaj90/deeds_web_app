#!/usr/bin/env node
/**
 * Canonical proof for:
 *   EmbeddingGemma -> Qdrant codebase_chunks_768 -> TurboVec gRPC
 *
 * This is a mirror/accelerator test. It does not mutate Postgres packet truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const env = loadRepoEnv();
const QDRANT_URL = String(args.get('qdrant-url') ?? env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = String(args.get('collection') ?? env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768');
const VECTOR_NAME = String(args.get('vector-name') ?? env.QDRANT_CODE_VECTOR_NAME ?? 'content');
const EMBED_URL = String(
  args.get('embed-url')
  ?? env.EMBED_SERVER_URL
  ?? env.EMBEDDING_URL
  ?? env.OLLAMA_EMBED_BASE_URL
  ?? env.OLLAMA_URL
  ?? 'http://127.0.0.1:11434'
).replace(/\/+$/, '');
const OLLAMA_URL = String(args.get('ollama-url') ?? env.OLLAMA_URL ?? env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const EMBED_MODEL = String(args.get('model') ?? env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const TURBOVEC_HTTP = String(args.get('turbovec-http') ?? env.TURBOVEC_PYTHON_URL ?? 'http://127.0.0.1:8791').replace(/\/+$/, '');
const GRPC_URL = String(args.get('grpc-url') ?? env.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062');
const LIMIT = Number(args.get('limit') ?? 256);
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/embedding-qdrant-turbovec-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/embedding-qdrant-turbovec-proof.md'));

const TEST_TEXT = 'Parent Atlas proof query for EmbeddingGemma Qdrant TurboVec packet_key source_ref feature_id retrieval telemetry.';

function lane({ status = 'FAIL', ...rest }) {
  return { status, ...rest };
}

function overallFrom(lanes) {
  const statuses = Object.values(lanes).map((entry) => entry.status);
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('FALLBACK_PASS')) return 'WARN';
  return 'LIVE_PASS';
}

function lanePass(status) {
  return status === 'LIVE_PASS' || status === 'FALLBACK_PASS';
}

function projectVector(vector, outDim) {
  if (!Array.isArray(vector)) return [];
  if (vector.length === outDim) return vector.map(Number);
  if (vector.length > outDim) {
    const step = vector.length / outDim;
    return Array.from({ length: outDim }, (_, index) => Number(vector[Math.floor(index * step)] ?? 0));
  }
  return [...vector.map(Number), ...Array(outDim - vector.length).fill(0)];
}

function normalizeVector(raw) {
  if (!Array.isArray(raw)) return null;
  const vector = raw.map(Number);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return body;
}

async function embedOpenAiCompatible() {
  const body = await fetchJson(`${EMBED_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: [TEST_TEXT] }),
  });
  const embedding = body?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error('OpenAI-compatible embedding response did not include data[0].embedding');
  return normalizeVector(embedding);
}

async function embedOllama() {
  const body = await fetchJson(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: [TEST_TEXT] }),
  });
  const embedding = body?.embeddings?.[0] ?? body?.embedding;
  if (!Array.isArray(embedding)) throw new Error('Ollama embedding response did not include embeddings[0]');
  return normalizeVector(embedding);
}

async function embeddingLane() {
  const started = Date.now();
  try {
    const vector = await embedOpenAiCompatible();
    return {
      vector,
      lane: lane({
        status: 'LIVE_PASS',
        url: EMBED_URL,
        port: Number(new URL(EMBED_URL).port || 80),
        model: EMBED_MODEL,
        dimension: vector.length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (primaryError) {
    try {
      const vector = await embedOllama();
      return {
        vector,
        lane: lane({
          status: 'FALLBACK_PASS',
          url: OLLAMA_URL,
          port: Number(new URL(OLLAMA_URL).port || 80),
          model: EMBED_MODEL,
          dimension: vector.length,
          fallback_used: true,
          reason: `OpenAI-compatible endpoint unavailable; used Ollama EmbeddingGemma only. Primary error: ${primaryError.message}`,
          duration_ms: Date.now() - started,
        }),
      };
    } catch (fallbackError) {
      return {
        vector: null,
        lane: lane({
          status: 'FAIL',
          url: EMBED_URL,
          port: Number(new URL(EMBED_URL).port || 80),
          model: EMBED_MODEL,
          error: `${primaryError.message}; fallback: ${fallbackError.message}`,
          duration_ms: Date.now() - started,
        }),
      };
    }
  }
}

async function qdrantCollectionInfo() {
  return fetchJson(`${QDRANT_URL}/collections/${COLLECTION}`, { timeoutMs: 10_000 });
}

function vectorConfig(info) {
  return info?.result?.config?.params?.vectors?.[VECTOR_NAME] ?? info?.result?.config?.params?.vectors;
}

async function qdrantCount() {
  const body = await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}/points/count`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exact: true }),
    timeoutMs: 30_000,
  });
  return Number(body?.result?.count ?? 0);
}

async function qdrantUpsertSearch(vector) {
  const pointId = crypto.randomUUID();
  const payload = {
    packet_key: `proof:${pointId}`,
    source_ref: 'proof/embedding-qdrant-turbovec',
    feature_id: 'proof.embedding_qdrant_turbovec',
    feature_label: 'Embedding Qdrant TurboVec Proof',
    proof_only: true,
    created_at: new Date().toISOString(),
  };
  await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
        id: pointId,
        vector: { [VECTOR_NAME]: vector },
        payload,
      }],
    }),
    timeoutMs: 30_000,
  });

  const search = await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: VECTOR_NAME, vector },
      limit: 5,
      with_payload: true,
    }),
    timeoutMs: 30_000,
  });

  return {
    pointId,
    payload,
    result_count: search?.result?.length ?? 0,
    top: search?.result?.[0] ?? null,
  };
}

async function qdrantLane(vector) {
  const started = Date.now();
  try {
    const info = await qdrantCollectionInfo();
    const config = vectorConfig(info);
    const expectedDim = Number(config?.size ?? 0);
    if (expectedDim !== vector.length) {
      throw new Error(`Vector dimension mismatch: Qdrant ${COLLECTION}.${VECTOR_NAME} expects ${expectedDim}, embedding returned ${vector.length}`);
    }
    const points = await qdrantCount();
    const proof = await qdrantUpsertSearch(vector);
    return {
      lane: lane({
        status: proof.result_count > 0 ? 'LIVE_PASS' : 'FAIL',
        url: QDRANT_URL,
        port: Number(new URL(QDRANT_URL).port || 6333),
        collection: COLLECTION,
        vector_name: VECTOR_NAME,
        dimension: expectedDim,
        points,
        proof_point_id: proof.pointId,
        search_result_count: proof.result_count,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      lane: lane({
        status: 'FAIL',
        url: QDRANT_URL,
        port: Number(new URL(QDRANT_URL).port || 6333),
        collection: COLLECTION,
        vector_name: VECTOR_NAME,
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

function vectorFromPoint(point) {
  if (Array.isArray(point?.vector)) return point.vector;
  const vector = point?.vector;
  if (vector && typeof vector === 'object') {
    if (Array.isArray(vector[VECTOR_NAME])) return vector[VECTOR_NAME];
    for (const value of Object.values(vector)) {
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

function identityFromPoint(point) {
  const payload = point?.payload ?? {};
  return {
    id: String(point?.id ?? ''),
    packet_key: payload.packet_key ?? payload.packetKey ?? null,
    source_ref: payload.source_ref ?? payload.sourceRef ?? payload.canonical_source_ref ?? payload.canonicalSourceRef ?? payload.file_path ?? null,
    feature_id: payload.feature_id ?? payload.featureId ?? null,
    community_id: payload.community_id ?? payload.communityId ?? payload.cluster_id ?? 0,
  };
}

async function qdrantCandidates(targetDim) {
  const candidates = [];
  let offset = null;
  let scanned = 0;
  while (candidates.length < LIMIT) {
    const body = { limit: 128, with_payload: true, with_vector: true };
    if (offset) body.offset = offset;
    const scroll = await fetchJson(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    });
    const points = scroll?.result?.points ?? [];
    scanned += points.length;
    for (const point of points) {
      const vector = vectorFromPoint(point);
      const identity = identityFromPoint(point);
      if (vector?.length !== 768 || !identity.packet_key || !identity.source_ref || !identity.feature_id) continue;
      candidates.push({
        id: identity.packet_key,
        vector: projectVector(vector, targetDim),
        cluster: Number(identity.community_id ?? 0) || 0,
      });
      if (candidates.length >= LIMIT) break;
    }
    offset = scroll?.result?.next_page_offset ?? null;
    if (!offset || !points.length) break;
  }
  return { candidates, scanned };
}

function makeRequire(root) {
  return createRequire(pathToFileURL(path.join(root, '_dummy.js')).href);
}

function loadGrpc() {
  const roots = [
    path.resolve(REPO_ROOT, 'sveltekit-frontend/node_modules'),
    path.resolve(REPO_ROOT, 'node_modules'),
    path.resolve(process.cwd(), 'node_modules'),
  ];
  for (const root of roots) {
    try {
      const req = makeRequire(root);
      return { grpc: req('@grpc/grpc-js'), protoLoader: req('@grpc/proto-loader') };
    } catch {}
  }
  throw new Error('@grpc/grpc-js not found');
}

function grpcClient() {
  const { grpc, protoLoader } = loadGrpc();
  const protoPath = path.resolve(REPO_ROOT, 'proto/active/turbovec_cuda.proto');
  const def = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(def);
  return {
    grpc,
    client: new descriptor.turbovec.TurboVecCudaService(GRPC_URL, grpc.credentials.createInsecure()),
  };
}

function grpcCall(client, method, request, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + timeoutMs }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function turbovecLane(vector) {
  const started = Date.now();
  const laneBase = {
    port: Number(GRPC_URL.split(':').pop() || 50062),
    transport: 'grpc',
    grpc_url: GRPC_URL,
    http_url: TURBOVEC_HTTP,
  };
  let client;
  try {
    const loaded = grpcClient();
    client = loaded.client;
    const health = await grpcCall(client, 'health', {}, 5_000);
    const grpcDim = Number(health.dim ?? 0) || 64;
    const transform = await grpcCall(client, 'transform', {
      vectors: vector,
      count: 1,
      inDim: vector.length,
      outDim: grpcDim,
      transformId: 'proof_768_to_sidecar',
    }, 20_000);
    const transformed = Array.from(transform.projectedVectors ?? []);
    const transformedOk = Number(transform.outDim ?? grpcDim) === grpcDim && transformed.length === grpcDim;

    const { candidates, scanned } = await qdrantCandidates(grpcDim);
    if (!candidates.length) throw new Error(`No Qdrant candidates available for TurboVec sidecar dim ${grpcDim}`);

    const build = await fetchJson(`${TURBOVEC_HTTP}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates }),
      timeoutMs: 120_000,
    });
    const search = await grpcCall(client, 'search', {
      queryVector: transformedOk ? transformed : projectVector(vector, grpcDim),
      topK: 10,
    }, 20_000);
    const candidateCount = search?.candidates?.length ?? 0;

    return lane({
      status: health.ok && transformedOk && candidateCount > 0 ? 'LIVE_PASS' : 'FAIL',
      ...laneBase,
      backend: health.backend || search.backend || 'unknown',
      health,
      transform: {
        in_dim: vector.length,
        out_dim: Number(transform.outDim ?? 0),
        vector_length: transformed.length,
      },
      qdrant_scanned: scanned,
      http_indexed: Number(build.indexed ?? candidates.length),
      grpc_candidates: candidateCount,
      duration_ms: Date.now() - started,
    });
  } catch (error) {
    return lane({
      status: 'FAIL',
      ...laneBase,
      error: error.message,
      duration_ms: Date.now() - started,
    });
  } finally {
    if (client) client.close();
  }
}

async function main() {
  const started = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    overall: 'FAIL',
    lanes: {},
    rule: 'LIVE_PASS requires real service + real port + real data. FALLBACK_PASS is WARN, never green success.',
  };

  const embedding = await embeddingLane();
  report.lanes.embeddinggemma = embedding.lane;

  if (embedding.vector) {
    const qdrant = await qdrantLane(embedding.vector);
    report.lanes.qdrant = qdrant.lane;
    const turbo = await turbovecLane(embedding.vector);
    report.lanes.turbovec_grpc = turbo;
  } else {
    report.lanes.qdrant = lane({ status: 'FAIL', collection: COLLECTION, reason: 'Embedding vector unavailable' });
    report.lanes.turbovec_grpc = lane({ status: 'FAIL', port: Number(GRPC_URL.split(':').pop() || 50062), reason: 'Embedding vector unavailable' });
  }

  report.lanes.turbovec_jsonrpc_8792 = lane({
    status: 'FALLBACK_PASS',
    port: 8792,
    reason: 'Legacy fallback only; canonical path is TurboVec gRPC 50062 and HTTP ANN sidecar 8791.',
  });

  report.overall = overallFrom(report.lanes);
  report.elapsed_ms = Date.now() - started;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, [
    '# EmbeddingGemma Qdrant TurboVec Proof',
    '',
    `Generated: ${report.generated_at}`,
    `Overall: ${report.overall}`,
    '',
    '| lane | status | detail |',
    '|---|---:|---|',
    ...Object.entries(report.lanes).map(([key, value]) => `| ${key} | ${value.status} | ${(value.reason || value.error || value.url || value.grpc_url || '').replace(/\|/g, '/')} |`),
    '',
  ].join('\n'), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overall === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
