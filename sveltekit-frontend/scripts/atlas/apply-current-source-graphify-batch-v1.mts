#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
} from '$lib/server/atlas/identity/workspace-source-binding-v1.js';
import { writeGraphifySourceInventoryInTransactionV2 } from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v2.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const PLAN_PATH = path.resolve(REPO_ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const OBSERVATION_PATH = path.resolve(REPO_ROOT, 'docs/reports/workspace-source-binding-observation.json');
const REPORT_PATH = path.resolve(REPO_ROOT, 'docs/reports/current-source-graphify-batch-apply-v1.json');
const APPLY = process.env.ATLAS_CURRENT_SOURCE_GRAPHIFY_APPLY === '1';
const CONFIRM = process.env.ATLAS_CURRENT_SOURCE_GRAPHIFY_CONFIRM === 'AUTHORIZE_NON_PRODUCTION_GRAPHIFY_APPLY_FOR_FROZEN_111_SOURCE_PLAN';
const WORKSPACE_ID = process.env.ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID?.trim() ?? '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!APPLY) throw new Error('CURRENT_SOURCE_GRAPHIFY_APPLY_FLAG_REQUIRED');
if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('CURRENT_SOURCE_GRAPHIFY_NON_PRODUCTION_DATABASE_REQUIRED');
if (!CONFIRM) throw new Error('CURRENT_SOURCE_GRAPHIFY_CONFIRMATION_REQUIRED');
if (!UUID_RE.test(WORKSPACE_ID)) throw new Error('CURRENT_SOURCE_GRAPHIFY_WORKSPACE_UUID_REQUIRED');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as Record<string, any>;
const observation = JSON.parse(await readFile(OBSERVATION_PATH, 'utf8')) as Record<string, any>;
const record = workspaceRevisionRecordV1Schema.parse(observation.record);
const bindings = (Array.isArray(observation.bindings) ? observation.bindings : [])
  .map((item) => workspaceSourceBindingV1Schema.parse(item));
const planRecords = Array.isArray(plan.records) ? plan.records : [];
if (plan.status !== 'CURRENT_GRAPHIFY_BATCH_PLAN_READY' || planRecords.length !== 111 || plan.selectedSourceCount !== 111) {
  throw new Error('CURRENT_SOURCE_GRAPHIFY_FROZEN_PLAN_INVALID');
}
if (plan.workspaceRevision !== record.workspaceRevision) throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_OBSERVATION_REVISION_MISMATCH');

const sourceRefs = planRecords.map((item) => String(item.sourceRef ?? '').trim()).filter(Boolean);
if (new Set(sourceRefs).size !== 111) throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_DUPLICATE_SOURCE_REFS');
const bindingByRef = new Map(bindings.map((binding) => [binding.sourceRef, binding]));
const selected = sourceRefs.map((sourceRef) => bindingByRef.get(sourceRef)).filter(Boolean);
if (selected.length !== 111) throw new Error(`CURRENT_SOURCE_GRAPHIFY_PLAN_BINDINGS_MISSING:${selected.length}:111`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 120000 });
let receipt: any;
try {
  await pool.query('BEGIN');
  receipt = await writeGraphifySourceInventoryInTransactionV2({
    client: pool,
    workspaceId: WORKSPACE_ID,
    record,
    bindings,
    selectedSourceRefs: sourceRefs,
    parserContractVersion: 'graphify.current-source-batch.v1',
    extractionContractVersion: 'graphify.source-inventory.current-source.v1',
    configuration: {
      boundedBatch: true,
      selectedSourceCount: 111,
      frozenPlanChecksum: plan.selectionChecksum,
      currentSourceCohort: true,
      nonProduction: true,
    },
  });
  if (!receipt.readbackVerified || receipt.files?.length !== 111) {
    throw new Error('CURRENT_SOURCE_GRAPHIFY_IN_TRANSACTION_READBACK_FAILED');
  }
  await pool.query('COMMIT');
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await pool.end();
}

const verifyPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 120000 });
let readbackRows: any[] = [];
try {
  const result = await verifyPool.query(
    `SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length, last_seen_run_id
       FROM public.graphify_files
      WHERE workspace_id = $1::uuid AND last_seen_run_id = $2::uuid
      ORDER BY source_ref`,
    [WORKSPACE_ID, receipt.runId],
  );
  readbackRows = result.rows;
} finally {
  await verifyPool.end();
}
const expectedByRef = new Map(selected.map((binding: any) => [binding.sourceRef, binding]));
const mismatches = readbackRows.filter((row) => {
  const expected = expectedByRef.get(String(row.source_ref));
  return !expected
    || String(row.workspace_revision) !== record.workspaceRevision
    || String(row.code_source_revision) !== expected.sourceRevision
    || String(row.content_hash).replace(/^sha256:/i, '').toLowerCase() !== expected.contentDigest.toLowerCase()
    || Number(row.byte_length) !== expected.byteLength
    || String(row.last_seen_run_id) !== receipt.runId;
});
const report = {
  schema: 'atlas.current-source-graphify-batch-apply.v1',
  generatedAt: new Date().toISOString(),
  status: readbackRows.length === 111 && mismatches.length === 0 ? 'CURRENT_GRAPHIFY_BATCH_APPLIED_READBACK_PROVEN' : 'CURRENT_GRAPHIFY_BATCH_APPLIED_READBACK_FAILED',
  authorized: true,
  nonProduction: true,
  workspaceId: WORKSPACE_ID,
  workspaceRevision: record.workspaceRevision,
  selectionChecksum: plan.selectionChecksum,
  selectedSourceCount: 111,
  runId: receipt.runId,
  readbackRowCount: readbackRows.length,
  mismatches,
  writes: { postgres: true, graphify: true, qdrant: false, neo4j: false, valkey: false, packets: false, relationships: false },
  canonicalAuthority: false,
};
await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2));
if (report.status !== 'CURRENT_GRAPHIFY_BATCH_APPLIED_READBACK_PROVEN') process.exitCode = 1;
