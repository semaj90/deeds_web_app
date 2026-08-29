#!/usr/bin/env node

/**
 * Explicitly authorized, bounded workspace-source binding migration/apply.
 * Inserts only the 111 exact current Graphify rows from the approved plan.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN = resolve(ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const REGISTRY_PLAN = resolve(ROOT, 'docs/reports/current-source-registry-reconciliation-plan-v1.json');
const DDL = resolve(ROOT, 'sveltekit-frontend/drizzle/manual/20260827_source_lineage_relations_v1.sql');
const REPORT = resolve(ROOT, 'docs/reports/current-workspace-source-bindings-apply-v1.json');
const AUTHORIZATION = 'AUTHORIZE NON-PRODUCTION WORKSPACE SOURCE BINDING MIGRATION FOR 111 CURRENT GRAPHIFY SOURCES';

const text = (value) => {
  const valueText = String(value ?? '').trim().replaceAll('\\', '/');
  return valueText || null;
};
const digest = (row) => createHash('sha256')
  .update(`${row.repoId}:${row.workspaceRevision}:${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}:${row.producerRevision}`, 'utf8')
  .digest('hex');

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const registryPlan = JSON.parse(readFileSync(REGISTRY_PLAN, 'utf8'));
if (plan.status !== 'CURRENT_GRAPHIFY_BATCH_PLAN_READY' || plan.selectedSourceCount !== 111
  || registryPlan.registryMatchCount !== 111 || registryPlan.registryMissingCount !== 0) {
  throw new Error('WORKSPACE_BINDING_INPUT_PLAN_NOT_READY_FOR_111_ROWS');
}

const sourceRows = (plan.records ?? [])
  .filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT')
  .sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef)));
if (sourceRows.length !== 111) throw new Error('WORKSPACE_BINDING_SOURCE_ROW_COUNT_MISMATCH');

const producerRevision = `graphify-current-source-batch-v1:${plan.selectionChecksum}`;
const bindingRows = sourceRows.map((row, index) => ({
  repoId: 'deeds-web-app',
  workspaceRevision: text(row.workspaceRevision),
  sourceRef: text(row.sourceRef),
  sourceRevision: text(row.sourceRevision),
  contentDigest: text(row.contentDigest),
  byteLength: Number(row.byteLength),
  sourceManifestOrdinal: index,
  producerRevision,
}));
if (bindingRows.some((row) => !/^sha256:[0-9a-f]{64}$/i.test(row.workspaceRevision ?? '')
  || !/^sha256:[0-9a-f]{64}$/i.test(row.sourceRevision ?? '')
  || !/^[0-9a-f]{64}$/i.test(row.contentDigest ?? '')
  || !Number.isInteger(row.byteLength) || row.byteLength < 0)) {
  throw new Error('WORKSPACE_BINDING_ROW_INVALID');
}
for (const row of bindingRows) row.bindingChecksum = digest(row);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let committed = false;
let readback = [];
try {
  await pool.query('BEGIN');
  const registry = await pool.query(
    'select source_ref_key from public.atlas_source_refs where repo_id = $1 and source_ref_key = any($2::text[])',
    ['deeds-web-app', bindingRows.map((row) => row.sourceRef)],
  );
  if (registry.rows.length !== 111) throw new Error(`WORKSPACE_BINDING_REGISTRY_COVERAGE:${registry.rows.length}`);

  const ddl = readFileSync(DDL, 'utf8').replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
  await pool.query(ddl);

  const existing = await pool.query(
    'select repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length, producer_revision, binding_checksum from public.atlas_workspace_source_bindings where repo_id = $1 and workspace_revision = $2',
    ['deeds-web-app', bindingRows[0].workspaceRevision],
  );
  if (existing.rows.length !== 0) throw new Error(`WORKSPACE_BINDING_CONFLICTS_PRESENT:${existing.rows.length}`);

  for (const row of bindingRows) {
    await pool.query(
      `insert into public.atlas_workspace_source_bindings
        (repo_id, workspace_revision, canonical_source_ref, source_revision,
         content_digest, byte_length, source_manifest_ordinal, producer_revision,
         binding_checksum)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.repoId, row.workspaceRevision, row.sourceRef, row.sourceRevision, row.contentDigest,
        row.byteLength, row.sourceManifestOrdinal, row.producerRevision, row.bindingChecksum],
    );
  }

  const result = await pool.query(
    'select repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length, producer_revision, binding_checksum from public.atlas_workspace_source_bindings where repo_id = $1 and workspace_revision = $2 order by canonical_source_ref',
    ['deeds-web-app', bindingRows[0].workspaceRevision],
  );
  readback = result.rows;
  const expected = new Map(bindingRows.map((row) => [row.sourceRef, row]));
  const readbackOk = readback.length === 111 && readback.every((actual) => {
    const expectedRow = expected.get(actual.canonical_source_ref);
    return expectedRow
      && actual.repo_id === expectedRow.repoId
      && actual.workspace_revision === expectedRow.workspaceRevision
      && actual.source_revision === expectedRow.sourceRevision
      && actual.content_digest === expectedRow.contentDigest
      && Number(actual.byte_length) === expectedRow.byteLength
      && actual.producer_revision === expectedRow.producerRevision
      && actual.binding_checksum === expectedRow.bindingChecksum;
  });
  if (!readbackOk) throw new Error(`WORKSPACE_BINDING_READBACK_MISMATCH:${readback.length}`);
  await pool.query('COMMIT');
  committed = true;
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.current-workspace-source-bindings-apply.v1',
  generatedAt: new Date().toISOString(),
  authorization: AUTHORIZATION,
  sourcePlan: 'docs/reports/current-source-graphify-batch-plan-v1.json',
  migration: 'sveltekit-frontend/drizzle/manual/20260827_source_lineage_relations_v1.sql',
  workspaceRevision: bindingRows[0].workspaceRevision,
  producerRevision,
  selectedSourceCount: bindingRows.length,
  insertedCount: committed ? bindingRows.length : 0,
  readbackCount: readback.length,
  committed,
  bindingChecksums: {
    count: bindingRows.length,
    aggregate: createHash('sha256').update(bindingRows.map((row) => row.bindingChecksum).join('\n'), 'utf8').digest('hex'),
  },
  registryWrites: false,
  graphifyRowsWritten: false,
  packetWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  status: committed && readback.length === 111 ? 'WORKSPACE_SOURCE_BINDINGS_INSERT_AND_READBACK_PROVEN' : 'WORKSPACE_SOURCE_BINDINGS_INSERT_NOT_PROVEN',
  nextGate: 'RERUN_LINEAGE_COHORT_AUDIT_THEN_REVIEW_GRAPH_REVISION_OWNER',
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
