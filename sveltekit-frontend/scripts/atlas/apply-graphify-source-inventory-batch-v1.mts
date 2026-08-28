#!/usr/bin/env tsx

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { workspaceRevisionRecordV1Schema, workspaceSourceBindingV1Schema } from '$lib/server/atlas/identity/workspace-source-binding-v1.js';
import { writeGraphifySourceInventoryInTransactionV2 } from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v2.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const observationPath = path.resolve(REPO_ROOT, process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT ?? 'docs/reports/workspace-source-binding-observation.json');
const outputPath = path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_PLAN_OUT ?? '.tmp/atlas/graphify-source-inventory-batch-v1.json');
const verifyOutputPath = path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_VERIFY_OUT ?? 'docs/reports/graphify-source-inventory-batch-readback-v1.json');
const explicitSelectionPath = process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_SELECTION?.trim() ? path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_SELECTION.trim()) : null;
const apply = process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_APPLY === '1';
const verifyOnly = process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_VERIFY_ONLY === '1';
const limit = Math.max(1, Math.min(128, Number(process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_LIMIT ?? 128)));
const workspaceId = process.env.ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID?.trim() ?? '';

if (apply && verifyOnly) throw new Error('GRAPHIFY_SOURCE_BATCH_APPLY_AND_VERIFY_MUTUALLY_EXCLUSIVE');
if (apply && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('GRAPHIFY_SOURCE_BATCH_NON_PRODUCTION_DATABASE_REQUIRED');
if (apply && process.env.ATLAS_GRAPHIFY_SOURCE_BATCH_CONFIRM !== 'I_UNDERSTAND_NON_PRODUCTION_SOURCE_BATCH') throw new Error('GRAPHIFY_SOURCE_BATCH_CONFIRMATION_REQUIRED');
if (apply && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error('GRAPHIFY_SOURCE_BATCH_WORKSPACE_UUID_REQUIRED');

const observation = JSON.parse(await readFile(observationPath, 'utf8')) as Record<string, unknown>;
const record = workspaceRevisionRecordV1Schema.parse(observation.record);
const bindings = (Array.isArray(observation.bindings) ? observation.bindings : []).map((item) => workspaceSourceBindingV1Schema.parse(item));
if (!bindings.length) throw new Error('GRAPHIFY_SOURCE_BATCH_OBSERVATION_HAS_NO_BINDINGS');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

if (verifyOnly) {
  const existingPlan = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
  const existingRecords = Array.isArray(existingPlan.records) ? existingPlan.records as Array<Record<string, unknown>> : [];
  const existingSourceRefs = Array.isArray(existingPlan.sourceRefs) ? existingPlan.sourceRefs.map(String) : [];
  if (!existingRecords.length || existingSourceRefs.length !== existingRecords.length) {
    throw new Error('GRAPHIFY_SOURCE_BATCH_VERIFY_PLAN_MISSING_FROZEN_SELECTION');
  }
  const verifyWorkspaceId = workspaceId || String(existingPlan.workspaceId ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(verifyWorkspaceId)) {
    throw new Error('GRAPHIFY_SOURCE_BATCH_VERIFY_WORKSPACE_UUID_REQUIRED');
  }
  const verifyPool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 30_000 });
  try {
    const readback = await verifyPool.query(
      `SELECT source_ref, workspace_revision, content_hash, code_source_revision, byte_length
         FROM public.graphify_files
        WHERE workspace_id = $1::uuid
          AND source_ref = ANY($2::text[])
        ORDER BY source_ref`,
      [verifyWorkspaceId, existingSourceRefs],
    );
    const expectedByRef = new Map(existingRecords.map((item) => [String(item.sourceRef), item]));
    const readbackRefs = new Set(readback.rows.map((row) => String(row.source_ref)));
    const mismatches: Array<Record<string, unknown>> = [];
    for (const sourceRef of existingSourceRefs) {
      const rows = readback.rows.filter((row) => String(row.source_ref) === sourceRef);
      const expected = expectedByRef.get(sourceRef);
      if (rows.length !== 1 || !expected) {
        mismatches.push({ sourceRef, reason: rows.length === 0 ? 'MISSING' : rows.length > 1 ? 'DUPLICATE' : 'EXPECTED_RECORD_MISSING' });
        continue;
      }
      const row = rows[0];
      const actualHash = String(row.content_hash).replace(/^sha256:/i, '').toLowerCase();
      const expectedHash = String(expected.contentDigest).replace(/^sha256:/i, '').toLowerCase();
      const actualRevision = String(row.code_source_revision);
      const expectedRevision = String(expected.sourceRevision);
      const actualWorkspaceRevision = String(row.workspace_revision);
      const expectedWorkspaceRevision = String(existingPlan.workspaceRevision);
      const actualByteLength = Number(row.byte_length);
      const expectedByteLength = Number(expected.byteLength);
      if (actualWorkspaceRevision !== expectedWorkspaceRevision || actualHash !== expectedHash || actualRevision !== expectedRevision || actualByteLength !== expectedByteLength) {
        mismatches.push({ sourceRef, actual: { workspaceRevision: actualWorkspaceRevision, contentHash: actualHash, codeSourceRevision: actualRevision, byteLength: actualByteLength }, expected: { workspaceRevision: expectedWorkspaceRevision, contentHash: expectedHash, codeSourceRevision: expectedRevision, byteLength: expectedByteLength } });
      }
    }
    const report = {
      schema: 'atlas.graphify-source-inventory-batch-readback-v1',
      status: mismatches.length === 0 && readbackRefs.size === existingSourceRefs.length ? 'GRAPHIFY_SOURCE_BATCH_READBACK_PROVEN' : 'GRAPHIFY_SOURCE_BATCH_READBACK_FAILED',
      readOnly: true,
      workspaceId: verifyWorkspaceId,
      workspaceRevision: existingPlan.workspaceRevision ?? null,
      selectionChecksum: existingPlan.selectionChecksum ?? null,
      selectedSourceCount: existingSourceRefs.length,
      readbackRowCount: readback.rows.length,
      readbackUniqueSourceCount: readbackRefs.size,
      matchedSourceCount: existingSourceRefs.length - mismatches.length,
      mismatches,
      writes: { postgres: false, qdrant: false, packets: false },
    };
    await mkdir(path.dirname(verifyOutputPath), { recursive: true });
    await writeFile(verifyOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...report, output: verifyOutputPath }, null, 2));
    if (report.status !== 'GRAPHIFY_SOURCE_BATCH_READBACK_PROVEN') process.exitCode = 1;
  } finally {
    await verifyPool.end();
  }
  process.exit();
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 30_000 });
const packetSources = await pool.query(`
  WITH packet_refs AS (
    SELECT source_ref, count(*)::integer AS packet_count
    FROM public.atlas_packets
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
    GROUP BY source_ref
  ), graphify_refs AS (
    SELECT source_ref,
           count(*)::integer AS graphify_rows,
           count(*) FILTER (WHERE workspace_revision IS NOT NULL)::integer AS workspace_revision_rows
    FROM public.graphify_files
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
    GROUP BY source_ref
  )
  SELECT p.source_ref, p.packet_count,
         COALESCE(g.graphify_rows, 0)::integer AS graphify_rows,
         COALESCE(g.workspace_revision_rows, 0)::integer AS workspace_revision_rows
  FROM packet_refs p
  LEFT JOIN graphify_refs g ON g.source_ref = p.source_ref
  ORDER BY p.source_ref
`);
const packetRows = packetSources.rows;
const observationByRef = new Map(bindings.map((binding) => [binding.sourceRef, binding]));
let selectionSource = 'packet_source_ref';
let selected: typeof bindings = [];
let missingFromWorkspaceObservation = 0;
let ambiguousSourceRefs = packetRows.filter((row) => Number(row.graphify_rows) > 1).length;
if (explicitSelectionPath) {
  const selection = JSON.parse(await readFile(explicitSelectionPath, 'utf8')) as Record<string, unknown>;
  if (selection.status !== 'APPROVED_FOR_LINEAGE_RESOLUTION' || selection.selectionChecksum !== '349253cdef7ba59e0a90d7fde6bfdec8526b6f4e1dbc9fb17797c9bd6120b79a' || !Array.isArray(selection.approvedPairs) || selection.approvedPairs.length !== 6) {
    throw new Error('GRAPHIFY_SOURCE_BATCH_APPROVED_SELECTION_INVALID');
  }
  selectionSource = explicitSelectionPath;
  const requestedRefs = selection.approvedPairs.map((pair) => String((pair as Record<string, unknown>).canonicalSourceRef ?? '').trim()).filter(Boolean);
  selected = requestedRefs.map((sourceRef) => observationByRef.get(sourceRef)).filter((binding): binding is typeof bindings[number] => Boolean(binding)).slice(0, limit);
  missingFromWorkspaceObservation = requestedRefs.filter((sourceRef) => !observationByRef.has(sourceRef)).length;
  if (selected.length !== Math.min(limit, requestedRefs.length) || missingFromWorkspaceObservation > 0) throw new Error(`GRAPHIFY_SOURCE_BATCH_APPROVED_SELECTION_NOT_OBSERVED:${selected.length}:${requestedRefs.length}`);
} else {
  const repairRows = packetRows.filter((row) => Number(row.graphify_rows) === 0 || Number(row.workspace_revision_rows) === 0);
  selected = repairRows.map((row) => observationByRef.get(String(row.source_ref))).filter((binding): binding is typeof bindings[number] => Boolean(binding)).slice(0, limit);
  missingFromWorkspaceObservation = repairRows.filter((row) => Number(row.graphify_rows) === 0 && !observationByRef.has(String(row.source_ref))).length;
}
const selectionChecksum = createHash('sha256')
  .update(selected.map((binding) => `${binding.sourceRef}:${binding.sourceRevision}:${binding.contentDigest}`).join('\n'), 'utf8')
  .digest('hex');
