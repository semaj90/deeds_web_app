#!/usr/bin/env tsx

import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
} from '$lib/server/atlas/identity/workspace-source-binding-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const OUT = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_CODE_REVISION_OWNER_CANARY_OUT
    ?? 'docs/reports/code-revision-owner-canary.json',
);
const OBSERVATION_PATH = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT
    ?? 'docs/reports/workspace-source-binding-observation.json',
);
const WRITER_PATH = path.resolve(
  REPO_ROOT,
  'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts',
);
const SELECTED_SOURCE = process.env.ATLAS_GRAPHIFY_CANARY_SOURCE?.replaceAll('\\', '/') || null;

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

async function exists(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

async function writeReport(report: Record<string, unknown>) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, output: path.relative(REPO_ROOT, OUT) }, null, 2));
}

let record = null as ReturnType<typeof workspaceRevisionRecordV1Schema.parse> | null;
let bindings: Array<ReturnType<typeof workspaceSourceBindingV1Schema.parse>> = [];
let observationPresent = false;
try {
  const observation = JSON.parse(await readFile(OBSERVATION_PATH, 'utf8')) as Record<string, unknown>;
  record = workspaceRevisionRecordV1Schema.parse(observation.record);
  bindings = (Array.isArray(observation.bindings) ? observation.bindings : [])
    .map((item) => workspaceSourceBindingV1Schema.parse(item));
  observationPresent = bindings.length > 0;
} catch {
  observationPresent = false;
}

const writerPresent = await exists(WRITER_PATH);
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

await pool.query('BEGIN READ ONLY');
try {
  const schema = await pool.query(`
    SELECT
      to_regclass('public.graphify_runs') IS NOT NULL AS runs_present,
      to_regclass('public.graphify_files') IS NOT NULL AS files_present,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='graphify_runs' AND column_name='workspace_revision'
      ) AS workspace_revision_present,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='graphify_runs' AND column_name='source_manifest_digest'
      ) AS source_manifest_digest_present,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='graphify_files' AND column_name='code_source_revision'
      ) AS code_source_revision_present
  `);
  const schemaRow = schema.rows[0] ?? {};
  const schemaReady = Boolean(
    schemaRow.runs_present
    && schemaRow.files_present
    && schemaRow.workspace_revision_present
    && schemaRow.source_manifest_digest_present
    && schemaRow.code_source_revision_present
  );

  let selectedBinding = null as (typeof bindings)[number] | null;
  if (observationPresent && record) {
    selectedBinding = SELECTED_SOURCE
      ? bindings.find((item) => item.sourceRef === SELECTED_SOURCE) ?? null
      : bindings[0] ?? null;
  }

  let persistedMatchingRows = 0;
  let matchingRows: Array<Record<string, unknown>> = [];
  if (schemaReady && record && selectedBinding) {
    const matched = await pool.query(`
      SELECT
        gr.workspace_id::text AS workspace_id,
        gr.run_id::text AS run_id,
        gr.repository_revision,
        gr.workspace_revision,
        gr.source_manifest_digest,
        gf.file_id::text AS file_id,
        replace(gf.source_ref, '\\', '/') AS source_ref,
        gf.source_revision AS legacy_source_revision,
        gf.content_hash,
        gf.code_source_revision,
        gf.byte_length
      FROM public.graphify_files gf
      JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
      WHERE gr.workspace_revision = $1
        AND lower(gr.source_manifest_digest) = lower($2)
        AND gr.repository_revision = $3
        AND replace(gf.source_ref, '\\', '/') = $4
        AND gf.code_source_revision = $5
        AND lower(gf.content_hash) IN (lower($6), lower('sha256:' || $6))
        AND gf.byte_length = $7
    `, [
      record.workspaceRevision,
      record.sourceManifestDigest,
      record.baseCommitOid,
      selectedBinding.sourceRef,
      selectedBinding.sourceRevision,
      selectedBinding.contentDigest,
      selectedBinding.byteLength,
    ]);
    persistedMatchingRows = matched.rowCount ?? matched.rows.length;
    matchingRows = matched.rows;
  }

  let status:
    | 'REVISION_OWNER_NOT_READY'
    | 'REVISION_ORIGIN_OBSERVATION_REQUIRED'
    | 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND'
    | 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY'
    | 'REVISION_OWNER_PROVEN';

  if (!schemaReady) status = 'REVISION_OWNER_NOT_READY';
  else if (!observationPresent || !record || !selectedBinding) status = 'REVISION_ORIGIN_OBSERVATION_REQUIRED';
  else if (!writerPresent) status = 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND';
  else if (persistedMatchingRows < 1) status = 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY';
  else status = 'REVISION_OWNER_PROVEN';

  const revisionOwnerProven = status === 'REVISION_OWNER_PROVEN';
  const report = {
    schemaVersion: 'atlas.code-revision-owner-canary.v2',
    status,
    readOnly: true,
    canonicalWriteAttempted: false,
    storageSemantics: 'GRAPHIFY_REVISION_AUTHORITY_V2',
    sourceRevisionAuthorityField: 'code_source_revision',
    legacySourceRevisionField: 'source_revision',
    legacySourceRevisionSemantics: 'GIT_PROVENANCE_ONLY',
    workspaceRevisionAuthorityField: 'workspace_revision',
    workspaceRevisionAlgorithm: 'sha256:<sorted exact-byte source manifest>',
    observationPresent,
    observationPath: path.relative(REPO_ROOT, OBSERVATION_PATH),
    writerPresent,
    productionWriterPath: writerPresent ? path.relative(REPO_ROOT, WRITER_PATH) : null,
    schemaReady,
    tables: {
      graphify_runs: Boolean(schemaRow.runs_present),
      graphify_files: Boolean(schemaRow.files_present),
    },
    columns: {
      workspace_revision: Boolean(schemaRow.workspace_revision_present),
      source_manifest_digest: Boolean(schemaRow.source_manifest_digest_present),
      code_source_revision: Boolean(schemaRow.code_source_revision_present),
    },
    selectedSourceRef: selectedBinding?.sourceRef ?? null,
    expectedWorkspaceRevision: record?.workspaceRevision ?? null,
    expectedSourceManifestDigest: record?.sourceManifestDigest ?? null,
    expectedRepositoryRevision: record?.baseCommitOid ?? null,
    expectedCodeSourceRevision: selectedBinding?.sourceRevision ?? null,
    expectedContentDigest: selectedBinding?.contentDigest ?? null,
    expectedByteLength: selectedBinding?.byteLength ?? null,
    persistedMatchingRows,
    matchingRows,
    durableOwnerBound: schemaReady && writerPresent,
    revisionOwnerProven,
    fanoutMayConsumeAsCanonical: revisionOwnerProven,
    nextGate: revisionOwnerProven
      ? 'GRAPH_SNAPSHOT_LINEAGE_AND_QDRANT_IDENTITY_ALIGNMENT'
      : status === 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY'
        ? 'ONE_CONTROLLED_NON_PRODUCTION_PERSISTENCE_READBACK'
        : status === 'REVISION_ORIGIN_OBSERVATION_REQUIRED'
          ? 'RUN_WORKSPACE_SOURCE_BINDING_OBSERVER'
          : status === 'REVISION_OWNER_NOT_READY'
            ? 'APPLY_GRAPHIFY_REVISION_AUTHORITY_V2_TO_NON_PRODUCTION_PROOF_DB'
            : 'BIND_CANONICAL_GRAPHIFY_SOURCE_INVENTORY_WRITER',
  };

  await writeReport(report);
  if (!revisionOwnerProven) process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
