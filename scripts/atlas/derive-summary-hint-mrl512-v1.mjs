#!/usr/bin/env node
/**
 * SUMMARY-MRL512-01 (artifact-only, derived; no DB/Qdrant/Valkey): MRL-prefix 512-d lane from the validated 768-d summary hint vectors
 * (first 512 dims, L2 re-normalised) written as raw F32LE, plus fidelity vs the 768-d exact oracle (recall@k over the same query rows, ties tolerated by set).
 * SECONDARY, non-authoritative: never a retrieval vote or identity; 768 stays primary (Embedding Dimensions Policy).
 * Usage: node scripts/atlas/derive-summary-hint-mrl512-v1.mjs --dir=<embedding-full dir> [--queries=500] [--k=10]
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
const NQ = Number(args.get('queries') ?? 500), K = Number(args.get('k') ?? 10), D768 = 768, D512 = 512, NL = String.fromCharCode(10);
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;

const vman = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const buf = fs.readFileSync(path.join(dir, 'vectors.f32'));
const v768 = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const n = v768.length / D768;
const v512 = new Float32Array(n * D512);
let zero = 0;
for (let i = 0; i < n; i++) {
  let s = 0;
  for (let d = 0; d < D512; d++) { const x = v768[i * D768 + d]; v512[i * D512 + d] = x; s += x * x; }
  const norm = Math.sqrt(s);
  if (norm === 0) { zero++; continue; }
  for (let d = 0; d < D512; d++) v512[i * D512 + d] /= norm;
}

// query rows evenly spaced; compare on distinct-digest representatives to avoid duplicate-tie noise
const idx = fs.readFileSync(path.join(dir, 'index.ndjson'), 'utf8').split(NL).filter(Boolean).map((l) => JSON.parse(l));
const seen = new Set(), repRows = [];
idx.forEach((r) => { if (!seen.has(r.summaryDigest)) { seen.add(r.summaryDigest); repRows.push(r.row); } });
const m = repRows.length;
const pick = (dim, src) => { const o = new Float32Array(m * dim); repRows.forEach((r, i) => o.set(src.subarray(r * dim, (r + 1) * dim), i * dim)); return o; };
const c768 = pick(D768, v768), c512 = pick(D512, v512);
const qRows = Array.from({ length: NQ }, (_, i) => Math.floor((i * m) / NQ));
const q768 = new Float32Array(NQ * D768), q512 = new Float32Array(NQ * D512);
qRows.forEach((r, i) => { q768.set(c768.subarray(r * D768, (r + 1) * D768), i * D768); q512.set(c512.subarray(r * D512, (r + 1) * D512), i * D512); });
const kk = K + 1;
const t0 = performance.now(); const e768 = napi.hintExactCosineTopk(c768, q768, D768, kk); const ms768 = performance.now() - t0;
const t1 = performance.now(); const e512 = napi.hintExactCosineTopk(c512, q512, D512, kk); const ms512 = performance.now() - t1;
const drop = (r, qi) => Array.from(r.indices.slice(qi * kk, (qi + 1) * kk)).filter((x) => x !== qRows[qi]).slice(0, K);
let hit = 0, top1 = 0;
for (let qi = 0; qi < NQ; qi++) { const a = drop(e768, qi), b = drop(e512, qi); hit += a.filter((x) => b.includes(x)).length; if (a[0] === b[0]) top1++; }

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const out = path.join(REPO_ROOT, '.tmp/atlas/summary-hint-mrl512-v1', stamp);
fs.mkdirSync(out, { recursive: true });
const b512 = Buffer.from(v512.buffer);
fs.writeFileSync(path.join(out, 'vectors-512.f32'), b512, { flag: 'wx' });
const manifest = {
  schema: 'atlas.summary-hint-mrl512.v1', canonicalAuthority: false, retrievalVoteAdded: false, lane: 'SECONDARY_DERIVED_MRL_PREFIX',
  derivation: 'first 512 dims of validated semantic_768, L2 re-normalised (MRL prefix)', sourceVectorSet: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), sourceVectorsSha256: vman.files.vectors.sha256,
  rows: n, dim: D512, zeroNormRows: zero, layout: 'F32LE row-major, row i at byte i*512*4', file: { path: 'vectors-512.f32', bytes: b512.length, sha256: sha(b512) },
  residentBytes: { fp32_768: n * D768 * 4, fp32_512: n * D512 * 4, saving: `${Math.round((1 - D512 / D768) * 100)}%` },
  fidelityVs768Exact: { distinctNodes: m, queries: NQ, k: K, recallAtK: hit / (NQ * K), top1Agreement: top1 / NQ, exact768Ms: Math.round(ms768), exact512Ms: Math.round(ms512) },
  note: 'Measures prefix-truncation fidelity vs the 768 exact oracle on distinct-digest nodes; unlabelled, so not a relevance claim.', databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, out).split(path.sep).join('/'), ...manifest, file: undefined }, null, 1));
