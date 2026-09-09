#!/usr/bin/env node

/**
 * Read-only planner for the current-source Graphify coverage gate.
 * It consumes the frozen current-source cohort, never the historical packet
 * selector, and does not write Graphify rows.
 */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { compareGraphifySourceBindingV1, parseGraphifyBatchLimitV1, graphifyBatchReviewStatusV1 } from './lib/graphify-source-binding-comparison-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COHORT = resolve(ROOT, 'docs/reports/current-source-projection-cohort-v1.json');
const OBSERVATION = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const LIFECYCLE = resolve(ROOT, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = parseGraphifyBatchLimitV1(limitArg?.slice('--limit='.length));

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
try { lifecycle = JSON.parse(readFileSync(LIFECYCLE, 'utf8')); } catch { lifecycle = null; }
const workspaceRevision = clean(lifecycle?.workspaceRevision ?? observation.record?.workspaceRevision ?? observation.workspaceRevision);
if (!workspaceRevision?.startsWith('sha256:')) throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_INVALID_WORKSPACE_REVISION');

const bindings = Array.isArray(lifecycle?.sourceBindings) && lifecycle.sourceBindings.length > 0
  ? lifecycle.sourceBindings.map((binding) => ({ ...binding, workspaceRevision: binding.workspaceRevision ?? workspaceRevision }))
  : (Array.isArray(observation.bindings) ? observation.bindings : []);
const bindingByRef = new Map(bindings.map((binding) => [clean(binding.sourceRef), binding]));
const sourceRows = (Array.isArray(lifecycle?.sourceBindings) && lifecycle.sourceBindings.length > 0
  ? bindings.map((row) => clean(row.sourceRef))
  : (Array.isArray(cohort.cohort) ? cohort.cohort : [])
    .filter((row) => row.eligibleCurrentSource === true)
    .map((row) => clean(row.relativePath)))
  .filter(Boolean)
  .sort();
const uniqueSourceRefs = [...new Set(sourceRows)];
const selectedCandidates = uniqueSourceRefs.slice(0, limit).map((sourceRef) => {
  const binding = bindingByRef.get(sourceRef) ?? bindingByRef.get(sourceRef.replace(/^sveltekit-frontend\//, ''));
  return {
    sourceRef,
    sourceRevision: clean(binding?.sourceRevision),
    contentDigest: clean(binding?.contentDigest ?? binding?.contentHash),
    byteLength: Number(binding?.byteLength),
    workspaceRevision: clean(binding?.workspaceRevision ?? workspaceRevision),
    bindingPresent: Boolean(binding),
  };
});
const missingWorkspaceBindings = selectedCandidates.filter((row) => !row.bindingPresent);
const selected = selectedCandidates.filter((row) => row.bindingPresent);

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
  needsReview: missing.length || mismatched.length || ambiguous.length,
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
  sourceBytesRevalidated: false,
  promotionAllowed: false,
  scope: 'BOUNDED_RECORDED_BINDING_COMPARISON',
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  workspaceRevision,
  inputSource: lifecycle?.sourceBindings?.length ? 'docs/reports/graphify-lifecycle-entrypoint-v1.json' : 'docs/reports/workspace-source-binding-observation.json',
  cohortReport: 'docs/reports/current-source-projection-cohort-v1.json',
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
  },
  databaseError,
  mismatchFieldCounts,
  nextGate: databaseError ? 'DATABASE_READ_RETRY' : missingWorkspaceBindings.length ? 'WORKSPACE_OBSERVATION_RECONCILIATION_REQUIRED' : selected.length === 0 ? 'NONEMPTY_SOURCE_COHORT_REQUIRED' : missing.length || mismatched.length || ambiguous.length ? 'EXPLICIT_GRAPHIFY_BATCH_REVIEW' : 'CURRENT_GRAPHIFY_COHORT_READBACK_PROVEN',
  records: resultRows,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, selectedSourceCount: selected.length, counts: report.counts, mismatchFieldCounts, selectionChecksum: report.selectionChecksum, output: REPORT }, null, 2));
if (databaseError) process.exitCode = 1;
