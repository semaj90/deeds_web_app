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

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COHORT = resolve(ROOT, 'docs/reports/current-source-projection-cohort-v1.json');
const OBSERVATION = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const REPORT = resolve(ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(128, Number(limitArg?.split('=')[1] ?? 128)));

const clean = (value) => {
  const text = String(value ?? '').trim().replaceAll('\\', '/');
  return text || null;
};
const digest = (rows) => createHash('sha256')
  .update(rows.map((row) => `${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}`).join('\n'), 'utf8')
  .digest('hex');

const cohort = JSON.parse(readFileSync(COHORT, 'utf8'));
const observation = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
const workspaceRevision = clean(observation.record?.workspaceRevision ?? observation.workspaceRevision);
if (!workspaceRevision?.startsWith('sha256:')) throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_INVALID_WORKSPACE_REVISION');

const bindings = Array.isArray(observation.bindings) ? observation.bindings : [];
const bindingByRef = new Map(bindings.map((binding) => [clean(binding.sourceRef), binding]));
const sourceRows = (Array.isArray(cohort.cohort) ? cohort.cohort : [])
  .filter((row) => row.eligibleCurrentSource === true)
  .map((row) => clean(row.relativePath))
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
  const exact = unique.filter((row) => clean(row.workspace_revision) === workspaceRevision
    && clean(row.code_source_revision)?.toLowerCase() === expected.sourceRevision.toLowerCase()
    && clean(row.content_hash)?.replace(/^sha256:/i, '').toLowerCase() === expected.contentDigest.toLowerCase()
    && Number(row.byte_length) === expected.byteLength);
  return {
    ...expected,
    graphifyRows: unique.length,
    exactCurrentRows: exact.length,
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
const status = databaseError ? 'CURRENT_GRAPHIFY_BATCH_PLAN_DATABASE_ERROR'
  : missingWorkspaceBindings.length ? 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_MISSING_OBSERVATION'
    : 'CURRENT_GRAPHIFY_BATCH_PLAN_READY';
const report = {
  schema: 'atlas.current-source-graphify-batch-plan.v1',
  generatedAt: new Date().toISOString(),
  status,
  readOnly: true,
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  workspaceRevision,
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
  nextGate: databaseError ? 'DATABASE_READ_RETRY' : missingWorkspaceBindings.length ? 'WORKSPACE_OBSERVATION_RECONCILIATION_REQUIRED' : missing.length || mismatched.length || ambiguous.length ? 'EXPLICIT_GRAPHIFY_BATCH_REVIEW' : 'CURRENT_GRAPHIFY_COHORT_READBACK_PROVEN',
  records: resultRows,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, selectedSourceCount: selected.length, counts: report.counts, selectionChecksum: report.selectionChecksum, output: REPORT }, null, 2));
if (databaseError) process.exitCode = 1;
