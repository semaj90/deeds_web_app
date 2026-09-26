#!/usr/bin/env node
/**
 * SUMMARY-NAPI-01 / SUMMARY-TURBOVEC-01 (offline, artifact-only): compares the turbovec-napi quantized top-k CHALLENGER against
 * the exact cosine ORACLE (also cross-checked against a plain JS reference) on a legacy-summary hint embedding artifact.
 * Never a canonical identity or a second RRF vote. Usage: node scripts/atlas/compare-summary-hint-topk-v1.mjs --dir=<embedding artifact dir> [--queries=100] [--k=10] [--bits=2,3,4]
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
const nq = Number(args.get('queries') ?? 100), K = Number(args.get('k') ?? 10);
const bitsList = (args.get('bits') ?? '2,3,4').split(',').map(Number);
const NL = String.fromCharCode(10), DIM = 768;

let flat, n;
if (fs.existsSync(path.join(dir, 'vectors.f32'))) { // raw F32LE layout from embed-all-legacy-summary-hints-v1
  const b = fs.readFileSync(path.join(dir, 'vectors.f32'));
  flat = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  n = flat.length / DIM;
} else if (fs.existsSync(path.join(dir, 'manifest.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).schema === 'atlas.summary-hint-vector-fanout.v1') {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.status !== 'ARTIFACT_ONLY_PROVEN' || manifest.canonicalAuthority !== false || manifest.retrievalVoteAdded !== false) throw new Error('HINT_ARTIFACT_NOT_SEALED_OR_PROMOTED');
  const reps = [];
  const rootHash = crypto.createHash('sha256');
  for (const shard of manifest.shards) {
    const bytes = fs.readFileSync(path.join(dir, shard.path));
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (digest !== shard.sha256) throw new Error(`SHARD_CHECKSUM_MISMATCH:${shard.path}`);
    rootHash.update(bytes);
    for (const line of bytes.toString('utf8').split(NL).filter(Boolean)) reps.push(JSON.parse(line));
  }
  if (`sha256:${rootHash.digest('hex')}` !== manifest.vectorRootSha256) throw new Error('VECTOR_ROOT_CHECKSUM_MISMATCH');
  if (reps.length !== manifest.generatedRows) throw new Error('MANIFEST_ROW_COUNT_MISMATCH');
  n = reps.length;
  flat = new Float32Array(n * DIM);
  const identities = new Set();
  reps.forEach((r, i) => {
    if (r.schema !== 'atlas.summary-hint-representation.v1' || r.canonicalAuthority !== false || r.retrievalVoteAdded !== false || r.dimension !== DIM || r.vector.length !== DIM || r.vector.some((x) => !Number.isFinite(x))) throw new Error(`INVALID_HINT_VECTOR_ROW:${i}`);
    if (r.ordinal !== i || identities.has(r.chunkRowId)) throw new Error(`ORDINAL_OR_IDENTITY_MISMATCH:${i}`);
    identities.add(r.chunkRowId);
    const norm = Math.sqrt(r.vector.reduce((s, x) => s + x * x, 0));
    if (Math.abs(norm - 1) > 1e-3 || Math.abs(norm - r.norm) > 1e-6) throw new Error(`VECTOR_NORM_MISMATCH:${i}`);
    const vectorBytes = Buffer.from(Float32Array.from(r.vector).buffer);
    if (`sha256:${crypto.createHash('sha256').update(vectorBytes).digest('hex')}` !== r.vectorDigest) throw new Error(`VECTOR_DIGEST_MISMATCH:${i}`);
    flat.set(r.vector, i * DIM);
  });
} else {
  const reps = fs.readFileSync(path.join(dir, 'representations-00001.ndjson'), 'utf8').split(NL).filter(Boolean).map((l) => JSON.parse(l));
  n = reps.length;
  flat = new Float32Array(n * DIM);
  reps.forEach((r, i) => flat.set(r.vector, i * DIM));
}
// deterministic query rows: evenly spaced
const qRows = Array.from({ length: nq }, (_, i) => Math.floor((i * n) / nq));
const queries = new Float32Array(nq * DIM);
qRows.forEach((row, qi) => queries.set(flat.subarray(row * DIM, (row + 1) * DIM), qi * DIM));

const kk = K + 1; // request one extra so the query's own row can be dropped
const drop = (res, qi) => { const idx = Array.from(res.indices.slice(qi * kk, (qi + 1) * kk)).filter((x) => x !== qRows[qi]); return idx.slice(0, K); };

const t0 = performance.now();
const exact = napi.hintExactCosineTopk(flat, queries, DIM, kk);
const exactMs = performance.now() - t0;

// JS reference for the oracle (first 20 queries)
let oracleAgree = 0, oracleChecked = Math.min(20, nq);
for (let qi = 0; qi < oracleChecked; qi++) {
  const q = flat.subarray(qRows[qi] * DIM, (qRows[qi] + 1) * DIM);
  const sc = [];
  for (let i = 0; i < n; i++) { let s = 0; for (let d = 0; d < DIM; d++) s += flat[i * DIM + d] * q[d]; sc.push([i, s]); }
  sc.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const js = sc.filter(([i]) => i !== qRows[qi]).slice(0, K).map(([i]) => i);
  const rs = drop(exact, qi);
  // tolerate reordering among exactly tied scores: compare as sets of the top-K
  if (js.every((x) => rs.includes(x))) oracleAgree++;
}

const challengers = [];
for (const bits of bitsList) {
  const t1 = performance.now();
  let res, err = null;
  try { res = napi.hintTurbovecTopk(flat, queries, DIM, bits, kk); } catch (e) { err = String(e.message); }
  const ms = performance.now() - t1;
  if (err) { challengers.push({ bits, status: 'FAILED', reason: err, recallAtK: null }); continue; }
  let hit = 0, top1 = 0;
  for (let qi = 0; qi < nq; qi++) {
    const e = drop(exact, qi), c = drop(res, qi);
    hit += e.filter((x) => c.includes(x)).length;
    if (e[0] === c[0]) top1++;
  }
  challengers.push({ bits, status: 'OK', recallAtK: hit / (nq * K), top1Agreement: top1 / nq, buildPlusSearchMs: Math.round(ms), residentBytesApprox: Math.round((n * DIM * bits) / 8) });
}

const receipt = {
  schema: 'atlas.summary-hint-topk-comparison.v1', status: oracleAgree === oracleChecked ? 'CHALLENGER_MEASURED' : 'ORACLE_NOT_PROVEN', canonicalAuthority: false, retrievalVoteAdded: false,
  artifactDir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), rows: n, dim: DIM, queries: nq, k: K,
  oracle: { residentBytesFp32: n * DIM * 4, implementation: 'turbovec-napi hintExactCosineTopk (rayon, f64 accumulate)', jsReferenceAgreement: `${oracleAgree}/${oracleChecked}`, ms: Math.round(exactMs) },
  challengers, caveat: 'Unlabelled artifact set; measures quantization fidelity vs exact cosine, not relevance. Queries are rows of the same set (self dropped).',
  databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, generatedAt: new Date().toISOString(),
};
const out = path.join(REPO_ROOT, args.get('out') ?? 'docs/reports/summary-hint-topk-comparison-v1.json');
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + NL);
console.log(JSON.stringify(receipt, null, 1));
