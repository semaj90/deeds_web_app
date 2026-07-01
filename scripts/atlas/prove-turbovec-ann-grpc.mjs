#!/usr/bin/env node
/**
 * Prove TurboVec ANN + gRPC bridge with real Qdrant vectors.
 *
 * Flow:
 *   Qdrant codebase_chunks_768 -> Python TurboVec /build (:8791)
 *   -> gRPC TurboVecCudaService.Search (:50062)
 *   -> docs/reports/turbovec-ann-grpc-proof.json
 *
 * This is a mirror/accelerator proof. It does not mutate Postgres truth,
 * Qdrant payloads, or packet identity.
 */
import fs from 'node:fs';
import path from 'node:path';
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
const TURBOVEC_HTTP = String(args.get('turbovec-http') ?? env.TURBOVEC_PYTHON_URL ?? 'http://127.0.0.1:8791').replace(/\/+$/, '');
const GRPC_URL = String(args.get('grpc-url') ?? env.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062');
const LIMIT = Number(args.get('limit') ?? 1000);
const SCROLL_BATCH = Number(args.get('batch') ?? 128);
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/turbovec-ann-grpc-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/turbovec-ann-grpc-proof.md'));

function projectVector(vector, outDim) {
  if (!Array.isArray(vector)) return [];
  if (vector.length === outDim) return vector;
  if (vector.length > outDim) {
    const step = Math.max(1, Math.floor(vector.length / outDim));
    return Array.from({ length: outDim }, (_, index) => Number(vector[Math.min(vector.length - 1, index * step)] ?? 0));
  }
  return [...vector, ...Array(outDim - vector.length).fill(0)];
}

function vectorFromPoint(point) {
  const vector = point.vector;
  if (Array.isArray(vector)) return vector;
  if (vector && typeof vector === 'object') {
    for (const key of ['embeddinggemma_768', 'content', 'default', 'vector']) {
      if (Array.isArray(vector[key])) return vector[key];
    }
    for (const value of Object.values(vector)) {
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

function identityFromPoint(point) {
  const payload = point.payload ?? {};
  return {
    id: String(point.id),
    packet_key: payload.packet_key ?? payload.packetKey ?? null,
    source_ref: payload.source_ref ?? payload.sourceRef ?? payload.canonical_source_ref ?? payload.canonicalSourceRef ?? payload.file_path ?? null,
    feature_id: payload.feature_id ?? payload.featureId ?? null,
    community_id: payload.community_id ?? payload.communityId ?? payload.cluster_id ?? 0,
  };
}

function candidateOk(point) {
  const vector = vectorFromPoint(point);
  const id = identityFromPoint(point);
  return vector?.length === 768 && id.packet_key && id.source_ref && id.feature_id;
}

async function qdrantScroll(offset = null) {
  const body = { limit: SCROLL_BATCH, with_payload: true, with_vector: true };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).result ?? { points: [], next_page_offset: null };
}

async function collectCandidates(dim = 768) {
  const candidates = [];
  const sampleIdentity = [];
  let scanned = 0;
  let skipped = 0;
  let offset = null;
  while (candidates.length < LIMIT) {
    const { points = [], next_page_offset = null } = await qdrantScroll(offset);
    if (!points.length) break;
    scanned += points.length;
    for (const point of points) {
      if (!candidateOk(point)) {
        skipped += 1;
        continue;
      }
      const vector = vectorFromPoint(point);
      const identity = identityFromPoint(point);
      candidates.push({
        id: identity.packet_key || identity.id,
        vector: projectVector(vector, dim),
        cluster: Number(identity.community_id ?? 0) || 0,
      });
      if (sampleIdentity.length < 5) sampleIdentity.push(identity);
      if (candidates.length >= LIMIT) break;
    }
    if (!next_page_offset) break;
    offset = next_page_offset;
  }
  return { candidates, scanned, skipped, sampleIdentity };
}

async function buildHttpIndex(candidates) {
  const start = Date.now();
  const res = await fetch(`${TURBOVEC_HTTP}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`TurboVec build HTTP ${res.status}: ${text}`);
  return { ...json, build_request_ms: Date.now() - start };
}

async function httpHealth() {
  const res = await fetch(`${TURBOVEC_HTTP}/health`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`TurboVec health HTTP ${res.status}`);
  return res.json();
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
    } catch {
      // try next
    }
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

function grpcCall(client, method, request, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + timeoutMs }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function main() {
  const started = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    qdrant: { url: QDRANT_URL, collection: COLLECTION },
    turbovec_http: TURBOVEC_HTTP,
    turbovec_grpc: GRPC_URL,
    limit: LIMIT,
    status: 'FAIL',
    gates: {},
  };

  try {
    const before = await httpHealth();
    const sidecarDim = Number(before.dim ?? 768) || 768;
    report.sidecar_dim = sidecarDim;
    const collected = await collectCandidates(sidecarDim);
    report.qdrant.scanned = collected.scanned;
    report.qdrant.skipped = collected.skipped;
    report.qdrant.usable_candidates = collected.candidates.length;
    report.qdrant.sample_identity = collected.sampleIdentity;
    report.gates.qdrant_vectors = collected.candidates.length > 0;

    if (!collected.candidates.length) throw new Error('No usable 768d Qdrant candidates with packet_key/source_ref/feature_id');

    const build = await buildHttpIndex(collected.candidates);
    const after = await httpHealth();
    report.http_health_before = before;
    report.http_build = build;
    report.http_health_after = after;
    report.gates.http_indexed = Number(after.indexed ?? build.indexed ?? 0) > 0;

    const { client } = grpcClient();
    try {
      const grpcHealth = await grpcCall(client, 'health', {}, 5000);
      const queryVector = collected.candidates[0].vector;
      const search = await grpcCall(client, 'search', { queryVector, topK: 10 }, 10000);
      report.grpc_health = grpcHealth;
      report.grpc_search = {
        backend: search.backend,
        indexed: search.indexed,
        candidates: (search.candidates ?? []).slice(0, 10),
        candidate_count: (search.candidates ?? []).length,
      };
      report.gates.grpc_ok = Boolean(grpcHealth.ok);
      report.gates.grpc_search_nonempty = (search.candidates ?? []).length > 0;
    } finally {
      client.close();
    }

    report.gates.identity_preserved = collected.sampleIdentity.every((row) => row.packet_key && row.source_ref && row.feature_id);
    report.gates.pass = Object.values(report.gates).every(Boolean);
    report.status = report.gates.pass ? 'PASS' : 'WARN';
  } catch (error) {
    report.error = error.message;
    report.gates.pass = false;
    report.status = 'FAIL';
  }

  report.elapsed_ms = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  const lines = [
    '# TurboVec ANN gRPC Proof',
    '',
    `Status: ${report.status}`,
    `Qdrant collection: ${COLLECTION}`,
    `Usable candidates: ${report.qdrant?.usable_candidates ?? 0}`,
    `HTTP indexed: ${report.http_health_after?.indexed ?? 0}`,
    `gRPC candidates: ${report.grpc_search?.candidate_count ?? 0}`,
    '',
    '## Gates',
    '',
    '| Gate | Result |',
    '|---|---:|',
    ...Object.entries(report.gates).map(([key, value]) => `| ${key} | ${value ? 'PASS' : 'FAIL'} |`),
  ];
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    gates: report.gates,
    qdrant_usable_candidates: report.qdrant?.usable_candidates ?? 0,
    http_indexed: report.http_health_after?.indexed ?? 0,
    grpc_candidates: report.grpc_search?.candidate_count ?? 0,
    out: OUT,
  }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}

main();
