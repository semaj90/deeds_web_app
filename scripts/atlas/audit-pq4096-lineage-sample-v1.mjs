#!/usr/bin/env node
/**
 * Bounded, read-only lineage diagnostic for the proposed 64 x 64 PQ corpus.
 * Uses exact source paths and an admitted historical workspace snapshot. A stale
 * source-authority frame keeps every result diagnostic-only; this never writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--') && x.includes('='))
  .map((x) => { const i = x.indexOf('='); return [x.slice(2, i), x.slice(i + 1)]; }));
const live = process.argv.includes('--target=live-read-only');
const revision = args.get('workspace-revision');
const executionId = args.get('execution-id');
const admissionPath = args.get('admission-receipt');
const limit = Number(args.get('limit') ?? 100);
if (!revision || !/^sha256:[a-f0-9]{64}$/i.test(revision)) throw new Error('VALID_WORKSPACE_REVISION_REQUIRED');
if (!executionId || !/^[0-9a-f-]{36}$/i.test(executionId)) throw new Error('VALID_GRAPHIFY_EXECUTION_ID_REQUIRED');
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('LIMIT_MUST_BE_1_TO_500');
if (!admissionPath) throw new Error('ADMISSION_RECEIPT_REQUIRED');
const absoluteAdmissionPath = path.resolve(ROOT, admissionPath);
if (!absoluteAdmissionPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('ADMISSION_RECEIPT_MUST_BE_UNDER_REPOSITORY');
const admission = JSON.parse(fs.readFileSync(absoluteAdmissionPath, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true || admission.workspaceRevision !== revision) {
  throw new Error('ADMITTED_WORKSPACE_RECEIPT_MISMATCH');
}

const env = loadRepoEnv(process.env);
const url = new URL(resolveDatabaseUrl(env));
const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '::1' && url.hostname !== '[::1]') throw new Error('LOOPBACK_DATABASE_REQUIRED');
if (live) {
  if (process.env.ATLAS_ALLOW_LIVE_READ_ONLY !== '1' || dbName !== 'legal_ai_db') throw new Error('LIVE_READ_ONLY_GATE');
} else if (!/^[a-z0-9_]+_scratch$/.test(dbName)) {
  throw new Error('SCRATCH_DATABASE_REQUIRED');
}

const outputArg = args.get('output');
const outputPath = outputArg ? path.resolve(ROOT, outputArg) : path.join(ROOT, '.tmp/atlas', `pq4096-lineage-sample-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
if (!outputPath.startsWith(`${path.resolve(ROOT, '.tmp/atlas')}${path.sep}`)) throw new Error('REPORT_MUST_BE_UNDER_TMP_ATLAS');
if (fs.existsSync(outputPath)) throw new Error('REPORT_ALREADY_EXISTS');

const pool = new pg.Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 60000 });
const client = await pool.connect();
let report;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity = (await client.query(`SELECT current_database() AS database, current_setting('server_version_num')::int AS version_num`)).rows[0];
  if (identity.database !== dbName || Math.floor(Number(identity.version_num) / 10000) !== 18) throw new Error('EXPECTED_POSTGRES_18_TARGET_IDENTITY');
  const result = await client.query(`
    WITH seed AS MATERIALIZED (
      SELECT canonical_source_ref, source_revision::text AS source_revision,
             workspace_revision::text AS workspace_revision,
             lower(regexp_replace(btrim(content_digest::text), '^sha256:', '')) AS content_digest
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND workspace_revision::text = $1
      ORDER BY canonical_source_ref, source_revision
      LIMIT $3
    ), exact_members AS MATERIALIZED (
      SELECT s.*
      FROM seed s
      JOIN public.graphify_execution_file_membership_v2 g
        ON g.execution_id = $2::uuid
       AND g.repository_id = 'repo:root'
       AND g.workspace_revision::text = s.workspace_revision
       AND g.source_ref = s.canonical_source_ref
       AND g.code_source_revision::text = s.source_revision
       AND lower(regexp_replace(btrim(g.content_hash::text), '^sha256:', '')) = s.content_digest
      GROUP BY s.canonical_source_ref, s.source_revision, s.workspace_revision, s.content_digest
      HAVING count(*) = 1
    ), joined AS MATERIALIZED (
      SELECT s.canonical_source_ref, s.source_revision, s.workspace_revision,
             c.id AS chunk_row_id, c.content_embedding_768 IS NOT NULL AS has_vector,
             c.embedding_model, c.representation_revision,
             l.packet_key, l.revision_status,
             p.source_revision::text AS packet_source_revision,
             p.lineage_binding_checksum, p.lineage_producer_revision
      FROM exact_members s
      LEFT JOIN public.codebase_chunk_index c
        ON c.source_ref = s.canonical_source_ref
       AND lower(regexp_replace(btrim(c.file_content_hash::text), '^sha256:', '')) = s.content_digest
      LEFT JOIN public.atlas_packet_chunk_lineage l
        ON l.chunk_row_id = c.id
       AND l.source_ref = s.canonical_source_ref
       AND l.source_revision::text = s.source_revision
       AND l.revision_status = 'PROVEN'
      LEFT JOIN public.atlas_packets p
        ON p.packet_key::text = l.packet_key::text
       AND p.source_ref = s.canonical_source_ref
    )
    SELECT (SELECT count(*)::int FROM seed) AS sampled_bindings,
           (SELECT count(*)::int FROM exact_members) AS graphify_exact_members,
           count(DISTINCT chunk_row_id) FILTER (WHERE has_vector)::int AS vectors_found_by_exact_source_join,
           count(DISTINCT chunk_row_id) FILTER (WHERE has_vector AND embedding_model IS NOT NULL AND representation_revision IS NOT NULL)::int AS vectors_with_model_and_representation_revision,
           count(DISTINCT chunk_row_id) FILTER (WHERE has_vector AND packet_key IS NOT NULL AND revision_status = 'PROVEN')::int AS vectors_with_proven_chunk_lineage,
           count(DISTINCT chunk_row_id) FILTER (WHERE has_vector AND packet_key IS NOT NULL AND revision_status = 'PROVEN'
             AND packet_source_revision = source_revision AND lineage_binding_checksum IS NOT NULL AND lineage_producer_revision IS NOT NULL)::int AS vectors_with_packet_revision_binding,
           count(DISTINCT embedding_model) FILTER (WHERE has_vector)::int AS vector_model_count
    FROM joined
  `, [revision, executionId, limit]);
  await client.query('ROLLBACK');
  const currentFramePath = path.join(ROOT, 'docs/reports/current-workspace-frame-admission-v1.json');
  const currentFrame = fs.existsSync(currentFramePath) ? JSON.parse(fs.readFileSync(currentFramePath, 'utf8')) : null;
  report = {
    schema: 'atlas.pq4096-lineage-sample.v1',
    generatedAt: new Date().toISOString(),
    database: identity.database,
    postgresMajor: Math.floor(Number(identity.version_num) / 10000),
    workspaceRevision: revision,
    executionId,
    sampleLimit: limit,
    admissionReceipt: path.relative(ROOT, absoluteAdmissionPath).replaceAll('\\', '/'),
    currentAuthorityStatus: currentFrame?.status ?? 'NOT_PRESENT',
    currentAuthoritySafeToPromote: currentFrame?.sourceAuthority?.safeToPromote === true,
    counts: Object.fromEntries(Object.entries(result.rows[0]).map(([k, v]) => [k, v == null ? null : Number(v)])),
    exactPathOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    conclusion: currentFrame?.sourceAuthority?.safeToPromote === true
      ? 'DIAGNOSTIC_SAMPLE_REQUIRES_FULL_SNAPSHOT_QUALIFICATION'
      : 'DIAGNOSTIC_ONLY_STALE_OR_UNPROVEN_CURRENT_SOURCE_AUTHORITY',
  };
} finally {
  try { await client.query('ROLLBACK'); } catch { /* transaction already ended */ }
  client.release();
  await pool.end();
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...report, reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/') }, null, 2)}\n`);
