#!/usr/bin/env node

/**
 * Read-only plan for reconciling the current Graphify source cohort with the
 * stable atlas_source_refs registry. This script never inserts registry or
 * workspace-binding rows.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
};
const selectionPath = resolve(ROOT, option('--selection') ?? 'docs/reports/current-source-selection-input-v1.json');
const reportPath = resolve(ROOT, option('--report') ?? 'docs/reports/current-source-registry-reconciliation-plan-v1.json');
const sourceRefFilter = option('--source-ref');
const completeCohort = process.argv.includes('--complete');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
// Keep the planner bounded, but allow the current execution-owned cohort to
// advance beyond the historical 111-row canary without enabling writes.
const limit = Math.max(1, Math.min(500, Number(limitArg?.split('=')[1] ?? 500)));
if (completeCohort && sourceRefFilter) throw new Error('COMPLETE_COHORT_CANNOT_USE_SOURCE_REF_FILTER');

const text = (value) => {
  const valueText = String(value ?? '').trim().replaceAll('\\', '/');
  return valueText || null;
};

const checksum = (rows) => createHash('sha256')
  .update(rows.map((row) => `${row.repoId}:${row.sourceRefKey}:${row.contentHash}:${row.sourceRevision}:${row.workspaceRevision}`).join('\n'), 'utf8')
  .digest('hex');

const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
const currentSnapshotPlan = selection.status === 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED'
  && selection.authority === false
  && selection.writesPerformed === false
  && /^sha256:[0-9a-f]{64}$/i.test(selection.workspaceRevisionCandidate ?? '');
const legacySelection = selection.status === 'CURRENT_SNAPSHOT_PROVEN'
  && selection.canonicalAuthority === false
  && selection.readOnly === true
  && selection.writesPerformed === false;
if ((!currentSnapshotPlan && !legacySelection) || !Array.isArray(selection.bindings)) {
  throw new Error('CURRENT_SOURCE_SELECTION_INPUT_NOT_PROVEN');
}
const sourceRows = currentSnapshotPlan
  ? selection.bindings.filter((row) => row.repositoryId === 'repo:root')
  : selection.bindings;
const filteredRows = sourceRefFilter
  ? sourceRows.filter((row) => text(currentSnapshotPlan ? row.sourceRef : row.source_ref) === text(sourceRefFilter))
  : sourceRows;
const orderedRows = filteredRows
  .sort((a, b) => String(currentSnapshotPlan ? a.sourceRef : a.source_ref).localeCompare(String(currentSnapshotPlan ? b.sourceRef : b.source_ref)))
  .map((row) => ({
    repoId: 'deeds-web-app',
    sourceRefKey: text(currentSnapshotPlan ? row.sourceRef : row.source_ref),
    relativePath: text(currentSnapshotPlan ? row.sourceRef : row.source_ref),
    sourceType: currentSnapshotPlan ? null : 'code',
    contentHash: text(currentSnapshotPlan ? row.contentHash : row.content_hash),
    sourceRevision: text(currentSnapshotPlan ? row.codeSourceRevision : row.code_source_revision),
    workspaceRevision: currentSnapshotPlan ? null : text(row.workspace_revision),
    byteLength: Number(currentSnapshotPlan ? row.byteLength : row.byte_length),
  }));
const plannedRows = completeCohort ? orderedRows : orderedRows.slice(0, limit);

if (plannedRows.some((row) => !row.sourceRefKey || !/^[0-9a-f]{64}$/i.test(row.contentHash ?? '')
  || !/^sha256:[0-9a-f]{64}$/i.test(row.sourceRevision ?? '')
  || (!currentSnapshotPlan && !/^sha256:[0-9a-f]{64}$/i.test(row.workspaceRevision ?? ''))
  || !Number.isInteger(row.byteLength) || row.byteLength < 0)) {
  throw new Error('CURRENT_SOURCE_REGISTRY_PLAN_INVALID_INPUT');
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let registryRows = [];
let normalizedRegistryRows = [];
let databaseError = null;
let readSnapshotIsolation = null;
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  readSnapshotIsolation = 'REPEATABLE_READ_READ_ONLY';
  for (let offset = 0; offset < plannedRows.length; offset += limit) {
    const page = plannedRows.slice(offset, offset + limit);
    const result = await client.query(
      'select source_ref_key, repo_id, source_type, relative_path, content_hash, commit_sha, corpus_version from public.atlas_source_refs where repo_id = $1 and source_ref_key = any($2::text[]) order by source_ref_key',
      ['deeds-web-app', page.map((row) => row.sourceRefKey)],
    );
    registryRows.push(...result.rows);
  }
  const exactKeys = new Set(registryRows.map((row) => `${row.repo_id}:${row.source_ref_key}`));
  const missingKeys = plannedRows
    .filter((row) => !exactKeys.has(`${row.repoId}:${row.sourceRefKey}`))
    .map((row) => row.sourceRefKey.toLowerCase());
  for (let offset = 0; offset < missingKeys.length; offset += limit) {
    const page = missingKeys.slice(offset, offset + limit);
    const result = await client.query(
      `select source_ref_key, repo_id, source_type, relative_path, content_hash, commit_sha, corpus_version
       from public.atlas_source_refs
       where repo_id = $1
         and lower(regexp_replace(regexp_replace(btrim(source_ref_key), '\\\\', '/', 'g'), '^\\./', '')) = any($2::text[])
       order by source_ref_key`,
      ['deeds-web-app', page],
    );
    normalizedRegistryRows.push(...result.rows);
  }
  await client.query('ROLLBACK');
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  try { await client.query('ROLLBACK'); } catch {}
} finally {
  client.release();
  await pool.end();
}

const registryByKey = new Map();
for (const registryRow of registryRows) {
  const key = `${registryRow.repo_id}:${registryRow.source_ref_key}`;
  const matches = registryByKey.get(key) ?? [];
  matches.push(registryRow);
  registryByKey.set(key, matches);
}
const registryByNormalizedPath = new Map();
for (const registryRow of normalizedRegistryRows) {
  const normalizedPath = String(registryRow.source_ref_key ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
  const matches = registryByNormalizedPath.get(normalizedPath) ?? [];
  matches.push(registryRow);
  registryByNormalizedPath.set(normalizedPath, matches);
}
const rows = plannedRows.map((row) => {
  const matchingRows = registryByKey.get(`${row.repoId}:${row.sourceRefKey}`) ?? [];
  const normalizedMatches = registryByNormalizedPath.get(row.sourceRefKey.toLowerCase()) ?? [];
  const existing = matchingRows.length === 1 ? matchingRows[0] : null;
  return {
    ...row,
    registryPresent: matchingRows.length > 0,
    registryAmbiguous: matchingRows.length > 1,
    normalizedPathCandidateCount: matchingRows.length === 0 ? normalizedMatches.length : 0,
    normalizedPathCandidates: matchingRows.length === 0
      ? normalizedMatches.map((candidate) => ({ sourceRefKey: candidate.source_ref_key, contentHash: candidate.content_hash, sourceType: candidate.source_type }))
      : [],
    sourceTypeObserved: existing?.source_type ?? null,
    sourceTypeMappingStatus: currentSnapshotPlan && !existing ? 'UNRESOLVED_REQUIRES_OWNER_REVIEW' : 'NOT_PROPOSED',
    registryContentHash: existing?.content_hash ?? null,
    registryCommitSha: existing?.commit_sha ?? null,
    registryCorpusVersion: existing?.corpus_version ?? null,
    registryDigestMatches: existing?.content_hash != null
      && String(existing.content_hash).replace(/^sha256:/i, '').toLowerCase() === String(row.contentHash).replace(/^sha256:/i, '').toLowerCase(),
    relativePathMatches: existing?.relative_path != null && text(existing.relative_path) === row.relativePath,
    classification: matchingRows.length > 1 ? 'REGISTRY_IDENTITY_AMBIGUOUS'
      : matchingRows.length === 0 && normalizedMatches.length > 1 ? 'NORMALIZED_PATH_AMBIGUOUS_REQUIRES_REVIEW'
        : matchingRows.length === 0 && normalizedMatches.length === 1 ? 'NORMALIZED_PATH_CANDIDATE_REQUIRES_REVIEW'
          : matchingRows.length === 0 ? 'REGISTRY_REFERENCE_MISSING'
      : existing.content_hash == null ? 'REGISTERED_DIGEST_UNAVAILABLE'
        : String(existing.content_hash).replace(/^sha256:/i, '').toLowerCase() !== String(row.contentHash).replace(/^sha256:/i, '').toLowerCase()
          ? 'REGISTERED_DIGEST_MISMATCH'
          : existing.relative_path == null || text(existing.relative_path) !== row.relativePath
            ? 'REGISTERED_PATH_MISMATCH' : 'REGISTERED_EXACT_DIGEST_AND_PATH',
  };
});

const missing = rows.filter((row) => !row.registryPresent);
const report = {
  schema: 'atlas.current-source-registry-reconciliation-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PLAN',
  readOnly: true,
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  sourcePlan: selectionPath,
  sourceSelectionStatus: selection.status,
  sourceSelectionSnapshotRevision: selection.snapshotRevision ?? null,
  workspaceRevision: currentSnapshotPlan ? null : selection.workspaceRevision ?? null,
  workspaceRevisionCandidate: currentSnapshotPlan ? selection.workspaceRevisionCandidate : null,
  canonicalAuthority: false,
  proposalOnly: true,
  sourceSelectionExecutionId: selection.executionId ?? null,
  sourceSelectionSnapshotRevision: selection.snapshotRevision ?? null,
  sourceSelectionChecksum: selection.sourceSelectionChecksum ?? selection.sourceRefSetChecksum ?? null,
  requestedLimit: limit,
  completeCohortRequested: completeCohort,
  readSnapshotIsolation,
  eligibleSourceCount: orderedRows.length,
  selectedSourceCount: rows.length,
  registryMatchCount: registryRows.length,
  registryUniqueKeyCount: registryByKey.size,
  registryMissingCount: missing.length,
  normalizedPathCandidateCount: rows.filter((row) => row.classification === 'NORMALIZED_PATH_CANDIDATE_REQUIRES_REVIEW').length,
  normalizedPathAmbiguousCount: rows.filter((row) => row.classification === 'NORMALIZED_PATH_AMBIGUOUS_REQUIRES_REVIEW').length,
  registryReferenceAbsentCount: rows.filter((row) => row.classification === 'REGISTRY_REFERENCE_MISSING').length,
  registryAmbiguousCount: rows.filter((row) => row.registryAmbiguous).length,
  registryExactDigestAndPathCount: rows.filter((row) => row.classification === 'REGISTERED_EXACT_DIGEST_AND_PATH').length,
  registryDigestMismatchCount: rows.filter((row) => row.classification === 'REGISTERED_DIGEST_MISMATCH').length,
  registryPathMismatchCount: rows.filter((row) => row.classification === 'REGISTERED_PATH_MISMATCH').length,
  registryDigestUnavailableCount: rows.filter((row) => row.classification === 'REGISTERED_DIGEST_UNAVAILABLE').length,
  selectionChecksum: checksum(plannedRows),
  foreignKeyTarget: 'public.atlas_source_refs(repo_id, source_ref_key)',
  policy: {
    insertRegistryRows: false,
    insertWorkspaceBindings: false,
    allowNormalizedOnly: false,
    allowAmbiguous: false,
    requireExplicitApproval: true,
  },
  databaseError,
  status: databaseError ? 'REGISTRY_RECONCILIATION_DATABASE_ERROR'
    : rows.length === 0 ? 'REGISTRY_RECONCILIATION_EMPTY'
      : currentSnapshotPlan ? 'REGISTRY_RECONCILIATION_PLAN_READY_NOT_ADMITTED'
        : 'REGISTRY_RECONCILIATION_PLAN_READY',
  nextGate: databaseError ? 'DATABASE_READ_RETRY'
    : currentSnapshotPlan && missing.length ? 'SOURCE_TYPE_REVIEW_AND_EXPLICIT_REGISTRY_APPROVAL'
      : currentSnapshotPlan ? 'WORKSPACE_REVISION_ADMISSION_AND_BINDING_OWNER'
        : missing.length ? 'EXPLICIT_REGISTRY_INSERT_APPROVAL_AND_BOUNDED_READBACK'
          : 'WORKSPACE_BINDING_PLAN',
  rows,
};
mkdirSync(dirname(reportPath), { recursive: true });
const reportTemp = `${reportPath}.${process.pid}.tmp`;
writeFileSync(reportTemp, `${JSON.stringify(report, null, 2)}\n`);
renameSync(reportTemp, reportPath);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  selectedSourceCount: report.selectedSourceCount,
  eligibleSourceCount: report.eligibleSourceCount,
  registryMatchCount: report.registryMatchCount,
  registryUniqueKeyCount: report.registryUniqueKeyCount,
  registryMissingCount: report.registryMissingCount,
  normalizedPathCandidateCount: report.normalizedPathCandidateCount,
  normalizedPathAmbiguousCount: report.normalizedPathAmbiguousCount,
  registryReferenceAbsentCount: report.registryReferenceAbsentCount,
  registryAmbiguousCount: report.registryAmbiguousCount,
  registryExactDigestAndPathCount: report.registryExactDigestAndPathCount,
  selectionChecksum: report.selectionChecksum,
  report: reportPath,
}, null, 2));
