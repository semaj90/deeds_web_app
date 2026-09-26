#!/usr/bin/env node
/** Exact cosine kNN graph over sealed legacy HINT vectors; local CSR only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const napi = require(path.join(REPO_ROOT, 'crates/turbovec-napi/turbovec-napi.win32-x64-msvc.node'));
const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const dir = path.resolve(REPO_ROOT, args.get('dir') ?? '.tmp/atlas/legacy-summary-hint-vectors-v1/legacy-full-20260926-a');
const batchSize = Number(args.get('query-batch') ?? 256), k = Number(args.get('k') ?? 16);
const runId = args.get('run-id') ?? `exact-knn-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const NL = String.fromCharCode(10), DIM = 768;
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1024 || !Number.isInteger(k) || k < 1 || k > 128 || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(runId)) throw new Error('BOUNDS_INVALID');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'atlas.summary-hint-vector-fanout.v1' || manifest.status !== 'ARTIFACT_ONLY_PROVEN' || manifest.canonicalAuthority !== false || manifest.retrievalVoteAdded !== false) throw new Error('HINT_INPUT_NOT_SEALED');
const records = [], root = crypto.createHash('sha256');
for (const shard of manifest.shards) {
  const bytes = fs.readFileSync(path.join(dir, shard.path));
  if (sha(bytes) !== shard.sha256) throw new Error(`SHARD_CHECKSUM_MISMATCH:${shard.path}`);
  root.update(bytes);
  for (const line of bytes.toString('utf8').split(NL).filter(Boolean)) records.push(JSON.parse(line));
}
if (`sha256:${root.digest('hex')}` !== manifest.vectorRootSha256 || records.length !== manifest.generatedRows) throw new Error('INPUT_ROOT_OR_COUNT_MISMATCH');
const n = records.length;
if (n < k + 1) throw new Error('INPUT_TOO_SMALL');
const vectors = new Float32Array(n * DIM), nodeIds = new Set();
const nodeMap = records.map((r, ordinal) => {
  if (r.schema !== 'atlas.summary-hint-representation.v1' || r.ordinal !== ordinal || r.canonicalAuthority !== false || r.retrievalVoteAdded !== false || r.dimension !== DIM || r.vector?.length !== DIM || nodeIds.has(r.chunkRowId)) throw new Error(`INPUT_ROW_INVALID:${ordinal}`);
  nodeIds.add(r.chunkRowId);
  if (r.vector.some((x) => !Number.isFinite(x))) throw new Error(`NONFINITE_VECTOR:${ordinal}`);
  const norm = Math.sqrt(r.vector.reduce((sum, x) => sum + x * x, 0));
  if (Math.abs(norm - 1) > 1e-3) throw new Error(`NONUNIT_VECTOR:${ordinal}`);
  vectors.set(r.vector, ordinal * DIM);
  return { ordinal, chunkRowId: r.chunkRowId, chunkId: r.chunkId, hintClass: r.hintClass, summaryDigest: r.summaryDigest };
});
const descriptor = { schema: 'atlas.summary-hint-knn-graph.v1', algorithm: 'exact-cosine-topk-rayon-f64accum-v1', inputRoot: manifest.vectorRootSha256, rowCount: n, dimension: DIM, k, directed: true, selfEdges: false, canonicalAuthority: false, retrievalVoteAdded: false };
const graphRevision = sha(Buffer.from(JSON.stringify(descriptor)));
const outputDir = path.join(REPO_ROOT, '.tmp/atlas/summary-hint-knn-csr-v1', runId);
fs.mkdirSync(outputDir, { recursive: true });
if (fs.readdirSync(outputDir).length) throw new Error('OUTPUT_DIR_NOT_EMPTY');

const indptr = new Uint32Array(n + 1), indices = new Uint32Array(n * k), weights = new Float32Array(n * k);
for (let start = 0; start < n; start += batchSize) {
  const count = Math.min(batchSize, n - start);
  const queries = vectors.subarray(start * DIM, (start + count) * DIM);
  const top = napi.hintExactCosineTopk(vectors, queries, DIM, k + 1);
  for (let q = 0; q < count; q++) {
    const source = start + q, row = [];
    for (let j = 0; j < k + 1; j++) {
      const at = q * (k + 1) + j, target = top.indices[at], score = top.scores[at];
      if (target === source) continue;
      if (!Number.isInteger(target) || target < 0 || target >= n || !Number.isFinite(score) || score < -1.00001 || score > 1.00001) throw new Error(`TOPK_ROW_INVALID:${source}:${j}`);
      row.push([target, score]);
      if (row.length === k) break;
    }
    if (row.length !== k || row.some((edge, i) => i > 0 && row[i - 1][1] < edge[1])) throw new Error(`TOPK_CONSERVATION_OR_ORDER:${source}`);
    indptr[source] = source * k;
    for (let j = 0; j < k; j++) { indices[source * k + j] = row[j][0]; weights[source * k + j] = row[j][1]; }
  }
  console.log(JSON.stringify({ progressPct: Math.floor(100 * Math.min(start + count, n) / n), completedRows: Math.min(start + count, n), totalRows: n }));
}
indptr[n] = n * k;
const writeBinary = (name, view) => { const bytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength); fs.writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' }); return { path: name, bytes: bytes.length, sha256: sha(bytes) }; };
const nodeBytes = Buffer.from(nodeMap.map((r) => JSON.stringify(r)).join(NL) + NL);
fs.writeFileSync(path.join(outputDir, 'nodes.ndjson'), nodeBytes, { flag: 'wx' });
const files = [writeBinary('indptr.u32', indptr), writeBinary('indices.u32', indices), writeBinary('weights.f32', weights), { path: 'nodes.ndjson', bytes: nodeBytes.length, sha256: sha(nodeBytes) }];
const graphReceipt = { ...descriptor, status: 'ARTIFACT_ONLY_EXACT_GRAPH_PROVEN', graphRevision, input: { artifactDir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), vectorRootSha256: manifest.vectorRootSha256 }, nodes: n, edges: indices.length, nodeMapSha256: sha(nodeBytes), files, executor: 'turbovec-napi hintExactCosineTopk (rayon)', outputFormat: 'CSR: indptr.u32 + indices.u32 + weights.f32 + ordinal node map', databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, retrievalVoteAdded: false, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(graphReceipt, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ ...graphReceipt, outputDir: path.relative(REPO_ROOT, outputDir).split(path.sep).join('/') }, null, 2));
