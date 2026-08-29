#!/usr/bin/env node

/**
 * Explicitly authorized, bounded source-registry apply.
 *
 * This script inserts only the exact current Graphify sources from the
 * reconciliation plan. It does not create workspace bindings or touch any
 * projection. The transaction commits only after exact readback succeeds.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN = resolve(ROOT, 'docs/reports/current-source-registry-reconciliation-plan-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-source-registry-reconciliation-apply-v1.json');
const AUTHORIZATION = 'AUTHORIZE NON-PRODUCTION SOURCE REGISTRY INSERT FOR 111 CURRENT GRAPHIFY SOURCES';

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
if (plan.status !== 'REGISTRY_RECONCILIATION_PLAN_READY'
  || plan.selectedSourceCount !== 111
  || plan.registryMatchCount !== 0
  || plan.registryMissingCount !== 111) {
  throw new Error('SOURCE_REGISTRY_PLAN_NOT_EXACTLY_AUTHORIZED_111_ROW_PLAN');
}

const rows = (plan.rows ?? []).filter((row) => row.classification === 'REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY');
if (rows.length !== 111 || plan.selectionChecksum !== '43a4cdc047c3d0e04aa441beafe41837254cc64f5d4c644acf06f31c269211a7') {
  throw new Error('SOURCE_REGISTRY_PLAN_CHECKSUM_OR_ROW_COUNT_MISMATCH');
}

const valid = rows.every((row) => row.repoId === 'deeds-web-app'
  && typeof row.sourceRefKey === 'string'
  && row.sourceRefKey === row.relativePath
  && row.sourceType === 'code'
  && /^[0-9a-f]{64}$/i.test(row.contentHash ?? '')
  && /^sha256:[0-9a-f]{64}$/i.test(row.sourceRevision ?? '')
  && /^sha256:[0-9a-f]{64}$/i.test(row.workspaceRevision ?? '')
  && Number.isInteger(row.byteLength) && row.byteLength >= 0);
if (!valid) throw new Error('SOURCE_REGISTRY_PLAN_ROW_INVALID');

const applyChecksum = createHash('sha256')
  .update(rows.map((row) => `${row.repoId}:${row.sourceRefKey}:${row.contentHash}:${row.sourceRevision}:${row.workspaceRevision}`).join('\n'), 'utf8')
  .digest('hex');
if (applyChecksum !== plan.selectionChecksum) throw new Error('SOURCE_REGISTRY_APPLY_CHECKSUM_MISMATCH');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let committed = false;
let inserted = 0;
let readback = [];
try {
  await pool.query('BEGIN');
  const conflicts = await pool.query(
    'select source_ref_key, repo_id, content_hash from public.atlas_source_refs where repo_id = $1 and source_ref_key = any($2::text[]) order by source_ref_key',
    ['deeds-web-app', rows.map((row) => row.sourceRefKey)],
  );
  if (conflicts.rows.length !== 0) throw new Error(`SOURCE_REGISTRY_CONFLICTS_PRESENT:${conflicts.rows.length}`);

  for (const row of rows) {
    await pool.query(
      `insert into public.atlas_source_refs
        (source_ref_key, repo_id, source_type, relative_path, content_hash)
       values ($1, $2, $3, $4, $5)`,
      [row.sourceRefKey, row.repoId, row.sourceType, row.relativePath, row.contentHash],
    );
    inserted += 1;
  }

  const result = await pool.query(
    'select source_ref_key, repo_id, source_type, relative_path, content_hash from public.atlas_source_refs where repo_id = $1 and source_ref_key = any($2::text[]) order by source_ref_key',
    ['deeds-web-app', rows.map((row) => row.sourceRefKey)],
  );
  readback = result.rows;
  const expected = new Map(rows.map((row) => [row.sourceRefKey, row]));
  const readbackOk = readback.length === rows.length && readback.every((actual) => {
    const expectedRow = expected.get(actual.source_ref_key);
    return expectedRow
      && actual.repo_id === expectedRow.repoId
      && actual.source_type === expectedRow.sourceType
      && actual.relative_path === expectedRow.relativePath
      && actual.content_hash === expectedRow.contentHash;
  });
  if (!readbackOk) throw new Error(`SOURCE_REGISTRY_READBACK_MISMATCH:${readback.length}`);
  await pool.query('COMMIT');
  committed = true;
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.current-source-registry-reconciliation-apply.v1',
  generatedAt: new Date().toISOString(),
  authorization: AUTHORIZATION,
  sourcePlan: 'docs/reports/current-source-registry-reconciliation-plan-v1.json',
  planSelectionChecksum: plan.selectionChecksum,
  applyChecksum,
  selectedSourceCount: rows.length,
  insertedCount: inserted,
  readbackCount: readback.length,
  committed,
  workspaceBindingsWritten: false,
  graphifyRowsWritten: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  status: committed && inserted === 111 && readback.length === 111
    ? 'SOURCE_REGISTRY_INSERT_AND_READBACK_PROVEN'
    : 'SOURCE_REGISTRY_INSERT_NOT_PROVEN',
  nextGate: 'RERUN_SOURCE_REGISTRY_AUDIT_THEN_APPLY_WORKSPACE_BINDING_CANARY_ONLY_AFTER_EXPLICIT_APPROVAL',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