await pool.end();
const plan: Record<string, unknown> = {
  schema: 'atlas.graphify-source-inventory-batch-v1',
  mode: apply ? 'APPLY_NON_PRODUCTION_BATCH' : 'DRY_RUN',
  readOnly: !apply,
  canonicalWriteAttempted: false,
  workspaceId: workspaceId || null,
  workspaceRevision: record.workspaceRevision,
  sourceManifestDigest: record.sourceManifestDigest,
  sourceManifestSourceCount: record.sourceCount,
  batchLimit: limit,
  selectionChecksum,
  selectionSource,
  packetSourceRefsConsidered: packetRows.length,
  alreadyPresent: packetRows.filter((row) => Number(row.graphify_rows) > 0).length,
  selectedMissingSources: selected.length,
  selectedRepairSources: selected.length,
  missingFromWorkspaceObservation,
  ambiguousSourceRefs,
  selectedSourceCount: selected.length,
  sourceRefs: selected.map((binding) => binding.sourceRef),
  records: selected.map((binding) => ({
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    contentDigest: binding.contentDigest,
    byteLength: binding.byteLength,
  })),
  nextGate: apply ? 'INDEPENDENT_READBACK' : 'EXPLICIT_NON_PRODUCTION_BATCH_APPLY',
};

if (apply) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 30_000 });
  try {
    await pool.query('BEGIN');
    const receipt = await writeGraphifySourceInventoryInTransactionV2({
      client: pool,
      workspaceId,
      record,
      bindings,
      selectedSourceRefs: selected.map((binding) => binding.sourceRef),
      parserContractVersion: 'graphify.revision-batch.v1',
      extractionContractVersion: 'graphify.source-inventory.batch.v1',
      configuration: { boundedBatch: true, batchLimit: limit, sourceManifestSourceCount: record.sourceCount },
    });
    await pool.query('COMMIT');
    const verifyPool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 30_000 });
    try {
      const readback = await verifyPool.query(
        `SELECT source_ref, content_hash, code_source_revision, byte_length,
                last_seen_run_id
           FROM public.graphify_files
          WHERE workspace_id = $1::uuid
            AND source_ref = ANY($2::text[])
          ORDER BY source_ref`,
        [workspaceId, selected.map((binding) => binding.sourceRef)],
      );
      const expectedByRef = new Map(selected.map((binding) => [binding.sourceRef, binding]));
      const readbackRefs = new Set(readback.rows.map((row) => String(row.source_ref)));
      const readbackMatched = readback.rows.filter((row) => {
        const expected = expectedByRef.get(String(row.source_ref));
        return expected
          && String(row.content_hash).replace(/^sha256:/i, '').toLowerCase() === expected.contentDigest
          && String(row.code_source_revision) === expected.sourceRevision
          && Number(row.byte_length) === expected.byteLength;
      }).length;
      if (readbackRefs.size !== selected.length || readbackMatched !== selected.length) {
        throw new Error(`GRAPHIFY_SOURCE_BATCH_READBACK_SELECTION_MISMATCH:${readbackMatched}:${selected.length}`);
      }
      const persistedCount = readbackMatched;
      plan.canonicalWriteAttempted = true;
      plan.durableMutationCommitted = true;
      plan.runId = receipt.runId;
      plan.persistedSourceCount = persistedCount;
      plan.readbackSelectionMatched = true;
      plan.independentReadbackVerified = true;
    } finally {
      await verifyPool.end();
    }
  } catch (error) {
    try { await pool.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    await pool.end();
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: apply ? 'GRAPHIFY_SOURCE_BATCH_APPLIED' : 'GRAPHIFY_SOURCE_BATCH_DRY_RUN',
  workspaceRevision: record.workspaceRevision,
  sourceManifestSourceCount: record.sourceCount,
  selectedSourceCount: selected.length,
  canonicalWriteAttempted: plan.canonicalWriteAttempted,
  independentReadbackVerified: plan.independentReadbackVerified ?? false,
  output: outputPath,
}, null, 2));
