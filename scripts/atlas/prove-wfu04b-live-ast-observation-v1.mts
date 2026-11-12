#!/usr/bin/env node
/** One-source, read-only WFU-04b proof: current source -> real ast-grep -> exact live AST readback. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { extractAstGrepStructuralCandidates } from '../../sveltekit-frontend/src/lib/server/atlas/language/ast-grep-structural-topk.js';
import { adaptAstGrepMatches } from '../../packages/parent-atlas/src/core/ast-grep-observation-adapter.js';
import { resolveAstGrepObservationTreeNodesV1, canonicalAstSourceRefV1 } from '../../packages/parent-atlas/src/core/ast-grep-tree-node-resolution-v1.js';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const args = new Map(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=');
  return index > 0 ? [arg.slice(0, index), arg.slice(index + 1)] : [arg, true];
}));
const required = (name: string) => {
  const value = args.get(name);
  if (typeof value !== 'string' || !value) throw new Error(`REQUIRED_ARGUMENT:${name}`);
  return value;
};
const workspaceRevision = required('--workspace-revision');
const executionId = required('--execution-id');
const membershipChecksum = required('--membership-checksum');
const repairRoot = required('--repair-root-sha256');
const reportArg = required('--report-out');
const sourceRef = 'sveltekit-frontend/src/lib/agent/tool-manifest.ts';
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision)) throw new Error('INVALID_WORKSPACE_REVISION');
if (!/^[0-9a-f-]{36}$/.test(executionId)) throw new Error('INVALID_EXECUTION_ID');
if (!/^sha256:[0-9a-f]{64}$/.test(membershipChecksum)) throw new Error('INVALID_MEMBERSHIP_CHECKSUM');
if (!/^[0-9a-f]{64}$/.test(repairRoot)) throw new Error('INVALID_REPAIR_ROOT');

const outputPath = path.resolve(root, reportArg);
const tmpRoot = path.resolve(root, '.tmp/atlas');
const outputRelative = path.relative(tmpRoot, outputPath);
if (!outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) throw new Error('REPORT_MUST_BE_UNDER_TMP_ATLAS');
if (fs.existsSync(outputPath)) throw new Error('REPORT_ALREADY_EXISTS');

const scope = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-workspace-lineage-scope-closure-v1.json'), 'utf8'));
const cohort = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-source-authority-cohort-v1.json'), 'utf8'));
if (scope.scope?.workspaceRevision !== workspaceRevision
  || scope.scope?.executionId !== executionId
  || scope.scope?.v2SourceMembership?.checksum !== membershipChecksum
  || scope.scope?.appliedPacketRepair?.manifestRootSha256 !== repairRoot) throw new Error('CURRENT_WORKSPACE_SCOPE_MISMATCH');
if (cohort.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN' || cohort.workspaceRevision !== workspaceRevision) throw new Error('CURRENT_SOURCE_COHORT_NOT_ADMITTED');
const workspaceId = String(cohort.workspaceId ?? '');
if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error('WORKSPACE_ID_MISSING');

const sourcePath = path.resolve(root, sourceRef);
const relativeSourcePath = path.relative(root, sourcePath);
if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) throw new Error('SOURCE_PATH_OUTSIDE_REPOSITORY');
const sourceBytes = fs.readFileSync(sourcePath);
const sourceText = sourceBytes.toString('utf8');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const sourceDigest = sourceRevision.slice('sha256:'.length);
const sourceRefForJoin = canonicalAstSourceRefV1(sourceRef);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
const client = await pool.connect();
let membership: any;
let astRows: any[] = [];
let databaseIdentity: any;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity = await client.query(`SELECT current_database() AS database_name, current_setting('server_version_num')::int AS server_version_num`);
  databaseIdentity = identity.rows[0];
  if (databaseIdentity.database_name !== 'legal_ai_db') throw new Error(`UNEXPECTED_DATABASE:${databaseIdentity.database_name}`);
  if (Number(databaseIdentity.server_version_num) < 180000 || Number(databaseIdentity.server_version_num) >= 190000) throw new Error('POSTGRESQL_18_REQUIRED');

  const memberResult = await client.query(`
    SELECT repository_relative_path, source_ref, lower(code_source_revision) AS source_revision,
           lower(content_hash) AS content_hash
    FROM public.graphify_execution_file_membership_v2
    WHERE execution_id = $1::uuid AND workspace_revision::text = $2
      AND repository_id = 'repo:root' AND source_ref = $3
  `, [executionId, workspaceRevision, sourceRef]);
  if (memberResult.rowCount !== 1) throw new Error(`MEMBERSHIP_NOT_UNIQUE:${memberResult.rowCount}`);
  membership = memberResult.rows[0];
  const membershipDigest = String(membership.content_hash ?? '').replace(/^sha256:/i, '');
  if (membership.source_revision !== sourceRevision.toLowerCase() || membershipDigest !== sourceDigest) {
    throw new Error(`LOCAL_SOURCE_DOES_NOT_MATCH_ADMITTED_MEMBERSHIP:revisionMatch=${membership.source_revision === sourceRevision.toLowerCase()}:contentHashMatch=${membershipDigest === sourceDigest}`);
  }
  const astResult = await client.query(`
    SELECT tree_node_id, relative_path, lower(source_revision) AS source_revision,
           lower(source_content_hash) AS source_content_hash, start_byte, end_byte,
           workspace_id::text AS workspace_id
    FROM public.atlas_ast_nodes
    WHERE workspace_id = $1
      AND lower(regexp_replace(regexp_replace(btrim(relative_path), '\\\\', '/', 'g'), '^\\./', '')) = lower($2)
      AND lower(source_revision) = lower($3)
      AND lower(source_content_hash) = lower($4)
    ORDER BY start_byte, end_byte, tree_node_id
  `, [workspaceId, sourceRefForJoin, sourceRevision, sourceDigest]);
  astRows = astResult.rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}

const candidates = await extractAstGrepStructuralCandidates({
  schema: 'atlas.ast-grep-structural-extraction-input.v1',
  code: sourceText,
  filePath: sourceRef,
  sourceRef,
  language: 'TYPESCRIPT',
  workspaceRevision,
  sourceRevision,
  producerRevision: 'atlas.wfu04b-live-ast-observation.v1',
});
const observations = adaptAstGrepMatches({
  source_ref: sourceRef,
  source_revision: sourceRevision,
  extractor_revision: '@ast-grep/napi:current-installed',
  chunks: [],
  matches: candidates.map((candidate) => ({
    rule_id: `atlas.ast-grep-structural:${candidate.nodeKind}`,
    text: sourceBytes.subarray(candidate.startByte, candidate.endByte).toString('utf8'),
    byte_start: candidate.startByte,
    byte_end: candidate.endByte,
    observation_kind: candidate.entityKind,
    captures: { name: candidate.name, syntax_kind: candidate.nodeKind },
    confidence: 1,
  })),
});
const resolverCandidates = astRows.map((row) => ({
  treeNodeId: row.tree_node_id,
  sourceRef: row.relative_path,
  sourceRevision: row.source_revision,
  startByte: Number(row.start_byte),
  endByte: Number(row.end_byte),
}));
const resolutions = resolveAstGrepObservationTreeNodesV1({ observations, candidates: resolverCandidates, admitContainment: true });
const resolved = resolutions.filter((row) => row.status === 'RESOLVED');

let independentReadback: any = { status: 'NOT_RUN' };
if (resolved.length > 0) {
  const verifyPool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  const verifyClient = await verifyPool.connect();
  try {
    await verifyClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const verifyIdentity = await verifyClient.query(`SELECT current_database() AS database_name`);
    if (verifyIdentity.rows[0]?.database_name !== 'legal_ai_db') throw new Error('READBACK_DATABASE_MISMATCH');
    const ids = resolved.map((row) => row.treeNodeId);
    const readback = await verifyClient.query(`
      SELECT tree_node_id, lower(regexp_replace(regexp_replace(btrim(relative_path), '\\\\', '/', 'g'), '^\\./', '')) AS relative_path,
             lower(source_revision) AS source_revision, lower(source_content_hash) AS source_content_hash,
             start_byte, end_byte, workspace_id::text AS workspace_id
      FROM public.atlas_ast_nodes
      WHERE tree_node_id = ANY($1::text[]) AND workspace_id = $2
        AND lower(source_revision) = lower($3) AND lower(source_content_hash) = lower($4)
    `, [ids, workspaceId, sourceRevision, sourceDigest]);
    const got = new Map(readback.rows.map((row: any) => [row.tree_node_id, row]));
    const mismatches = resolved.filter((result) => {
      const row: any = got.get(result.treeNodeId!);
      const obs = observations.find((item) => item.observation_id === result.observationId)!;
      return !row || canonicalAstSourceRefV1(row.relative_path) !== canonicalAstSourceRefV1(sourceRef)
        || row.source_revision !== sourceRevision.toLowerCase()
        || String(row.source_content_hash).replace(/^sha256:/i, '') !== sourceDigest
        || row.start_byte > obs.byte_start || row.end_byte < obs.byte_end;
    }).map((row) => row.observationId);
    independentReadback = {
      status: mismatches.length === 0 ? 'MATCH' : 'MISMATCH', rows: readback.rowCount, resolvedCount: resolved.length,
      mismatchedObservationIds: mismatches,
      mismatchDetails: mismatches.slice(0, 5).map((id) => {
        const result = resolved.find((item) => item.observationId === id)!;
        const row: any = got.get(result.treeNodeId!);
        const obs = observations.find((item) => item.observation_id === id)!;
        return { observationId: id, treeNodeId: result.treeNodeId, rowFound: Boolean(row), pathMatch: row ? canonicalAstSourceRefV1(row.relative_path) === canonicalAstSourceRefV1(sourceRef) : false, revisionMatch: row?.source_revision === sourceRevision.toLowerCase(), contentHashMatch: row ? String(row.source_content_hash).replace(/^sha256:/i, '') === sourceDigest : false, containsSpan: row ? Number(row.start_byte) <= obs.byte_start && Number(row.end_byte) >= obs.byte_end : false };
      }),
    };
    await verifyClient.query('ROLLBACK');
  } catch (error) {
    try { await verifyClient.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    verifyClient.release();
    await verifyPool.end();
  }
}

const reportBody = {
  schema: 'atlas.wfu04b-live-ast-observation-proof.v1',
  generatedAt: new Date().toISOString(),
  status: resolved.length > 0 && independentReadback.status === 'MATCH' ? 'PASS_ONE_SOURCE_LIVE_READBACK' : 'BLOCKED_NO_RESOLVED_LIVE_AST_OBSERVATION',
  scope: { sourceRef, sourceRevision, workspaceId, workspaceRevision, executionId, membershipChecksum, repairRoot },
  database: { ...databaseIdentity, transactionMode: 'REPEATABLE READ READ ONLY', writesPerformed: false },
  membership: { repositoryRelativePath: membership.repository_relative_path, sourceRevision: membership.source_revision, contentHash: membership.content_hash, localBytesSha256: sourceRevision },
  astGrep: { extractor: '@ast-grep/napi', language: 'TYPESCRIPT', candidateCount: candidates.length, observationCount: observations.length, observationIds: observations.map((row) => row.observation_id) },
  liveAstCandidates: { count: astRows.length, sourceRefPolicy: 'exact normalized relative_path; workspace, source_revision, and source_content_hash all match' },
  resolutions,
  independentReadback,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  promotionAuthorized: false,
};
const report = { ...reportBody, checksum: createHash('sha256').update(JSON.stringify(reportBody)).digest('hex') };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
if (readback.checksum !== report.checksum || JSON.stringify(readback) !== JSON.stringify(report)) throw new Error('REPORT_READBACK_MISMATCH');
console.log(JSON.stringify({ status: readback.status, sourceRef, candidateCount: candidates.length, astNodeCount: astRows.length, resolvedCount: resolved.length, independentReadback, reportPath: path.relative(root, outputPath).replaceAll('\\', '/') }, null, 2));
