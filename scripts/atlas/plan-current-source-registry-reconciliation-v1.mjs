#!/usr/bin/env node

/**
 * Read-only plan for reconciling the current Graphify source cohort with the
 * stable atlas_source_refs registry. This script never inserts registry or
 * workspace-binding rows.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN = resolve(ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-source-registry-reconciliation-plan-v1.json');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(111, Number(limitArg?.split('=')[1] ?? 111)));

const text = (value) => {
  const valueText = String(value ?? '').trim().replaceAll('\\', '/');
  return valueText || null;
};

const checksum = (rows) => createHash('sha256')
  .update(rows.map((row) => `${row.repoId}:${row.sourceRefKey}:${row.contentHash}:${row.sourceRevision}:${row.workspaceRevision}`).join('\n'), 'utf8')
  .digest('hex');

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const plannedRows = (plan.records ?? [])
  .filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT')
  .sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef)))
  .slice(0, limit)
  .map((row) => ({
    repoId: 'deeds-web-app',
    sourceRefKey: text(row.sourceRef),
    relativePath: text(row.sourceRef),
    sourceType: 'code',
    contentHash: text(row.contentDigest),
    sourceRevision: text(row.sourceRevision),
    workspaceRevision: text(row.workspaceRevision),
    byteLength: Number(row.byteLength),
  }));

if (plannedRows.some((row) => !row.sourceRefKey || !/^[0-9a-f]{64}$/i.test(row.contentHash ?? '')
  || !/^sha256:[0-9a-f]{64}$/i.test(row.sourceRevision ?? '')
  || !/^sha256:[0-9a-f]{64}$/i.test(row.workspaceRevision ?? '')
  || !Number.isInteger(row.byteLength) || row.byteLength < 0)) {
  throw new Error('CURRENT_SOURCE_REGISTRY_PLAN_INVALID_INPUT');
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let registryRows = [];
let databaseError = null;
try {
  const result = await pool.query(
    'select source_ref_key, repo_id, source_type, relative_path, content_hash, commit_sha, corpus_version from public.atlas_source_refs where repo_id = $1 and source_ref_key = any($2::text[]) order by source_ref_key',
    ['deeds-web-app', plannedRows.map((row) => row.sourceRefKey)],
  );
  registryRows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const registryByKey = new Map(registryRows.map((row) => [`${row.repo_id}:${row.source_ref_key}`, row]));
const rows = plannedRows.map((row) => {
  const existing = registryByKey.get(`${row.repoId}:${row.sourceRefKey}`) ?? null;
  return {
    ...row,
    registryPresent: Boolean(existing),
    registryContentHash: existing?.content_hash ?? null,
    registryCommitSha: existing?.commit_sha ?? null,
    registryCorpusVersion: existing?.corpus_version ?? null,
    classification: existing ? 'ALREADY_REGISTERED' : 'REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY',
  };
});

const missing = rows.filter((row) => !row.registryPresent);
const report = {
  schema: 'atlas.current-source-registry-reconciliation-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PLAN',
  readOnly: true,
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  sourcePlan: 'docs/reports/current-source-graphify-batch-plan-v1.json',
  requestedLimit: limit,
  selectedSourceCount: rows.length,
  registryMatchCount: registryRows.length,
  registryMissingCount: missing.length,
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
      : 'REGISTRY_RECONCILIATION_PLAN_READY',
  nextGate: databaseError ? 'DATABASE_READ_RETRY'
    : missing.length ? 'EXPLICIT_REGISTRY_INSERT_APPROVAL_AND_BOUNDED_READBACK'
      : 'WORKSPACE_BINDING_PLAN',
  rows,
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  selectedSourceCount: report.selectedSourceCount,
  registryMatchCount: report.registryMatchCount,
  registryMissingCount: report.registryMissingCount,
  selectionChecksum: report.selectionChecksum,
  report: REPORT,
}, null, 2));
