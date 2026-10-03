#!/usr/bin/env node
/**
 * SUMMARY-GRAPH-01 (artifact-only, derived; no DB/Qdrant/Valkey/Neo4j): exact kNN graph over the legacy-summary hint vectors.
 * Dedupe-aware: rows sharing a summaryDigest form a DUPLICATE group (one node per digest, representative = smallest chunkRowId);
 * kNN edges connect distinct digests only. Edges are binary arrays (src u32, dst u32, score f32) over group indexes; JSONL is control plane.
 * graphRevision = sha256(vector-set manifest checksums + params). canonicalAuthority:false; never a retrieval vote or identity.
 * Usage: node scripts/atlas/build-summary-hint-graph-v1.mjs --dir=<embedding-full dir> [--k=10] [--min-score=0.80]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const napi = require(path.join(REPO_ROOT, 'crates/turbovec-napi/turbovec-napi.win32-x64-msvc.node'));
const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const dir = path.resolve(REPO_ROOT, args.get('dir'));
const K = Number(args.get('k') ?? 10), MIN = Number(args.get('min-score') ?? 0.8), DIM = 768;
const NL = String.fromCharCode(10);
const sha = (s) => `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;

const vman = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const idx = fs.readFileSync(path.join(dir, 'index.ndjson'), 'utf8').split(NL).filter(Boolean).map((l) => JSON.parse(l));
const b = fs.readFileSync(path.join(dir, 'vectors.f32'));
const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
if (all.length !== idx.length * DIM) throw new Error('VECTOR_INDEX_LENGTH_MISMATCH');

// dedupe groups by summaryDigest (representative = smallest chunkRowId)
const groups = new Map();
idx.forEach((r) => { const g = groups.get(r.summaryDigest); if (g) g.push(r); else groups.set(r.summaryDigest, [r]); });
const nodes = [...groups.entries()].map(([digest, rows]) => { rows.sort((x, y) => (x.chunkRowId < y.chunkRowId ? -1 : 1)); return { digest, rep: rows[0], members: rows }; }).sort((x, y) => (x.rep.chunkRowId < y.rep.chunkRowId ? -1 : 1));
const N = nodes.length;
const flat = new Float32Array(N * DIM);
nodes.forEach((n, i) => flat.set(all.subarray(n.rep.row * DIM, (n.rep.row + 1) * DIM), i * DIM));

const t0 = Date.now();
const res = napi.hintExactCosineTopk(flat, flat, DIM, K + 1);
const searchMs = Date.now() - t0;

const src = [], dst = [], score = [];
let selfSkipped = 0, belowMin = 0;
for (let i = 0; i < N; i++) {
  let taken = 0;
  for (let j = 0; j < K + 1 && taken < K; j++) {
    const d = res.indices[i * (K + 1) + j], s = res.scores[i * (K + 1) + j];
    if (d === i) { selfSkipped++; continue; }
    taken++;
    if (s < MIN) { belowMin++; continue; }
    src.push(i); dst.push(d); score.push(s);
  }
}
// mutual edges (i->j and j->i both present) form the stable graph; components over mutual edges only
const key = (a, c) => a * N + c;
const set = new Set(); for (let e = 0; e < src.length; e++) set.add(key(src[e], dst[e]));
const mutual = []; for (let e = 0; e < src.length; e++) if (src[e] < dst[e] && set.has(key(dst[e], src[e]))) mutual.push(e);
const parent = Int32Array.from({ length: N }, (_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
for (const e of mutual) { const a = find(src[e]), c = find(dst[e]); if (a !== c) parent[Math.max(a, c)] = Math.min(a, c); }
const comp = new Map(); for (let i = 0; i < N; i++) { const r = find(i); comp.set(r, (comp.get(r) ?? 0) + 1); }
const sizes = [...comp.values()].sort((x, y) => y - x);
const boundNodes = nodes.filter((n) => n.members.some((m) => m.hintClass === 'LEGACY_HINT_LINEAGE_BOUND')).length;

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const out = path.join(REPO_ROOT, '.tmp/atlas/summary-hint-graph-v1', stamp);
fs.mkdirSync(out, { recursive: true });
const u32 = (a) => Buffer.from(Uint32Array.from(a).buffer), f32 = (a) => Buffer.from(Float32Array.from(a).buffer);
const files = { 'edges-src.u32': u32(src), 'edges-dst.u32': u32(dst), 'edges-score.f32': f32(score) };
const fileMeta = {};
for (const [name, buf] of Object.entries(files)) { fs.writeFileSync(path.join(out, name), buf, { flag: 'wx' }); fileMeta[name] = { bytes: buf.length, sha256: sha(buf) }; }
const nodeBody = nodes.map((n, i) => JSON.stringify({ schema: 'atlas.summary-hint-graph-node.v1', node: i, summaryDigest: n.digest, repChunkRowId: n.rep.chunkRowId, duplicateCount: n.members.length, memberChunkRowIds: n.members.map((m) => m.chunkRowId), lineageBound: n.members.some((m) => m.hintClass === 'LEGACY_HINT_LINEAGE_BOUND'), component: find(i) })).join(NL) + NL;
fs.writeFileSync(path.join(out, 'nodes.ndjson'), nodeBody, { flag: 'wx' }); fileMeta['nodes.ndjson'] = { rows: N, sha256: sha(nodeBody) };
const graphRevision = sha(JSON.stringify({ vectorSet: vman.files, k: K, minScore: MIN, dim: DIM, dedupe: 'summaryDigest', engine: 'hintExactCosineTopk' }));
const manifest = {
  schema: 'atlas.summary-hint-graph.v1', canonicalAuthority: false, retrievalVoteAdded: false, graphRevision, sourceVectorSet: path.relative(REPO_ROOT, dir).split(path.sep).join('/'),
  params: { k: K, minScore: MIN, metric: 'cosine', dedupe: 'summaryDigest' }, inputRows: idx.length, nodes: N, duplicateRowsCollapsed: idx.length - N,
  duplicateGroups: nodes.filter((n) => n.members.length > 1).length, largestDuplicateGroup: Math.max(...nodes.map((n) => n.members.length)),
  directedEdges: src.length, mutualEdges: mutual.length, selfSkipped, edgesBelowMinScoreDropped: belowMin, components: { count: comp.size, largest: sizes[0], singletons: sizes.filter((s) => s === 1).length, top5: sizes.slice(0, 5) },
  lineageBoundNodes: boundNodes, searchMs, files: fileMeta, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, neo4jWrites: 0, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, out).split(path.sep).join('/'), ...manifest, files: undefined }, null, 1));
