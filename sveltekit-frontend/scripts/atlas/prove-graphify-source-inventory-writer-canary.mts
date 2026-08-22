#!/usr/bin/env tsx

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { writeGraphifySourceInventoryFileInTransactionV1 } from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v1.js';

await loadAtlasEnv();

if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({
    schema: 'atlas.graphify-source-inventory-writer-canary.v2',
    status: 'REFUSED_PRODUCTION',
    canonicalWriteAttempted: false,
  }, null, 2));
  process.exit(2);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.env.ATLAS_GRAPHIFY_REVISION_CANARY === '1';
const COMMIT = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT === '1';
const SOURCE = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_GRAPHIFY_REVISION_CANARY_SOURCE
    ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts',
);
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

async function resolveWorkspaceId(client: pg.PoolClient, repositoryRevision: string): Promise<string> {
  const explicit = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_WORKSPACE_ID?.trim();
  if (explicit) return explicit;
  const exact = await client.query(
    `SELECT workspace_id FROM graphify_runs
      WHERE lower(repository_revision) = lower($1)
      ORDER BY started_at DESC LIMIT 1`,
    [repositoryRevision],
  );
  if (exact.rowCount === 1) return String(exact.rows[0].workspace_id);
  const latest = await client.query(`SELECT workspace_id FROM graphify_runs ORDER BY started_at DESC LIMIT 1`);
  if (latest.rowCount === 1) return String(latest.rows[0].workspace_id);
  throw new Error('GRAPHIFY_CANARY_WORKSPACE_ID_REQUIRED');
}

async function main() {
  const origin = materializeWorkspaceRevisionOriginV1({
    workspaceRoot: REPO_ROOT,
    repositoryId: 'semaj90/deeds_web_app',
    producerRevision: 'atlas.graphify-source-inventory-writer-canary.v2',
  });
  const sourceRef = path.relative(REPO_ROOT, SOURCE).replaceAll('\\', '/');
  const binding = origin.bindings.find((item) => item.sourceRef === sourceRef);
  if (!binding) throw new Error(`GRAPHIFY_CANARY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${sourceRef}`);

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  const client = await pool.connect();
  try {
    const workspaceId = await resolveWorkspaceId(client, origin.record.baseCommitOid);

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = 'graphify_runs' AND column_name IN ('workspace_revision','source_manifest_digest'))
        OR (table_name = 'graphify_files' AND column_name = 'code_source_revision')
      )
    `);
    const present = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const required = [
      'graphify_runs.workspace_revision',
      'graphify_runs.source_manifest_digest',
      'graphify_files.code_source_revision',
    ];
    const missing = required.filter((column) => !present.has(column));
    if (missing.length > 0) {
      console.log(JSON.stringify({
        schema: 'atlas.graphify-source-inventory-writer-canary.v2',
        status: 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
        missingColumns: missing,
        canonicalWriteAttempted: false,
        migration: 'sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql',
      }, null, 2));
      process.exitCode = 1;
      return;
    }

    if (!APPLY) {
      console.log(JSON.stringify({
        schema: 'atlas.graphify-source-inventory-writer-canary.v2',
        status: 'READY_CANARY_DISABLED',
        workspaceRevision: origin.record.workspaceRevision,
        sourceManifestDigest: origin.record.sourceManifestDigest,
        baseGitCommitOid: origin.record.baseCommitOid,
        workspaceId,
        source: sourceRef,
        codeSourceRevision: binding.sourceRevision,
        canonicalWriteAttempted: false,
        enableWith: 'ATLAS_GRAPHIFY_REVISION_CANARY=1',
        durableCommitRequires: 'ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT=1',
      }, null, 2));
      return;
    }

    await client.query('BEGIN');
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1({
      client,
      workspaceId,
      workspaceRoot: REPO_ROOT,
      repositoryId: 'semaj90/deeds_web_app',
      absoluteSourcePath: SOURCE,
      parserContractVersion: 'graphify.parser.v0.1',
      extractionContractVersion: 'graphify.extractor.v0.1',
      producerRevision: 'atlas.graphify-source-inventory-writer-canary.v2',
      parserName: 'canary',
      parserVersion: 'v2',
    });

    const readback = await client.query(
      `SELECT gf.file_id, gf.source_ref, gf.source_revision, gf.code_source_revision,
              gf.content_hash, gf.byte_length,
              gr.repository_revision, gr.workspace_revision, gr.source_manifest_digest
         FROM graphify_files gf
         JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
        WHERE gf.file_id = $1 FOR UPDATE`,
      [receipt.fileId],
    );
    if (readback.rowCount !== 1) throw new Error('GRAPHIFY_CANARY_READBACK_MISSING');
    const row = readback.rows[0];
    if (String(row.source_ref).replaceAll('\\', '/') !== receipt.sourceRef) throw new Error('GRAPHIFY_CANARY_SOURCE_REF_MISMATCH');
    if (String(row.repository_revision).toLowerCase() !== receipt.repositoryRevision.toLowerCase()) throw new Error('GRAPHIFY_CANARY_GIT_PROVENANCE_MISMATCH');
    if (String(row.workspace_revision) !== receipt.workspaceRevision) throw new Error('GRAPHIFY_CANARY_WORKSPACE_REVISION_MISMATCH');
    if (String(row.source_manifest_digest).toLowerCase() !== receipt.sourceManifestDigest) throw new Error('GRAPHIFY_CANARY_SOURCE_MANIFEST_MISMATCH');
    if (String(row.code_source_revision) !== receipt.codeSourceRevision) throw new Error('GRAPHIFY_CANARY_CODE_SOURCE_REVISION_MISMATCH');
    if (String(row.content_hash).replace(/^sha256:/i, '').toLowerCase() !== receipt.sourceContentDigest) throw new Error('GRAPHIFY_CANARY_CONTENT_HASH_MISMATCH');
    if (Number(row.byte_length) !== receipt.sourceByteLength) throw new Error('GRAPHIFY_CANARY_BYTE_LENGTH_MISMATCH');

    if (COMMIT) await client.query('COMMIT');
    else await client.query('ROLLBACK');

    console.log(JSON.stringify({
      schema: 'atlas.graphify-source-inventory-writer-canary.v2',
      status: COMMIT
        ? 'GRAPHIFY_REVISION_OWNER_CONTROLLED_PERSISTENCE_COMMITTED'
        : 'GRAPHIFY_REVISION_OWNER_WRITE_READBACK_PROVEN_ROLLED_BACK',
      workspaceId,
      workspaceRevision: receipt.workspaceRevision,
      sourceManifestDigest: receipt.sourceManifestDigest,
      repositoryRevision: receipt.repositoryRevision,
      sourceRef: receipt.sourceRef,
      codeSourceRevision: receipt.codeSourceRevision,
      legacySourceRevision: receipt.legacySourceRevision,
      sourceContentDigest: receipt.sourceContentDigest,
      runReadbackVerified: receipt.runReadbackVerified,
      fileReadbackVerified: receipt.fileReadbackVerified,
      transactionCommitted: COMMIT,
      canonicalWriteAttempted: true,
      fanoutMayConsumeAsCanonical: false,
      nextProof: COMMIT
        ? 'rerun prove-code-revision-owner-canary.mts; require REVISION_OWNER_PROVEN'
        : 'commit only in the intended controlled non-production proof DB after review',
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
