#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
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
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const OBSERVATION_PATH = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT
    ?? 'docs/reports/workspace-source-binding-observation.json',
);
const APPLY = process.env.ATLAS_GRAPHIFY_REVISION_CANARY === '1';
const COMMIT = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT === '1';
const WORKSPACE_ID = process.env.ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID?.trim() || null;
const SELECTED_SOURCE = process.env.ATLAS_GRAPHIFY_CANARY_SOURCE?.replaceAll('\\', '/') || null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
if (process.env.NODE_ENV === 'production') throw new Error('GRAPHIFY_REVISION_CANARY_REFUSES_PRODUCTION');
if (APPLY && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('GRAPHIFY_REVISION_CANARY_NON_PRODUCTION_DATABASE_REQUIRED');
if (COMMIT && !APPLY) throw new Error('GRAPHIFY_REVISION_CANARY_COMMIT_REQUIRES_APPLY');
if (COMMIT && process.env.ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT_CONFIRM !== 'I_UNDERSTAND_NON_PRODUCTION_COMMIT') throw new Error('GRAPHIFY_REVISION_CANARY_COMMIT_CONFIRMATION_REQUIRED');

let observationRaw: string;
try {
  observationRaw = await readFile(OBSERVATION_PATH, 'utf8');
} catch {
  console.log(JSON.stringify({
    status: 'WORKSPACE_SOURCE_BINDING_OBSERVATION_REQUIRED',
    canonicalWriteAttempted: false,
    requiredCommand: 'npx tsx scripts/atlas/observe-workspace-source-binding.mts',
    observationPath: path.relative(REPO_ROOT, OBSERVATION_PATH),
  }, null, 2));
  process.exit(3);
}

const observation = JSON.parse(observationRaw) as Record<string, unknown>;
const record = workspaceRevisionRecordV1Schema.parse(observation.record);
const bindingsRaw = Array.isArray(observation.bindings) ? observation.bindings : [];
const bindings = bindingsRaw.map((item) => workspaceSourceBindingV1Schema.parse(item));
if (!bindings.length) throw new Error('WORKSPACE_SOURCE_BINDING_OBSERVATION_HAS_NO_BINDINGS');

const selectedSourceRef = SELECTED_SOURCE ?? bindings[0]!.sourceRef;
if (!bindings.some((item) => item.sourceRef === selectedSourceRef)) {
  throw new Error(`GRAPHIFY_CANARY_SOURCE_NOT_IN_OBSERVATION:${selectedSourceRef}`);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

async function schemaReady(): Promise<boolean> {
  const result = await pool.query(`
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
  const row = result.rows[0] ?? {};
  return Boolean(
    row.runs_present
    && row.files_present
    && row.workspace_revision_present
    && row.source_manifest_digest_present
    && row.code_source_revision_present
  );
}

if (!(await schemaReady())) {
  console.log(JSON.stringify({
    status: 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
    workspaceRevision: record.workspaceRevision,
    selectedSourceRef,
    canonicalWriteAttempted: false,
    migration: 'drizzle/manual/20260822_graphify_revision_authority_v2.sql',
  }, null, 2));
  await pool.end();
  process.exit(3);
}

let workspaceId = WORKSPACE_ID;
if (!workspaceId) {
  const existing = await pool.query(`
    SELECT workspace_id::text AS workspace_id
      FROM public.graphify_runs
     ORDER BY started_at DESC
     LIMIT 1
  `);
  workspaceId = existing.rows[0]?.workspace_id ? String(existing.rows[0].workspace_id) : null;
}

if (!workspaceId) {
  console.log(JSON.stringify({
    status: 'GRAPHIFY_CANARY_WORKSPACE_ID_REQUIRED',
    workspaceRevision: record.workspaceRevision,
    selectedSourceRef,
    canonicalWriteAttempted: false,
    requiredEnv: 'ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID=<existing non-production workspace UUID>',
  }, null, 2));
  await pool.end();
  process.exit(3);
}

if (!UUID_RE.test(workspaceId)) {
  console.log(JSON.stringify({
    status: 'GRAPHIFY_CANARY_WORKSPACE_ID_INVALID',
    workspaceId,
    workspaceRevision: record.workspaceRevision,
    selectedSourceRef,
    canonicalWriteAttempted: false,
    requiredFormat: 'UUID_NON_PRODUCTION_WORKSPACE',
  }, null, 2));
  await pool.end();
  process.exit(3);
}

if (!APPLY) {
  console.log(JSON.stringify({
    status: 'READY_CANARY_DISABLED',
    workspaceId,
    workspaceRevision: record.workspaceRevision,
    selectedSourceRef,
    sourceRevision: bindings.find((item) => item.sourceRef === selectedSourceRef)!.sourceRevision,
    canonicalWriteAttempted: false,
    commitRequested: false,
  }, null, 2));
  await pool.end();
  process.exit(0);
}

await pool.query('BEGIN');
try {
  const receipt = await writeGraphifySourceInventoryInTransactionV2({
    client: pool,
    workspaceId,
    record,
    bindings,
    selectedSourceRefs: [selectedSourceRef],
    parserContractVersion: 'graphify.revision-canary.v2',
    extractionContractVersion: 'graphify.source-inventory.v2',
    configuration: {
      controlledCanary: true,
      observationChecksum: record.checksum,
      commitRequested: COMMIT,
    },
  });

  if (COMMIT) await pool.query('COMMIT');
  else await pool.query('ROLLBACK');

  // The writer performs independent SELECT readback inside the transaction.
  // Preserve that proof for rollback mode; committed mode additionally
  // verifies the rows from a separate connection after COMMIT.
  let independentReadbackVerified = receipt.readbackVerified;
  if (COMMIT) {
    const verificationPool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
    });
    try {
      const persistedRun = await verificationPool.query(
        `SELECT run_id, workspace_id, repository_revision, workspace_revision,
                source_manifest_digest, parser_contract_version,
                extraction_contract_version, dry_run
           FROM public.graphify_runs
          WHERE run_id = $1`,
        [receipt.runId],
      );
      const persistedFile = await verificationPool.query(
        `SELECT file_id, workspace_id, source_ref, source_revision,
                content_hash, code_source_revision, byte_length, last_seen_run_id
           FROM public.graphify_files
          WHERE file_id = $1`,
        [receipt.files[0]!.fileId],
      );
      const runRow = persistedRun.rows[0];
      const fileRow = persistedFile.rows[0];
      independentReadbackVerified = persistedRun.rowCount === 1
        && persistedFile.rowCount === 1
        && String(runRow?.run_id) === receipt.runId
        && String(runRow?.workspace_id) === workspaceId
        && String(runRow?.repository_revision) === receipt.repositoryRevision
        && String(runRow?.workspace_revision) === receipt.workspaceRevision
        && String(runRow?.source_manifest_digest) === receipt.sourceManifestDigest
        && String(runRow?.parser_contract_version) === receipt.parserContractVersion
        && String(runRow?.extraction_contract_version) === receipt.extractionContractVersion
        && !Boolean(runRow?.dry_run)
        && String(fileRow?.file_id) === receipt.files[0]!.fileId
        && String(fileRow?.workspace_id) === workspaceId
        && String(fileRow?.source_ref) === receipt.files[0]!.sourceRef
        && String(fileRow?.source_revision) === receipt.files[0]!.legacySourceRevision
        && String(fileRow?.code_source_revision) === receipt.files[0]!.sourceRevision
        && String(fileRow?.last_seen_run_id) === receipt.runId
        && Number(fileRow?.byte_length) === receipt.files[0]!.byteLength;
    } finally {
      await verificationPool.end();
    }
    if (!independentReadbackVerified) throw new Error('GRAPHIFY_REVISION_OWNER_INDEPENDENT_READBACK_FAILED');
  }

  console.log(JSON.stringify({
    status: COMMIT
      ? 'GRAPHIFY_REVISION_OWNER_CONTROLLED_PERSISTENCE_COMMITTED'
      : 'GRAPHIFY_REVISION_OWNER_WRITE_READBACK_PROVEN_ROLLED_BACK',
    workspaceId,
    workspaceRevision: receipt.workspaceRevision,
    sourceManifestDigest: receipt.sourceManifestDigest,
    selectedSourceRef,
    sourceRevision: receipt.files[0]?.sourceRevision,
    repositoryRevision: receipt.repositoryRevision,
    readbackVerified: receipt.readbackVerified,
    independentReadbackVerified,
    canonicalWriteAttempted: true,
    durableMutationCommitted: COMMIT,
  }, null, 2));
} catch (error) {
  try { await pool.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await pool.end();
}
