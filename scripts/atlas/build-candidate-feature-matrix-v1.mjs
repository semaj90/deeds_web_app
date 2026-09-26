#!/usr/bin/env node

/**
 * Local-only CandidateFeatureMatrix draft over REVISION_QUALIFIED enriched-index rows.
 * Bulk numbers go to raw F32LE / u8 files (never JSON). Descriptor + checksums in JSON.
 * Placeholder (shared) embeddings are masked as absent. Projections are metadata, not features.
 * Marked NOT canonical while blockers (representation_revision, som_revision) remain.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const dir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const manifest = JSON.parse(fs.readFileSync(path.join(shardRoot, dir, 'manifest.json'), 'utf8'));
const cand = [];
for (const s of manifest.shards) for (const l of fs.readFileSync(path.join(shardRoot, dir, s.path), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (r.lineageState === 'REVISION_QUALIFIED') cand.push(r); }
cand.sort((a, b) => (a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0));
const N = cand.length;
const refs = cand.map((r) => r.sourceRef);
const ordinalChecksum = crypto.createHash('sha256').update(cand.map((r, i) => `${i}\t${r.packetKey}\t${r.sourceRef}`).join('\n')).digest('hex');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
const client = await pool.connect();
let feat; let embRows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  feat = (await client.query(`SELECT ap.source_ref, ap.packet_key,
      coalesce(ap.pagerank_raw, ap.pagerank_score, ap.page_rank_score) AS pagerank,
      cardinality(ap.concept_ids) AS concept_card,
      (ap.summary IS NOT NULL AND btrim(ap.summary) <> '') AS has_summary,
      cardinality(ap.keywords) AS keyword_card,
      ap.k_core, ap.latent_64 IS NOT NULL AS has_latent64
    FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[])`, [refs])).rows;
  // real embeddings only: rows whose vector is NOT in a group shared by >1% of embedded rows
  embRows = (await client.query(`WITH e AS (
        SELECT ap.source_ref, ap.packet_key, ap.embedding::vector AS v, md5(ap.embedding::text) AS h
        FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[]) AND ap.embedding IS NOT NULL),
      g AS (SELECT h, count(*) AS n FROM e GROUP BY h),
      lim AS (SELECT greatest(1, floor(count(*) * 0.01)) AS t FROM e)
    SELECT e.source_ref, e.packet_key, e.v::text AS v FROM e JOIN g USING (h), lim WHERE g.n <= lim.t`, [refs])).rows;
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}

const byRef = new Map(feat.map((r) => [r.source_ref, r]));
for (const c of cand) { const f = byRef.get(c.sourceRef); if (!f || f.packet_key !== c.packetKey) throw new Error(`PACKET_KEY_MISMATCH:${c.sourceRef}`); }
const idx = new Map(refs.map((r, i) => [r, i]));

const NUM = ['log1p_pagerank', 'concept_cardinality_log1p', 'summary_present', 'keyword_present', 'k_core_log1p', 'latent64_present'];
const K = NUM.length;
const X = new Float32Array(N * K);
const M = new Uint8Array(N * K); // 1 = value observed, 0 = missing (value written as 0)
const set = (i, k, v) => { if (v === null || v === undefined || Number.isNaN(Number(v))) return; X[i * K + k] = Number(v); M[i * K + k] = 1; };
for (const f of feat) {
  const i = idx.get(f.source_ref);
  set(i, 0, f.pagerank === null ? null : Math.log1p(Math.max(0, f.pagerank)));
  set(i, 1, f.concept_card === null ? null : Math.log1p(f.concept_card));
  set(i, 2, f.has_summary ? 1 : 0);
  set(i, 3, f.keyword_card === null ? null : (f.keyword_card > 0 ? 1 : 0));
  set(i, 4, f.k_core === null ? null : Math.log1p(Math.max(0, f.k_core)));
  set(i, 5, f.has_latent64 ? 1 : 0);
}

const D = 768;
const E = new Float32Array(N * D);
const EM = new Uint8Array(N);
let badNorm = 0;
for (const r of embRows) {
  const i = idx.get(r.source_ref); if (i === undefined) continue;
  const v = r.v.slice(1, -1).split(',').map(Number);
  if (v.length !== D) throw new Error(`EMBEDDING_DIM:${r.source_ref}:${v.length}`);
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n);
  if (!(n > 1e-6) || !Number.isFinite(n)) { badNorm += 1; continue; }
  for (let j = 0; j < D; j += 1) E[i * D + j] = v[j] / n;
  EM[i] = 1;
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(REPO_ROOT, '.tmp/atlas/candidate-feature-matrix-v1', stamp);
fs.mkdirSync(outDir, { recursive: true });
const files = {
  'numeric.f32le': Buffer.from(X.buffer), 'numeric_mask.u8': Buffer.from(M.buffer),
  'semantic768.f32le': Buffer.from(E.buffer), 'semantic768_mask.u8': Buffer.from(EM.buffer),
};
const digests = {};
for (const [name, buf] of Object.entries(files)) { fs.writeFileSync(path.join(outDir, name), buf, { flag: 'wx' }); digests[name] = { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }; }
// candidate ordinal map (metadata; identity stays packetKey/sourceRef)
const ordinalBody = cand.map((r, i) => JSON.stringify({ candidateOrdinal: i, packetKey: r.packetKey, sourceRef: r.sourceRef, domainClass: r.domainClass, clusterId: r.clusterId, communityId: r.communityId, somCell: r.somCell, astState: r.astState })).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'candidate-ordinal-map.ndjson'), ordinalBody, { flag: 'wx' });
digests['candidate-ordinal-map.ndjson'] = { bytes: Buffer.byteLength(ordinalBody), sha256: crypto.createHash('sha256').update(ordinalBody).digest('hex') };

const observed = NUM.map((n, k) => { let c = 0; for (let i = 0; i < N; i += 1) c += M[i * K + k]; return [n, Number((c / N).toFixed(4))]; });
const descriptor = {
  schema: 'atlas.candidate-feature-matrix-draft.v1', canonical: false,
  notCanonicalBecause: ['representation_revision is legacy 0 on every packet', 'som_revision absent', 'embedding_digest absent'],
  sourceShards: { dir: path.relative(REPO_ROOT, path.join(shardRoot, dir)), rootSha256: manifest.rootSha256 },
  workspaceRevision: manifest.workspaceRevision, candidates: N, ordinalMapChecksum: ordinalChecksum, ordering: 'sourceRef ascending; ordinal = row index',
  numeric: { shape: [N, K], dtype: 'float32-le', columns: NUM, maskFile: 'numeric_mask.u8', missingValueWrittenAs: 0, observedFraction: Object.fromEntries(observed) },
  semantic768: { shape: [N, D], dtype: 'float32-le', l2Normalized: true, maskFile: 'semantic768_mask.u8', realEmbeddings: EM.reduce((a, b) => a + b, 0), maskedPlaceholderOrAbsent: N - EM.reduce((a, b) => a + b, 0), badNormSkipped: badNorm, placeholderRule: 'vector shared by >1% of embedded qualified rows is treated as absent' },
  excludedFeatures: ['ast_score', 'reward_prior', 'community_confidence', 'representation_revision'],
  projectionsAreMetadataOnly: ['domainClass', 'clusterId', 'communityId', 'somCell'],
  files: digests, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, 'descriptor.json'), JSON.stringify(descriptor, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/candidate-feature-matrix-draft-v1.json'), JSON.stringify({ ...descriptor, outDir: path.relative(REPO_ROOT, outDir) }, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outDir: path.relative(REPO_ROOT, outDir), candidates: N, numeric: descriptor.numeric, semantic768: descriptor.semantic768, ordinalMapChecksum: ordinalChecksum }, null, 2));
