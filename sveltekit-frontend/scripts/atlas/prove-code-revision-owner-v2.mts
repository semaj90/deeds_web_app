#!/usr/bin/env tsx
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { deriveCodeRevisionAuthorityV2 } from '$lib/server/atlas/indexing/code-revision-authority-v2.js';

await loadAtlasEnv();

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../..');
const repoRoot = path.resolve(frontend, '..');
const databaseUrl = process.env.DATABASE_URL;
const source = path.resolve(
  repoRoot,
  process.env.ATLAS_CODE_REVISION_CANARY_SOURCE
    ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v2.ts',
);
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: repoRoot,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: 'atlas.code-revision-owner-v2.proof.v1',
});
const sourceRef = path.relative(repoRoot, source).replaceAll('\\', '/');
const binding = origin.bindings.find((item) => item.sourceRef === sourceRef);
if (!binding) throw new Error(`CODE_REVISION_CANARY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${sourceRef}`);
const authority = deriveCodeRevisionAuthorityV2({
  workspaceRoot: repoRoot,
  absoluteSourcePath: source,
  workspaceRecord: origin.record,
  sourceBinding: binding,
  producerRevision: 'atlas.code-revision-owner-v2.proof.v1',
  canonicalWritesAllowed: false,
});

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});
const client = await pool.connect();

async function tableExists(table: string): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${table}`]);
  return Boolean(result.rows[0]?.present);
}

try {
  await client.query('BEGIN READ ONLY');

  const requiredTables = [
    'graphify_runs',
    'graphify_files',
    'graphify_workspace_revisions_v2',
    'graphify_source_revisions_v2',
  ];
  const missingTables: string[] = [];
  for (const table of requiredTables) if (!(await tableExists(table))) missingTables.push(table);

  const constraints = missingTables.length === 0
    ? await client.query(`
        SELECT conrelid::regclass::text AS table_name, conname
        FROM pg_constraint
        WHERE conrelid IN ('public.graphify_runs'::regclass, 'public.graphify_files'::regclass)
      `)
    : { rows: [] as Array<Record<string, unknown>> };
  const constraintNames = new Set(constraints.rows.map((row) => String(row.conname)));
  const legacyConstraintsObserved = {
    graphifyRunsHistoricalUnique: constraintNames.has('graphify_runs_workspace_id_repository_revision_parser_contract_version_key'),
    graphifyFilesHistoricalUnique: constraintNames.has('graphify_files_workspace_id_source_ref_source_revision_key'),
  };

  let workspaceMatches = 0;
  let sourceMatches = 0;
  if (missingTables.length === 0) {
    const workspace = await client.query(`
      SELECT COUNT(*)::integer AS matches
      FROM public.graphify_workspace_revisions_v2
      WHERE workspace_revision = $1
        AND source_manifest_digest = $2
        AND lower(repository_revision) = lower($3)
        AND repository_revision_role = 'GIT_PROVENANCE_ONLY'
    `, [
      authority.workspaceRevision,
      authority.workspaceSourceManifestDigest,
      authority.baseGitCommitOid,
    ]);
    workspaceMatches = Number(workspace.rows[0]?.matches ?? 0);

    const sourceRow = await client.query(`
      SELECT COUNT(*)::integer AS matches
      FROM public.graphify_source_revisions_v2
      WHERE workspace_revision = $1
        AND source_ref = $2
        AND code_source_revision = $3
        AND lower(content_hash) = lower($4)
        AND byte_length = $5
        AND lower(repository_revision) = lower($6)
        AND repository_revision_role = 'GIT_PROVENANCE_ONLY'
    `, [
      authority.workspaceRevision,
      authority.sourceRef,
      authority.sourceRevision,
      authority.sourceContentDigest,
      authority.sourceByteLength,
      authority.baseGitCommitOid,
    ]);
    sourceMatches = Number(sourceRow.rows[0]?.matches ?? 0);
  }

  const revisionOwnerProven =
    missingTables.length === 0
    && workspaceMatches === 1
    && sourceMatches === 1;

  const status = missingTables.length > 0
    ? 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED'
    : revisionOwnerProven
      ? 'REVISION_OWNER_PROVEN'
      : 'REVISION_OWNER_V2_PERSISTENCE_NOT_PROVEN';

  console.log(JSON.stringify({
    schema: 'atlas.code-revision-owner-v2-proof.v1',
    status,
    authority: {
      workspaceRevision: authority.workspaceRevision,
      sourceManifestDigest: authority.workspaceSourceManifestDigest,
      repositoryRevision: authority.baseGitCommitOid,
      sourceRef: authority.sourceRef,
      codeSourceRevision: authority.sourceRevision,
      contentHash: authority.sourceContentDigest,
      byteLength: authority.sourceByteLength,
    },
    missingTables,
    workspaceMatches,
    sourceMatches,
    legacyConstraintsObserved,
    destructiveMigrationRequired: false,
    canonicalWriteAttempted: false,
    readOnly: true,
    revisionOwnerProven,
    fanoutMayConsumeAsCanonical: revisionOwnerProven,
    note: 'Legacy constraint presence is reported for drift/safety evidence but is not required for v2 authority because v2 writes are isolated in additive sidecar tables.',
  }, null, 2));

  if (!revisionOwnerProven) process.exitCode = 3;
} finally {
  try { await client.query('ROLLBACK'); } catch {}
  client.release();
  await pool.end();
}
