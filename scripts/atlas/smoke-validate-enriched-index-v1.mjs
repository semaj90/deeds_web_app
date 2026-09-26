#!/usr/bin/env node

/**
 * Smoke validation for the current enriched-index shards + a derived blocker registry.
 * Read-only (DB + files). Exit 1 on any failed check. Blockers are reported, not "fixed":
 * fixing them requires database writes that need explicit operator approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { ENRICHMENT_READINESS_CTE_V1 } from './lib/enrichment-readiness-sql-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const dir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const manifest = JSON.parse(fs.readFileSync(path.join(shardRoot, dir, 'manifest.json'), 'utf8'));
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), detail: detail ?? null }); };

// 1. Shard integrity
const records = [];
for (const s of manifest.shards) {
  const body = fs.readFileSync(path.join(shardRoot, dir, s.path), 'utf8');
  check(`shard sha256 ${s.path}`, crypto.createHash('sha256').update(body).digest('hex') === s.sha256);
  const lines = body.split('\n').filter(Boolean);
  check(`shard record count ${s.path}`, lines.length === s.records, `${lines.length}/${s.records}`);
  for (const l of lines) records.push(JSON.parse(l));
}
const root = crypto.createHash('sha256').update(manifest.shards.map((s) => `${s.path}:${s.sha256}`).join('\n')).digest('hex');
check('manifest root sha256', root === manifest.rootSha256);
check('total records equals manifest', records.length === manifest.records, `${records.length}`);

// 2. Record invariants
const STATES = new Set(['REVISION_QUALIFIED', 'REVISION_MISSING', 'REVISION_CONFLICT', 'REVISION_HASH_CONFLICT', 'LEGACY_ONLY', 'IDENTITY_UNRESOLVED']);
const REV = /^[0-9a-f]{64}$|^sha256:[0-9a-f]{64}$/;
check('unique sourceRef', new Set(records.map((r) => r.sourceRef)).size === records.length);
check('schema tag on every record', records.every((r) => r.schema === 'atlas.enriched-index-record.v1'));
check('lineageState in vocabulary', records.every((r) => STATES.has(r.lineageState)));
check('qualified rows carry packetKey + revision', records.filter((r) => r.lineageState === 'REVISION_QUALIFIED').every((r) => r.packetKey && REV.test(r.sourceRevision)));
check('packetKey unique among packet-bearing rows', (() => { const k = records.filter((r) => r.packetKey).map((r) => r.packetKey); return new Set(k).size === k.length; })());
check('no summary text copied', records.every((r) => typeof r.summary === 'object' && !('text' in r.summary)));
check('embedding never marked identity', records.every((r) => r.representation.isIdentity === false));
check('unresolved/legacy rows have no packetKey', records.filter((r) => r.lineageState === 'IDENTITY_UNRESOLVED' || r.lineageState === 'LEGACY_ONLY').every((r) => !r.packetKey));
check('summary.revisionQualified only when qualified', records.every((r) => !r.summary.revisionQualified || r.lineageState === 'REVISION_QUALIFIED'));
check('non-eligible AST rows are NOT_APPLICABLE', records.filter((r) => r.astEligibility === 'NOT_ELIGIBLE').every((r) => r.astState === 'NOT_APPLICABLE'));
check('hash-conflict rows never counted qualified', records.filter((r) => r.packetSha256MatchesAdmitted === false).every((r) => r.lineageState !== 'REVISION_QUALIFIED'));

// 2b. Matrix draft integrity (if built)
const matrixRoot = path.join(REPO_ROOT, '.tmp/atlas/candidate-feature-matrix-v1');
if (fs.existsSync(matrixRoot)) {
  const mdir = path.join(matrixRoot, fs.readdirSync(matrixRoot).sort().at(-1));
  const d = JSON.parse(fs.readFileSync(path.join(mdir, 'descriptor.json'), 'utf8'));
  for (const [name, meta] of Object.entries(d.files)) {
    const buf = fs.readFileSync(path.join(mdir, name));
    check(`matrix file sha256 ${name}`, buf.length === meta.bytes && crypto.createHash('sha256').update(buf).digest('hex') === meta.sha256);
  }
  check('matrix numeric size = N*K*4', d.files['numeric.f32le'].bytes === d.candidates * d.numeric.shape[1] * 4);
  check('matrix semantic size = N*768*4', d.files['semantic768.f32le'].bytes === d.candidates * 768 * 4);
  check('matrix candidates equals qualified rows', d.candidates === records.filter((r) => r.lineageState === 'REVISION_QUALIFIED').length);
  check('matrix never claims canonical while blockers remain', d.canonical === false);
  const em = fs.readFileSync(path.join(mdir, 'semantic768_mask.u8'));
  const ef = fs.readFileSync(path.join(mdir, 'semantic768.f32le'));
  let bad = 0; for (let i = 0; i < d.candidates; i += 1) { let n = 0; for (let j = 0; j < 768; j += 1) { const v = ef.readFloatLE((i * 768 + j) * 4); n += v * v; } if (em[i] === 1 ? Math.abs(Math.sqrt(n) - 1) > 1e-3 : n !== 0) bad += 1; }
  check('matrix: observed embeddings unit-norm, masked rows zero', bad === 0, String(bad));
}

// 3. Embedding sanity on qualified rows (read-only)
const qualifiedRefs = records.filter((r) => r.lineageState === 'REVISION_QUALIFIED').map((r) => r.sourceRef);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
let emb; let rep; let dup; let gate;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  emb = (await client.query(`SELECT count(*)::int AS rows,
      count(*) FILTER (WHERE ap.embedding IS NOT NULL)::int AS with_embedding,
      count(*) FILTER (WHERE ap.embedding IS NOT NULL AND vector_dims(ap.embedding::vector) <> 768)::int AS wrong_dim,
      count(*) FILTER (WHERE ap.embedding IS NOT NULL AND vector_norm(ap.embedding::vector) < 1e-6)::int AS zero_norm,
      count(*) FILTER (WHERE ap.embedding IS NOT NULL AND (vector_norm(ap.embedding::vector) < 0.99 OR vector_norm(ap.embedding::vector) > 1.01))::int AS non_unit_norm,
      count(*) FILTER (WHERE ap.embedding IS NOT NULL AND vector_norm(ap.embedding::vector) = 'NaN'::float8)::int AS nan_norm,
      count(DISTINCT md5(ap.embedding::text)) FILTER (WHERE ap.embedding IS NOT NULL)::int AS distinct_vectors,
      count(*) FILTER (WHERE ap.embedding_version IS NOT NULL)::int AS with_embedding_version,
      count(DISTINCT ap.embedding_version)::int AS distinct_embedding_versions
    FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[])`, [qualifiedRefs])).rows[0];
  rep = (await client.query(`SELECT count(*) FILTER (WHERE ap.representation_revision IS DISTINCT FROM 0)::int AS non_legacy_representation_revision,
      count(*) FILTER (WHERE ap.som_revision IS NOT NULL)::int AS som_revision_present,
      count(*) FILTER (WHERE ap.embedding_digest IS NOT NULL)::int AS embedding_digest_present
    FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[])`, [qualifiedRefs])).rows[0];
  dup = (await client.query(`SELECT coalesce(max(n),0)::int AS largest_identical_group, coalesce(sum(n) FILTER (WHERE n > 1),0)::int AS rows_in_duplicate_groups FROM (SELECT count(*) AS n FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[]) AND ap.embedding IS NOT NULL GROUP BY md5(ap.embedding::text)) g`, [qualifiedRefs])).rows[0];
  dup.embedding_eligible_false = (await client.query(`SELECT count(*)::int AS n FROM public.atlas_packets ap WHERE ap.source_ref = ANY($1::text[]) AND ap.embedding IS NOT NULL AND ap.embedding_eligible IS FALSE`, [qualifiedRefs])).rows[0].n;
  gate = (await client.query(`${ENRICHMENT_READINESS_CTE_V1} SELECT count(*) FILTER (WHERE emb_real AND NOT embed_allowed)::int AS real_but_blocked, count(*) FILTER (WHERE embed_allowed AND emb_placeholder)::int AS allowed_but_placeholder, count(*) FILTER (WHERE embed_allowed)::int AS allowed, count(*) FILTER (WHERE emb_placeholder AND has_summary)::int AS placeholder_with_summary FROM lv WHERE source_ref = ANY($1::text[])`, [qualifiedRefs])).rows[0];
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}
check('embedding: all present ones are 768-dim', emb.wrong_dim === 0, JSON.stringify({ wrong_dim: emb.wrong_dim }));
check('embedding: no zero-norm vectors', emb.zero_norm === 0, JSON.stringify({ zero_norm: emb.zero_norm }));
check('embedding: no NaN norms', emb.nan_norm === 0);
check('qualified row count matches packet rows', emb.rows === qualifiedRefs.length, `${emb.rows}/${qualifiedRefs.length}`);

check('embedding: no single vector shared by >1% of rows (placeholder detector)', dup.largest_identical_group <= Math.max(1, Math.floor(emb.with_embedding * 0.01)), JSON.stringify(dup));

check('gate vs ground truth: no real embedding is blocked by the pre-embedding gate (qualified cohort)', gate.real_but_blocked === 0, JSON.stringify(gate));
check('gate: embed-allowed packets do not already hold the shared placeholder (at most 1 tolerated)', gate.allowed_but_placeholder <= 1, JSON.stringify(gate));

// 4. Blocker registry (derived from measured state; none is fixed here)
const blockers = [];
if (rep.non_legacy_representation_revision === 0) blockers.push({ id: 'REPRESENTATION_REVISION_UNSTAMPED', severity: 'BLOCKS_CANONICAL_MATRIX', evidence: 'representation_revision is legacy 0 on every qualified packet', fixNeeds: 'DB write: stamp a content-addressed representation_revision per embedding version; operator approval required' });
if (rep.som_revision_present === 0) blockers.push({ id: 'SOM_REVISION_ABSENT', severity: 'BLOCKS_SOM_KEYED_BUCKETS', evidence: 'som_revision null on all qualified packets; SOM cells not revision-bound', fixNeeds: 'fresh versioned SOM run writing assignments + revision together (no invented revision)' });
if (rep.embedding_digest_present === 0) blockers.push({ id: 'EMBEDDING_DIGEST_ABSENT', severity: 'BLOCKS_EMBEDDING_REPLAY_PROOF', evidence: 'embedding_digest null on all qualified packets', fixNeeds: 'DB write: compute and store digests (derived from stored vectors)' });
if (dup.largest_identical_group > Math.max(1, Math.floor(emb.with_embedding * 0.01))) blockers.push({ id: 'PLACEHOLDER_EMBEDDING_SHARED', severity: 'BLOCKS_CANONICAL_MATRIX', evidence: `${dup.rows_in_duplicate_groups} packets share identical vectors (largest group ${dup.largest_identical_group}); ${dup.embedding_eligible_false} have embedding_eligible=false. Real embeddings ~= ${emb.distinct_vectors - 1}+ (summarized packets only)`, fixNeeds: 'treat shared-vector rows as embedding-absent (mask) in the matrix; real embeddings require summaries first (writes to generate)' });
const missingVer = emb.with_embedding - emb.with_embedding_version;
if (missingVer > 0) blockers.push({ id: 'EMBEDDING_VERSION_MISSING_ON_SOME', severity: 'MASK_REQUIRED', evidence: `${missingVer} embeddings have no embedding_version`, fixNeeds: 'mask in matrix or backfill version from a proven producer' });
if (emb.non_unit_norm > 0) blockers.push({ id: 'EMBEDDING_NORM_NOT_UNIT', severity: 'NORMALIZE_BEFORE_COSINE', evidence: `${emb.non_unit_norm} vectors outside [0.99,1.01] norm`, fixNeeds: 'L2-normalize in the matrix builder (no stored mutation)' });
const c = (s) => records.filter((r) => r.lineageState === s).length;
if (c('REVISION_HASH_CONFLICT') > 0) blockers.push({ id: 'PACKET_DIGEST_STALE', severity: 'EXCLUDED_FROM_MATRIX', evidence: `${c('REVISION_HASH_CONFLICT')} packets: revision matches disk, packet.sha256 stale (writer current-packet-digest-bridge-v1)`, fixNeeds: 'digest refresh + summary/embedding re-derivation (writes)' });
if (c('REVISION_MISSING') > 0) blockers.push({ id: 'PACKET_REVISION_MISSING', severity: 'EXCLUDED_FROM_MATRIX', evidence: `${c('REVISION_MISSING')} packets without source_revision`, fixNeeds: 'revision stamping from proven admission (writes)' });
if (c('LEGACY_ONLY') + c('IDENTITY_UNRESOLVED') > 0) blockers.push({ id: 'NO_CANONICAL_PACKET', severity: 'COVERAGE_GAP', evidence: `${c('LEGACY_ONLY')} legacy-chunk-only + ${c('IDENTITY_UNRESOLVED')} unresolved identities`, fixNeeds: 'packet creation under the canonical truth flow (writes)' });
if (records.some((r) => String(r.astState).startsWith('NOT_JOINED'))) blockers.push({ id: 'AST_LANE_NOT_JOINED', severity: 'NON_BLOCKING', evidence: 'some records have astState NOT_JOINED_*', fixNeeds: 'run join-ast-state-into-enriched-shards-v1.mjs' });
check('astState joined on every record', records.every((r) => !String(r.astState).startsWith('NOT_JOINED')));

const failed = checks.filter((x) => !x.pass);
const report = {
  schema: 'atlas.enriched-index-smoke-validation.v1', mode: 'READ_ONLY', writesPerformed: false,
  shardManifest: path.relative(REPO_ROOT, path.join(shardRoot, dir, 'manifest.json')), shardRootSha256: manifest.rootSha256,
  status: failed.length === 0 ? 'SMOKE_PASS' : 'SMOKE_FAIL',
  checksRun: checks.length, checksFailed: failed.length, failures: failed, checks,
  embeddingSanity: emb, duplicateEmbeddings: dup, representationState: rep,
  matrixCohort: { qualifiedRows: qualifiedRefs.length, blockedFromCanonicalMatrix: blockers.filter((b) => b.severity === 'BLOCKS_CANONICAL_MATRIX').map((b) => b.id) },
  blockers, canonicalMatrixReady: blockers.every((b) => !b.severity.startsWith('BLOCKS_')),
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/enriched-index-smoke-validation-v1.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, checksRun: report.checksRun, checksFailed: report.checksFailed, failures: failed, embeddingSanity: emb, representationState: rep, canonicalMatrixReady: report.canonicalMatrixReady, blockers: blockers.map((b) => `${b.id} [${b.severity}]`) }, null, 2));
process.exit(failed.length ? 1 : 0);
