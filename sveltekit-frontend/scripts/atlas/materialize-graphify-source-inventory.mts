#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const apply = process.argv.includes('--apply');
const sourceArgIndex = process.argv.indexOf('--source');
const requestedSource = sourceArgIndex >= 0 ? process.argv[sourceArgIndex + 1]?.replaceAll('\\','/') : null;
const limit = Math.max(1, Math.min(5000, Number(process.env.ATLAS_GRAPHIFY_SOURCE_LIMIT ?? (requestedSource ? 1 : 100))));
const out = path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_PLAN_OUT ?? 'docs/reports/graphify-source-inventory-plan.json');
const producerRevision = 'atlas.graphify-source-inventory-writer.v2';

if (apply && process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_APPLY !== '1') throw new Error('GRAPHIFY_SOURCE_INVENTORY_APPLY_CONFIRMATION_REQUIRED');
if (apply && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('GRAPHIFY_SOURCE_INVENTORY_NON_PRODUCTION_DATABASE_REQUIRED');

// Important: materialize the COMPLETE indexed source manifest before selecting
// a bounded write subset. `--source` / limit affect persistence scope only, not
// WorkspaceRevisionRecordV1 identity.
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision,
});

let selected = origin.bindings;
if (requestedSource) selected = selected.filter((binding) => binding.sourceRef === requestedSource);
else selected = selected.slice(0, limit);
if (selected.length === 0) throw new Error(`GRAPHIFY_SOURCE_INVENTORY_SELECTION_EMPTY:${requestedSource ?? limit}`);

const byRef = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
const records = selected.map((binding) => ({
  workspaceRevision: origin.record.workspaceRevision,
  sourceManifestDigest: origin.record.sourceManifestDigest,
  repositoryRevision: origin.record.baseCommitOid,
  legacyWorkspaceRevision: origin.record.baseCommitOid,
  sourceRef: binding.sourceRef,
  sourceRevision: binding.sourceRevision,
  legacySourceRevision: origin.record.baseCommitOid,
  contentHash: binding.contentDigest,
  byteLength: binding.byteLength,
  gitBlobOid: binding.gitBlobOid,
  sourceRevisionAuthority: 'code_source_revision',
  producerRevision,
}));

const plan = {
  schemaVersion: 'atlas.graphify-source-inventory-plan.v2',
  mode: apply ? 'APPLY_NON_PRODUCTION' : 'DRY_RUN',
  readOnly: !apply,
  canonicalWriteAttempted: false,
  durableOwnerBound: false,
  workspaceRevision: origin.record.workspaceRevision,
  sourceManifestDigest: origin.record.sourceManifestDigest,
  repositoryRevision: origin.record.baseCommitOid,
  fullManifestSourceCount: origin.bindings.length,
  selectedWriteCount: records.length,
  skippedSourceCount: origin.skipped.length,
  records,
  authority: {
    workspaceRevisionOwner: 'WorkspaceRevisionRecordV1',
    sourceRevisionOwner: 'CodeSourceRevisionV1',
    workspaceRevisionColumn: 'workspace_manifest_revision',
    sourceRevisionColumn: 'code_source_revision',
    legacyWorkspaceRevisionColumn: 'workspace_revision',
    legacySourceRevisionColumn: 'source_revision',
    repositoryRevisionColumn: 'repository_revision',
    contentDigestColumn: 'content_hash',
    gitCoordinatesAreProvenanceOnly: true,
  },
  nextGate: 'SINGLE_ROW_PERSISTENCE_READBACK_CANARY',
};

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

if (apply) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const columns = await pool.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='graphify_files'
      AND column_name IN ('workspace_manifest_revision','code_source_revision','repository_revision')
  `);
  const found = new Set(columns.rows.map((row) => row.column_name));
  const missing = ['workspace_manifest_revision','code_source_revision','repository_revision'].filter((column) => !found.has(column));
  if (missing.length > 0) {
    await pool.end();
    throw new Error(`GRAPHIFY_SOURCE_INVENTORY_REVISION_V2_MIGRATION_REQUIRED:${missing.join(',')}`);
  }

  await pool.query('BEGIN');
  try {
    for (const row of records) {
      const canonicalBinding = byRef.get(row.sourceRef);
      if (!canonicalBinding || canonicalBinding.sourceRevision !== row.sourceRevision) {
        throw new Error(`GRAPHIFY_SOURCE_BINDING_DRIFT:${row.sourceRef}`);
      }
      await pool.query(`
        INSERT INTO graphify_files
          (workspace_revision, workspace_manifest_revision, repository_revision,
           source_ref, source_revision, code_source_revision, content_hash,
           byte_length, git_blob_oid, source_revision_authority, producer_revision)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (workspace_manifest_revision, source_ref, code_source_revision)
          WHERE workspace_manifest_revision IS NOT NULL AND code_source_revision IS NOT NULL
        DO UPDATE SET
          repository_revision = EXCLUDED.repository_revision,
          workspace_revision = EXCLUDED.workspace_revision,
          source_revision = EXCLUDED.source_revision,
          content_hash = EXCLUDED.content_hash,
          byte_length = EXCLUDED.byte_length,
          git_blob_oid = EXCLUDED.git_blob_oid,
          source_revision_authority = EXCLUDED.source_revision_authority,
          producer_revision = EXCLUDED.producer_revision,
          updated_at = now()
      `, [
        row.legacyWorkspaceRevision, row.workspaceRevision, row.repositoryRevision,
        row.sourceRef, row.legacySourceRevision, row.sourceRevision, row.contentHash,
        row.byteLength, row.gitBlobOid, row.sourceRevisionAuthority, row.producerRevision,
      ]);
    }

    for (const row of records) {
      const readback = await pool.query<{
        workspace_manifest_revision: string; repository_revision: string | null;
        source_ref: string; code_source_revision: string | null; content_hash: string; byte_length: string | number;
      }>(`
        SELECT workspace_manifest_revision, repository_revision, source_ref,
               code_source_revision, content_hash, byte_length
        FROM graphify_files
        WHERE workspace_manifest_revision = $1 AND source_ref = $2 AND code_source_revision = $3
      `, [row.workspaceRevision, row.sourceRef, row.sourceRevision]);
      const persisted = readback.rows[0];
      if (!persisted
        || persisted.workspace_manifest_revision !== row.workspaceRevision
        || persisted.repository_revision !== row.repositoryRevision
        || persisted.source_ref !== row.sourceRef
        || persisted.code_source_revision !== row.sourceRevision
        || persisted.content_hash.toLowerCase() !== row.contentHash.toLowerCase()
        || Number(persisted.byte_length) !== row.byteLength) {
        throw new Error(`GRAPHIFY_SOURCE_INVENTORY_READBACK_FAILED:${row.sourceRef}`);
      }
    }
    await pool.query('COMMIT');
    plan.canonicalWriteAttempted = true;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: apply ? 'APPLIED_NON_PRODUCTION_READBACK_VERIFIED' : 'DRY_RUN_PROVEN',
  output: out,
  workspaceRevision: plan.workspaceRevision,
  repositoryRevision: plan.repositoryRevision,
  fullManifestSourceCount: plan.fullManifestSourceCount,
  selectedWriteCount: plan.selectedWriteCount,
  canonicalWriteAttempted: plan.canonicalWriteAttempted,
}, null, 2));
