#!/usr/bin/env node

/** Read-only, exact-scope AST/source lineage audit. No Graphify or datastore writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyCurrentAstSourceV1 } from './lib/current-workspace-ast-classification-v1.mjs';
import { classifyFileCapabilityV1, CAPABILITY_OUTCOMES_V1 } from './lib/current-file-capability-classification-v1.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const expectedMembershipChecksum = arg('--membership-checksum');
const repairRoot = arg('--repair-root-sha256');
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_WORKSPACE_REVISION_REQUIRED');
if (!/^[0-9a-f-]{36}$/.test(executionId ?? '')) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
if (!/^sha256:[0-9a-f]{64}$/.test(expectedMembershipChecksum ?? '')) throw new Error('EXPLICIT_MEMBERSHIP_CHECKSUM_REQUIRED');
if (!/^[0-9a-f]{64}$/.test(repairRoot ?? '')) throw new Error('EXPLICIT_REPAIR_ROOT_SHA256_REQUIRED');

const reports = path.join(REPO_ROOT, 'docs/reports');
const scope = JSON.parse(fs.readFileSync(path.join(reports, 'current-workspace-lineage-scope-closure-v1.json'), 'utf8'));
const cohort = JSON.parse(fs.readFileSync(path.join(reports, 'current-source-authority-cohort-v1.json'), 'utf8'));
const exactScope = scope.scope?.workspaceRevision === workspaceRevision
  && scope.scope?.executionId === executionId
  && scope.scope?.v2SourceMembership?.checksum === expectedMembershipChecksum
  && scope.scope?.appliedPacketRepair?.manifestRootSha256 === repairRoot;
if (!exactScope) throw new Error('CURRENT_WORKSPACE_SCOPE_RECEIPT_MISMATCH');
if (cohort.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN' || cohort.workspaceRevision !== workspaceRevision) throw new Error('CURRENT_SOURCE_COHORT_NOT_ADMITTED_FOR_SCOPE');
const workspaceId = cohort.workspaceId;
if (!/^[0-9a-f-]{36}$/i.test(workspaceId ?? '')) throw new Error('CANONICAL_WORKSPACE_ID_MISSING');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
let rows; let membership; let observedProducers;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const membershipResult = await client.query(`
    SELECT count(*)::integer AS rows,
           count(*) FILTER (WHERE repository_id = 'repo:root')::integer AS "repoRootRows",
           'sha256:' || encode(sha256(convert_to(string_agg(concat_ws('|', repository_id, source_ref, lower(code_source_revision::text), lower(content_hash::text)), E'\\n' ORDER BY repository_id, source_ref), 'UTF8')), 'hex') AS checksum
    FROM public.graphify_execution_file_membership_v2
    WHERE execution_id = $1::uuid AND workspace_revision::text = $2`, [executionId, workspaceRevision]);
  membership = membershipResult.rows[0];
  if (Number(membership.rows) !== Number(scope.scope.v2SourceMembership.rows) || membership.checksum !== expectedMembershipChecksum) throw new Error('LIVE_MEMBERSHIP_CHECKSUM_MISMATCH');

  const result = await client.query(`
    WITH m AS (
      SELECT repository_id, repository_relative_path, source_ref,
             lower(code_source_revision) AS source_revision, lower(content_hash) AS content_hash
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND repository_id = 'repo:root'
    ), a AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(relative_path), '\\\\', '/', 'g'), '^\\./', '')) AS relative_path,
             workspace_id, lower(source_revision) AS source_revision, lower(source_content_hash) AS source_content_hash
      FROM public.atlas_ast_nodes
    ), candidates AS (
      SELECT m.source_ref, m.source_revision AS admitted_revision, m.content_hash AS admitted_content_hash,
             a.relative_path AS ast_candidate_path, a.workspace_id,
             a.source_revision AS ast_revision, a.source_content_hash AS ast_content_hash
      FROM m LEFT JOIN a
        ON a.relative_path = lower(regexp_replace(m.repository_relative_path, '^sveltekit-frontend/', ''))
    ), per_source AS (
      SELECT source_ref, admitted_revision, admitted_content_hash,
             count(ast_candidate_path)::integer AS ast_rows,
             bool_or(workspace_id = $3) AS workspace_match,
             bool_or(workspace_id IS NOT NULL AND workspace_id <> $3) AS workspace_mismatch,
             bool_or(ast_candidate_path IS NOT NULL AND workspace_id IS NULL) AS workspace_binding_missing,
             bool_or(ast_revision IS NULL AND (workspace_id IS NOT NULL OR ast_content_hash IS NOT NULL)) AS revision_missing,
             bool_or(ast_revision = admitted_revision) AS revision_match,
             bool_or(ast_revision = admitted_revision AND ast_content_hash = admitted_content_hash) AS content_hash_match,
             bool_or(ast_revision IS NOT NULL AND ast_revision <> admitted_revision) AS has_other_revision
      FROM candidates GROUP BY source_ref, admitted_revision, admitted_content_hash
    )
    SELECT source_ref, ast_rows, coalesce(workspace_match, false) AS workspace_match,
           coalesce(workspace_mismatch, false) AS workspace_mismatch,
           coalesce(workspace_binding_missing, false) AS workspace_binding_missing,
           coalesce(revision_missing, false) AS revision_missing,
           coalesce(revision_match, false) AS revision_match,
           coalesce(content_hash_match, false) AS content_hash_match,
           coalesce(has_other_revision, false) AS has_other_revision
    FROM per_source ORDER BY source_ref`, [executionId, workspaceRevision, workspaceId]);
  rows = result.rows.map((row) => ({
    ...row,
    classification: classifyCurrentAstSourceV1({
      astRows: Number(row.ast_rows), workspaceMatch: row.workspace_match,
      workspaceMismatch: row.workspace_mismatch, workspaceBindingMissing: row.workspace_binding_missing,
      revisionMissing: row.revision_missing, revisionMatch: row.revision_match,
      contentHashMatch: row.content_hash_match, hasOtherRevision: row.has_other_revision,
    }),
  }));
  const producerResult = await client.query(`
    WITH m AS (
      SELECT DISTINCT lower(regexp_replace(repository_relative_path, '^sveltekit-frontend/', '')) AS p
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND repository_id = 'repo:root'
    )
    SELECT a.parser_name, a.parser_version, a.grammar_version, a.parser_language, count(DISTINCT m.p)::integer AS sources
    FROM m JOIN public.atlas_ast_nodes a
      ON lower(regexp_replace(replace(btrim(a.relative_path), chr(92), '/'), '^[.]/', '')) = m.p
    GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC`, [executionId, workspaceRevision]);
  observedProducers = producerResult.rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}

const classes = Object.fromEntries([...new Set(rows.map((row) => row.classification))].sort().map((name) => [name, rows.filter((row) => row.classification === name).length]));
for (const name of ['AST_REVISION_QUALIFIED','AST_REVISION_MISSING','AST_SOURCE_MISMATCH','AST_WORKSPACE_MISMATCH','AST_EVIDENCE_ABSENT','AST_STALE_OTHER_REVISION','AST_WORKSPACE_BINDING_MISSING']) classes[name] ??= 0;
const classifiedSources = Object.values(classes).reduce((sum, count) => sum + count, 0);
const astObservedSources = rows.filter((row) => row.ast_rows > 0).length;
const revisionQualifiedSources = classes.AST_REVISION_QUALIFIED;
const capabilityRows = rows.map((row) => ({ row, cap: classifyFileCapabilityV1({ sourceRef: row.source_ref, lineageClass: row.classification }) }));
const capabilityOutcomes = Object.fromEntries(CAPABILITY_OUTCOMES_V1.map((name) => [name, capabilityRows.filter((c) => c.cap.outcome === name).length]));
const reasonsByOutcome = {};
for (const { cap } of capabilityRows) if (cap.reason) { const b = (reasonsByOutcome[cap.outcome] ??= {}); b[cap.reason] = (b[cap.reason] ?? 0) + 1; }
const eligibleIdentities = capabilityRows.filter((c) => c.cap.language).length;
const capabilityCensus = {
  schema: 'atlas.current-file-analysis-capability-census.v1', derivedOnly: true, identityOwner: false,
  denominator: { membershipRowsRepoRoot: Number(membership.repoRootRows), distinctSourceIdentities: rows.length, duplicateMembershipRows: Number(membership.repoRootRows) - rows.length },
  outcomes: capabilityOutcomes,
  outcomesReconcile: Object.values(capabilityOutcomes).reduce((s, n) => s + n, 0) === rows.length,
  reasonsByOutcome,
  astEligibleWithWiredProvider: eligibleIdentities,
  revisionQualifiedOfWiredEligible: capabilityOutcomes.REVISION_QUALIFIED_AST,
  notMeasured: { TRAVERSED_PARSE_FAILED: 'no parse-failure ledger consulted', SYMBOL_RESOLVED: 'symbol resolution not joined in this audit' },
  providers: {
    wiredProviderLanguages: ['typescript', 'tsx', 'javascript', 'jsx'],
    wiredProviderOwner: 'node-tree-sitter-ast-provider.ts',
    note: 'Eligibility above follows the wired provider only; observedProducers shows which producers actually wrote atlas_ast_nodes rows for this cohort, including legacy chunk-index-v1 rows for svelte/sql/json/proto and extractor rows for md/json.',
  },
  observedProducers: observedProducers.map((p) => ({ parserName: p.parser_name, parserVersion: p.parser_version, grammarVersion: p.grammar_version, parserLanguage: p.parser_language, distinctSources: p.sources })),
};
const report = {
  schema: 'atlas.current-workspace-ast-lineage.v1', mode: 'READ_ONLY', writesPerformed: false, graphifyRun: false,
  supersedes: [
    'current-workspace-ast-lineage-v1-9f68bf6c11a87807.json',
    'current-workspace-ast-lineage-v1-fede11c6dc0b8cfa.json',
    'current-workspace-ast-lineage-v1-4c8e8e8ca950cb6f.json',
    'current-workspace-ast-lineage-v1-7769e7076aa61f15.json',
  ],
  scope: { repositoryId: 'repo:root', workspaceId, workspaceRevision, executionId, v2MembershipChecksum: expectedMembershipChecksum, packetRepairRoot: repairRoot },
  identityJoin: { candidateKey: 'exact normalized repository_relative_path to atlas_ast_nodes.relative_path', rootTransform: 'strip the one leading sveltekit-frontend/ segment from the membership repository-relative path', canonicalQualificationAlsoRequires: ['workspace_id exact match','source_revision exact match','source_content_hash equals membership content_hash'], fuzzyOrPrefixMatchUsed: false, sourceRefAloneUsed: false },
  denominators: {
    currentSourcePopulation: rows.length,
    astObservedPopulation: astObservedSources,
    revisionQualifiedAstPopulation: revisionQualifiedSources,
    missingAstEvidence: classes.AST_EVIDENCE_ABSENT,
    staleOrWrongRevisionAstEvidence: classes.AST_STALE_OTHER_REVISION + classes.AST_SOURCE_MISMATCH,
    observedSourcesMissingWorkspaceBinding: rows.filter((row) => row.ast_rows > 0 && row.workspace_binding_missing).length,
    observedSourcesMissingAstRevision: rows.filter((row) => row.ast_rows > 0 && row.revision_missing).length,
    allSourcesClassifiedExactlyOnce: classifiedSources === rows.length,
    classifiedSources,
  },
  classifications: classes,
  capabilityCensus,
  gate: { name: 'CURRENT_WORKSPACE_LINEAGE', status: revisionQualifiedSources > 0 && classes.AST_EVIDENCE_ABSENT === 0 && classes.AST_REVISION_MISSING === 0 && classes.AST_SOURCE_MISMATCH === 0 && classes.AST_WORKSPACE_MISMATCH === 0 && classes.AST_STALE_OTHER_REVISION === 0 && classes.AST_WORKSPACE_BINDING_MISSING === 0 ? 'CURRENT_WORKSPACE_LINEAGE_PROVEN' : 'BLOCKED', blocker: revisionQualifiedSources === 0 ? 'CURRENT_AST_EVIDENCE_MISSING' : 'CURRENT_AST_EVIDENCE_INCOMPLETE_OR_UNBOUND' },
  generatedAt: new Date().toISOString(),
};
const canonicalReport = JSON.stringify(report, null, 2) + '\n';
const reportDigest = crypto.createHash('sha256').update(canonicalReport).digest('hex');
report.reportSha256 = reportDigest;
const emitRows = arg('--emit-rows');
if (emitRows) fs.writeFileSync(path.resolve(REPO_ROOT, emitRows), capabilityRows.map(({ row, cap }) => JSON.stringify({ sourceRef: row.source_ref, lineageClass: row.classification, capabilityOutcome: cap.outcome, language: cap.language })).join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
const outPath = path.join(reports, `current-workspace-ast-lineage-v1-${reportDigest.slice(0, 16)}.json`);
if (fs.existsSync(outPath)) throw new Error(`IMMUTABLE_REPORT_ALREADY_EXISTS:${path.basename(outPath)}`);
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath: path.relative(REPO_ROOT, outPath), scope: report.scope, denominators: report.denominators, classifications: report.classifications, capabilityCensus: report.capabilityCensus, gate: report.gate }, null, 2));
