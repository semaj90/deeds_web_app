#!/usr/bin/env tsx
// GRAPHIFY-LIFECYCLE-OWNER-01 follow-up: a genuine, production-capable, full-corpus
// graphify_runs/graphify_files writer. Distinct from the two existing non-production canary
// scripts (apply-current-source-graphify-batch-v1.mts, frozen to 111 files;
// apply-graphify-source-inventory-batch-v1.mts, capped at 128 files) -- those are deliberately
// blocked from production and stay untouched. This script batches
// writeGraphifySourceInventoryV2 (already-proven, unmodified) across the REAL corpus
// (docs/reports/workspace-source-binding-observation.json, currently 25,258 files), one
// transaction per batch rather than one 25K-row transaction, then closes the run with the
// already-proven completeGraphifyRunV2. Dry-run (plan only, no writes) unless --apply is passed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
} from '$lib/server/atlas/identity/workspace-source-binding-v1.js';
import {
  writeGraphifySourceInventoryV2,
  completeGraphifyRunV2,
} from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v2.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const OBSERVATION_PATH = path.resolve(REPO_ROOT, process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT ?? 'docs/reports/workspace-source-binding-observation.json');
const REPORT_PATH = path.resolve(REPO_ROOT, 'docs/reports/full-corpus-graphify-inventory-apply-v1.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const APPLY = args.includes('--apply');
const WORKSPACE_ID = flag('workspace-id')?.trim() ?? '';
const CONFIRM = flag('confirm');
const BATCH_SIZE = Math.max(1, Math.min(2000, Number(flag('batch-size') ?? 1000)));
const LIMIT = flag('limit') ? Math.max(1, Number(flag('limit'))) : null;
const CONFIRM_STRING = 'AUTHORIZE_FULL_CORPUS_GRAPHIFY_PRODUCTION_APPLY_V1';

if (!UUID_RE.test(WORKSPACE_ID)) throw new Error('FULL_CORPUS_GRAPHIFY_WORKSPACE_UUID_REQUIRED');
if (APPLY && CONFIRM !== CONFIRM_STRING) throw new Error(`FULL_CORPUS_GRAPHIFY_CONFIRMATION_REQUIRED:${CONFIRM_STRING}`);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const observation = JSON.parse(await readFile(OBSERVATION_PATH, 'utf8')) as Record<string, unknown>;
const record = workspaceRevisionRecordV1Schema.parse(observation.record);
const allBindings = (Array.isArray(observation.bindings) ? observation.bindings : [])
  .map((item) => workspaceSourceBindingV1Schema.parse(item));
if (!allBindings.length) throw new Error('FULL_CORPUS_GRAPHIFY_OBSERVATION_HAS_NO_BINDINGS');

const bindings = LIMIT ? allBindings.slice(0, LIMIT) : allBindings;
const sourceRefs = bindings.map((b) => b.sourceRef);
const batches: string[][] = [];
for (let i = 0; i < sourceRefs.length; i += BATCH_SIZE) batches.push(sourceRefs.slice(i, i + BATCH_SIZE));

const plan = {
  status: APPLY ? 'FULL_CORPUS_GRAPHIFY_APPLY_PLANNED' : 'FULL_CORPUS_GRAPHIFY_DRY_RUN_PLANNED',
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  workspaceId: WORKSPACE_ID,
  workspaceRevision: record.workspaceRevision,
  repositoryRevision: record.baseCommitOid,
  dirty: record.dirty,
  totalSourceCount: allBindings.length,
  selectedSourceCount: sourceRefs.length,
  batchSize: BATCH_SIZE,
  batchCount: batches.length,
  limit: LIMIT,
};

if (!APPLY) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 180_000 });
let runId: string | null = null;
const batchReceipts: Array<{ batchIndex: number; selectedSourceCount: number; writtenSourceCount: number }> = [];
try {
  for (let i = 0; i < batches.length; i++) {
    const batchRefs = batches[i]!;
    const receipt = await writeGraphifySourceInventoryV2({
      client: pool,
      workspaceId: WORKSPACE_ID,
      record,
      bindings,
      selectedSourceRefs: batchRefs,
      parserContractVersion: 'graphify.full-corpus.v1',
      extractionContractVersion: 'graphify.source-inventory.full-corpus.v1',
      configuration: {
        fullCorpus: true,
        batchIndex: i,
        batchCount: batches.length,
        totalSourceCount: allBindings.length,
      },
    });
    if (!runId) runId = receipt.runId;
    if (receipt.runId !== runId) throw new Error(`FULL_CORPUS_GRAPHIFY_RUN_ID_DRIFTED_BETWEEN_BATCHES:${i}`);
    if (receipt.writtenSourceCount !== batchRefs.length) throw new Error(`FULL_CORPUS_GRAPHIFY_BATCH_UNDERWRITE:${i}:${receipt.writtenSourceCount}:${batchRefs.length}`);
    batchReceipts.push({ batchIndex: i, selectedSourceCount: batchRefs.length, writtenSourceCount: receipt.writtenSourceCount });
    console.log(JSON.stringify({ event: 'batch_complete', batchIndex: i, batchCount: batches.length, writtenSourceCount: receipt.writtenSourceCount, runId }));
  }
  if (!runId) throw new Error('FULL_CORPUS_GRAPHIFY_NO_BATCHES_EXECUTED');

  // Independent readback: total graphify_files rows for this run must equal what was selected.
  const totalReadback = await pool.query(
    `SELECT count(*)::int AS n FROM public.graphify_files WHERE last_seen_run_id = $1::uuid`,
    [runId],
  );
  const totalWritten = Number(totalReadback.rows[0]?.n ?? 0);
  if (totalWritten !== sourceRefs.length) {
    throw new Error(`FULL_CORPUS_GRAPHIFY_TOTAL_READBACK_MISMATCH:${totalWritten}:${sourceRefs.length}`);
  }

  const completion = await completeGraphifyRunV2({ client: pool, runId, workspaceId: WORKSPACE_ID });

  const report = {
    ...plan,
    runId,
    batchReceipts,
    totalWrittenReadback: totalWritten,
    completion,
    status: 'FULL_CORPUS_GRAPHIFY_APPLY_PROVEN',
  };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, runId, totalWritten, completion }, null, 2));
} finally {
  await pool.end();
}
