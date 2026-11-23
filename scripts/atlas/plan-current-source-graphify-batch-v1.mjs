#!/usr/bin/env node

/**
 * Read-only planner for the current-source Graphify coverage gate.
 * It consumes the frozen current-source cohort, never the historical packet
 * selector, and does not write Graphify rows.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { compareCurrentSourceBytesV1, compareGraphifySourceBindingV1, parseGraphifyBatchLimitV1, graphifyBatchReviewStatusV1 } from './lib/graphify-source-binding-comparison-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argumentValue = (name) => {
  const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return null;
  const arg = process.argv[index];
  if (arg.includes('=')) return arg.slice(name.length + 1) || null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
};
const workspacePath = (value, code) => {
  const resolved = resolve(ROOT, value);
  const rel = relative(ROOT, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(code);
  return resolved;
};
const customObservation = argumentValue('--observation');
const COHORT = workspacePath(argumentValue('--cohort') ?? 'docs/reports/current-source-projection-cohort-v1.json', 'COHORT_PATH_OUTSIDE_REPOSITORY');
const OBSERVATION = workspacePath(customObservation ?? 'docs/reports/workspace-source-binding-observation.json', 'OBSERVATION_PATH_OUTSIDE_REPOSITORY');
const LIFECYCLE = resolve(ROOT, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const customReport = argumentValue('--report');
const REPORT = workspacePath(customReport ?? 'docs/reports/current-source-graphify-batch-plan-v1.json', 'REPORT_PATH_OUTSIDE_REPOSITORY');
const reportRelativePath = relative(ROOT, REPORT).replaceAll('\\', '/');
if (customReport && !reportRelativePath.startsWith('.tmp/atlas/')) throw new Error('CUSTOM_REPORT_MUST_BE_UNDER_REPO_TMP_ATLAS');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = parseGraphifyBatchLimitV1(limitArg?.slice('--limit='.length));
const useAdmittedSnapshot = process.argv.includes('--admitted-snapshot');

const clean = (value) => {
  const text = String(value ?? '').trim().replaceAll('\\', '/');
  return text || null;
};
const digest = (rows) => createHash('sha256')
  .update(rows.map((row) => `${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}`).join('\n'), 'utf8')
  .digest('hex');

const cohort = JSON.parse(readFileSync(COHORT, 'utf8'));
const observation = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
let lifecycle = null;
if (!customObservation) {
  try { lifecycle = JSON.parse(readFileSync(LIFECYCLE, 'utf8')); } catch { lifecycle = null; }
}
let admission = null;
let snapshot = null;
if (useAdmittedSnapshot) {
  admission = JSON.parse(readFileSync(ADMISSION, 'utf8'));
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true || admission.writesPerformed === true) {
    throw new Error('ADMITTED_SNAPSHOT_NOT_READ_ONLY_ADMITTED');
  }
  const manifestPath = resolve(ROOT, String(admission.manifestPath ?? ''));
  snapshot = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (snapshot.snapshotRevision !== admission.snapshotRevision || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
    throw new Error('ADMITTED_SNAPSHOT_MANIFEST_MISMATCH');
  }
}
const workspaceRevision = clean(useAdmittedSnapshot
  ? admission.workspaceRevision
  : lifecycle?.workspaceRevision ?? observation.record?.workspaceRevision ?? observation.workspaceRevision);
if (!workspaceRevision?.startsWith('sha256:')) throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_INVALID_WORKSPACE_REVISION');

const bindings = useAdmittedSnapshot
  ? snapshot.sources.map((binding) => ({ ...binding, workspaceRevision }))
  : Array.isArray(lifecycle?.sourceBindings) && lifecycle.sourceBindings.length > 0
    ? lifecycle.sourceBindings.map((binding) => ({ ...binding, workspaceRevision: binding.workspaceRevision ?? workspaceRevision }))
    : (Array.isArray(observation.bindings) ? observation.bindings : []);
const bindingByRef = new Map(bindings.map((binding) => [clean(binding.sourceRef), binding]));
const sourceRows = (useAdmittedSnapshot
  ? bindings.map((row) => clean(row.sourceRef))
  : (Array.isArray(lifecycle?.sourceBindings) && lifecycle.sourceBindings.length > 0
    ? bindings.map((row) => clean(row.sourceRef))
    : (Array.isArray(cohort.cohort) ? cohort.cohort : [])
      .filter((row) => row.eligibleCurrentSource === true)
      .map((row) => clean(row.relativePath))))
  .filter(Boolean)
  .sort();
const uniqueSourceRefs = [...new Set(sourceRows)];
const selectedCandidates = uniqueSourceRefs.slice(0, limit).map((sourceRef) => {
  const binding = bindingByRef.get(sourceRef) ?? bindingByRef.get(sourceRef.replace(/^sveltekit-frontend\//, ''));
  const candidate = {
    sourceRef,
    sourceRevision: clean(binding?.sourceRevision),
    contentDigest: clean(binding?.contentDigest ?? binding?.contentHash),
    byteLength: Number(binding?.byteLength),
    workspaceRevision: clean(binding?.workspaceRevision ?? workspaceRevision),
    bindingPresent: Boolean(binding),
  };
  let localSourceBytes = { available: false, exact: false, mismatchedFields: ['sourceFile'] };
  if (candidate.bindingPresent && candidate.sourceRef) {
    try {
      const sourcePath = resolve(ROOT, candidate.sourceRef.replaceAll('/', sep));
      const relativePath = relative(ROOT, sourcePath);
      const insideRoot = relativePath !== '' && relativePath !== '..'
        && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
      if (insideRoot && existsSync(sourcePath) && statSync(sourcePath).isFile()) {
        localSourceBytes = compareCurrentSourceBytesV1(candidate, readFileSync(sourcePath));
      } else {
        localSourceBytes = { ...localSourceBytes, failure: insideRoot ? 'LOCAL_SOURCE_FILE_MISSING' : 'SOURCE_REF_OUTSIDE_WORKSPACE' };
      }
    } catch {
      localSourceBytes = { ...localSourceBytes, failure: 'LOCAL_SOURCE_READ_FAILED' };
    }
  }
  return { ...candidate, localSourceBytes };
});
const missingWorkspaceBindings = selectedCandidates.filter((row) => !row.bindingPresent);
const selected = selectedCandidates.filter((row) => row.bindingPresent);
const sourceBytesRevalidated = selected.length > 0
  && selected.length === selectedCandidates.length
  && selected.every((row) => row.localSourceBytes?.exact === true);

if (selected.some((row) => row.workspaceRevision !== workspaceRevision || !row.sourceRevision?.startsWith('sha256:') || !/^[0-9a-f]{64}$/i.test(row.contentDigest ?? '') || !Number.isFinite(row.byteLength))) {
  throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_BINDING_NOT_CURRENT_OR_COMPLETE');
}

const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let graphifyRows = [];
let databaseError = null;
try {
  graphifyRows = (await pool.query(
    `select source_ref, workspace_revision, content_hash, code_source_revision, byte_length
       from public.graphify_files
      where source_ref = any($1::text[])
      order by source_ref`,
    [selected.map((row) => row.sourceRef)],
  )).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const byRef = new Map();
for (const row of graphifyRows) {
  const key = clean(row.source_ref)?.toLowerCase();
  const list = byRef.get(key) ?? [];
  list.push(row);
  byRef.set(key, list);
}
const resultRows = selectedCandidates.map((expected) => {
  if (!expected.bindingPresent) return { ...expected, graphifyRows: 0, exactCurrentRows: 0, classification: 'MISSING_WORKSPACE_OBSERVATION' };
  const aliases = [expected.sourceRef, expected.sourceRef.replace(/^sveltekit-frontend\//, '')].map((value) => value.toLowerCase());
  const matches = aliases.flatMap((key) => byRef.get(key) ?? []);
  const unique = [...new Map(matches.map((row) => [JSON.stringify(row), row])).values()];
  const comparisons = unique.map((row) => compareGraphifySourceBindingV1(expected, row));
  const exact = comparisons.filter((comparison) => comparison.exact);
  return {
    ...expected,
    graphifyRows: unique.length,
    exactCurrentRows: exact.length,
    comparisons,
    classification: unique.length === 0 ? 'MISSING_GRAPHIFY_SOURCE'
      : unique.length > 1 ? 'AMBIGUOUS_GRAPHIFY_SOURCE'
        : exact.length === 1 ? 'CURRENT_GRAPHIFY_EXACT'
          : 'GRAPHIFY_REVISION_OR_CONTENT_MISMATCH',
  };
});
const exact = resultRows.filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT');
const missing = resultRows.filter((row) => row.classification === 'MISSING_GRAPHIFY_SOURCE');
const ambiguous = resultRows.filter((row) => row.classification === 'AMBIGUOUS_GRAPHIFY_SOURCE');
const mismatched = resultRows.filter((row) => row.classification === 'GRAPHIFY_REVISION_OR_CONTENT_MISMATCH');
const status = graphifyBatchReviewStatusV1({
  databaseError, selectedCount: selected.length, missingBindings: missingWorkspaceBindings.length,
  needsReview: missing.length || mismatched.length || ambiguous.length || !sourceBytesRevalidated,
});
const mismatchFieldCounts = {};
for (const row of resultRows) {
  for (const field of new Set((row.comparisons ?? []).flatMap((comparison) => comparison.mismatchedFields))) {
    mismatchFieldCounts[field] = (mismatchFieldCounts[field] ?? 0) + 1;
  }
}
const report = {
  schema: 'atlas.current-source-graphify-batch-plan.v1',
  generatedAt: new Date().toISOString(),
  status,
  readOnly: true,
  canonicalAuthority: false,
  sourceBytesRevalidated,
  sourceBytesRevalidationScope: 'BOUNDED_SELECTED_LOCAL_FILES_MATCH_SNAPSHOT_SOURCE_REVISION_CONTENT_DIGEST_AND_BYTE_LENGTH',
  promotionAllowed: false,
  scope: 'BOUNDED_RECORDED_BINDING_COMPARISON',
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  workspaceRevision,
  snapshotRevision: useAdmittedSnapshot ? clean(admission.snapshotRevision) : null,
  sourceSelectionChecksum: useAdmittedSnapshot ? clean(admission.sourceSelectionChecksum) : null,
  inputSource: useAdmittedSnapshot
    ? 'docs/reports/workspace-revision-tournament-admission-v1.json -> admitted snapshot manifest'
    : lifecycle?.sourceBindings?.length ? 'docs/reports/graphify-lifecycle-entrypoint-v1.json' : relative(ROOT, OBSERVATION).replaceAll('\\', '/'),
  cohortReport: relative(ROOT, COHORT).replaceAll('\\', '/'),
  cohortEligibleSources: uniqueSourceRefs.length,
  requestedLimit: limit,
  selectedSourceCount: selected.length,
  selectionChecksum: digest(selected),
  counts: {
    currentGraphifyExact: exact.length,
    missingGraphifySource: missing.length,
    missingWorkspaceObservation: missingWorkspaceBindings.length,
    ambiguousGraphifySource: ambiguous.length,
    graphifyRevisionOrContentMismatch: mismatched.length,
    localSourceBytesMismatch: selected.filter((row) => row.localSourceBytes?.exact !== true).length,
  },
  databaseError,
  mismatchFieldCounts,
  nextGate: databaseError ? 'DATABASE_READ_RETRY' : missingWorkspaceBindings.length ? 'WORKSPACE_OBSERVATION_RECONCILIATION_REQUIRED' : selected.length === 0 ? 'NONEMPTY_SOURCE_COHORT_REQUIRED' : !sourceBytesRevalidated ? 'SOURCE_BYTES_REVALIDATION_REQUIRED' : missing.length || mismatched.length || ambiguous.length ? 'EXPLICIT_GRAPHIFY_BATCH_REVIEW' : 'CURRENT_GRAPHIFY_COHORT_READBACK_PROVEN',
  records: resultRows,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, selectedSourceCount: selected.length, sourceBytesRevalidated, counts: report.counts, mismatchFieldCounts, selectionChecksum: report.selectionChecksum, output: REPORT }, null, 2));
if (databaseError) process.exitCode = 1;
