#!/usr/bin/env node

/** Read-only classification of a bounded source-binding cohort. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { classifyWorkspaceSourceBindingV1 } from './lib/workspace-source-binding-classification-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = resolve(root, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const reportPath = resolve(root, 'docs/reports/current-workspace-source-binding-classification-v1.json');
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const workspaceRevision = arg('--workspace-revision');
const limitText = arg('--limit') ?? '128';
const limit = Number(limitText);
if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision ?? '')) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
}
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('BOUNDED_LIMIT_REQUIRED');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const planWorkspaceRevision = String(plan.workspaceRevision ?? '').trim();
const records = (plan.records ?? [])
  .slice(0, limit)
  .map((row) => ({
    sourceRef: String(row.sourceRef ?? '').trim().replaceAll('\\', '/'),
    sourceRevision: String(row.sourceRevision ?? '').trim(),
    contentDigest: String(row.contentDigest ?? '').trim().toLowerCase().replace(/^sha256:/, ''),
  }))
  .filter((row) => row.sourceRef);
if (records.length === 0) throw new Error('CURRENT_GRAPHIFY_SOURCE_COHORT_EMPTY');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let bindings = [];
let databaseError = null;
try {
  bindings = (await pool.query(
    `select canonical_source_ref, workspace_revision, source_revision, content_digest
       from public.atlas_workspace_source_bindings
      where repo_id = 'deeds-web-app' and canonical_source_ref = any($1::text[])
      order by canonical_source_ref, workspace_revision, source_revision`,
    [records.map((row) => row.sourceRef)],
  )).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const rows = records.map((expected) => ({
  ...expected,
  workspaceRevision,
  classification: classifyWorkspaceSourceBindingV1({ expected, bindings, workspaceRevision }),
}));
const counts = Object.fromEntries(['REVISION_BOUND', 'WORKSPACE_IDENTITY_ONLY', 'WRONG_WORKSPACE_REVISION', 'SOURCE_CONTENT_MISMATCH', 'AMBIGUOUS']
  .map((classification) => [classification, rows.filter((row) => row.classification === classification).length]));
const report = {
  schema: 'atlas.current-workspace-source-binding-classification.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CLASSIFICATION',
  admittedWorkspaceRevision: workspaceRevision,
  planWorkspaceRevision,
  inputPlanRevisionMatches: planWorkspaceRevision === workspaceRevision,
  inputPlan: 'docs/reports/current-source-graphify-batch-plan-v1.json',
  sourcePlanChecksum: plan.selectionChecksum ?? null,
  candidateCount: rows.length,
  counts,
  rows,
  databaseError,
  currentCohortEligible: !databaseError && planWorkspaceRevision === workspaceRevision
    && counts.REVISION_BOUND === rows.length,
  canonicalAuthority: false,
  safeToApply: false,
  writesPerformed: false,
  nextGate: planWorkspaceRevision !== workspaceRevision
    ? 'REBUILD_SOURCE_PLAN_FROM_ADMITTED_SNAPSHOT'
    : counts.REVISION_BOUND === rows.length
    ? 'CURRENT_EXECUTION_LINEAGE_CLOSURE_REVIEW'
    : 'RECONCILE_SOURCE_BINDINGS_BEFORE_PACKET_CHUNK_JOIN',
};
report.reportChecksum = createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex');
mkdirSync(dirname(reportPath), { recursive: true });
const partial = `${reportPath}.partial`;
writeFileSync(partial, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(partial, reportPath);
console.log(JSON.stringify({ status: report.currentCohortEligible ? 'REVISION_BOUND_COHORT_READY_FOR_REVIEW' : 'SOURCE_BINDING_CLASSIFICATION_BLOCKED', counts, writesPerformed: false, reportPath: 'docs/reports/current-workspace-source-binding-classification-v1.json' }, null, 2));
