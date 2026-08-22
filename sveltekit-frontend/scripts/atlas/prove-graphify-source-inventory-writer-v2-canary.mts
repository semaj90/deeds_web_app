#!/usr/bin/env tsx
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { writeGraphifySourceInventoryV2InTransaction } from '$lib/server/atlas/indexing/graphify-source-inventory-writer-v2.js';

await loadAtlasEnv();

if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({
    schema: 'atlas.graphify-source-inventory-v2-canary.v1',
    status: 'REFUSED_PRODUCTION',
    canonicalWriteAttempted: false,
  }, null, 2));
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../..');
const repoRoot = path.resolve(frontend, '..');
const databaseUrl = process.env.DATABASE_URL;
const apply = process.env.ATLAS_GRAPHIFY_REVISION_CANARY === '1';
const commit = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT === '1';
const source = path.resolve(
  repoRoot,
  process.env.ATLAS_GRAPHIFY_REVISION_CANARY_SOURCE
    ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v2.ts',
);
const workspaceId = process.env.ATLAS_GRAPHIFY_REVISION_CANARY_WORKSPACE_ID?.trim();

if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
if (commit && !apply) throw new Error('GRAPHIFY_CANARY_COMMIT_REQUIRES_APPLY');
if (apply && !workspaceId) throw new Error('GRAPHIFY_CANARY_WORKSPACE_ID_REQUIRED');

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${table}`]);
  return Boolean(result.rows[0]?.present);
}

async function countRows(client: pg.PoolClient, table: string): Promise<number | null> {
  if (!(await tableExists(client, table))) return null;
  const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM public.${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: repoRoot,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: 'atlas.graphify-source-inventory-v2-canary.v1',
});
const sourceRef = path.relative(repoRoot, source).replaceAll('\\', '/');
const binding = origin.bindings.find((item) => item.sourceRef === sourceRef);
if (!binding) throw new Error(`GRAPHIFY_CANARY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${sourceRef}`);

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 20_000,
});
const client = await pool.connect();

try {
  const requiredTables = [
    'graphify_workspace_revisions_v2',
    'graphify_source_revisions_v2',
  ];
  const missingTables: string[] = [];
  for (const table of requiredTables) if (!(await tableExists(client, table))) missingTables.push(table);

  if (missingTables.length > 0) {
    console.log(JSON.stringify({
      schema: 'atlas.graphify-source-inventory-v2-canary.v1',
      status: 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
      missingTables,
      canonicalWriteAttempted: false,
      legacyRowsMutated: false,
      migration: 'sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql',
    }, null, 2));
    process.exitCode = 1;
  } else if (!apply) {
    console.log(JSON.stringify({
      schema: 'atlas.graphify-source-inventory-v2-canary.v1',
      status: 'READY_CANARY_DISABLED',
      workspaceRevision: origin.record.workspaceRevision,
      sourceManifestDigest: origin.record.sourceManifestDigest,
      baseGitCommitOid: origin.record.baseCommitOid,
      source: sourceRef,
      codeSourceRevision: binding.sourceRevision,
      canonicalWriteAttempted: false,
      legacyRowsMutated: false,
      enableWith: 'ATLAS_GRAPHIFY_REVISION_CANARY=1',
      workspaceIdRequired: true,
    }, null, 2));
  } else {
    const legacyBefore = {
      graphifyRuns: await countRows(client, 'graphify_runs'),
      graphifyFiles: await countRows(client, 'graphify_files'),
    };
    const v2Before = {
      workspaceRevisions: await countRows(client, 'graphify_workspace_revisions_v2'),
      sourceRevisions: await countRows(client, 'graphify_source_revisions_v2'),
    };

    await client.query('BEGIN');
    try {
      const receipt = await writeGraphifySourceInventoryV2InTransaction({
        client,
        workspaceId: workspaceId!,
        workspaceRoot: repoRoot,
        repositoryId: 'semaj90/deeds_web_app',
        absoluteSourcePath: source,
        parserContractVersion: 'graphify.parser.v0.1',
        extractionContractVersion: 'graphify.extractor.v0.1',
        producerRevision: 'atlas.graphify-source-inventory-v2-canary.v1',
      });

      const legacyDuring = {
        graphifyRuns: await countRows(client, 'graphify_runs'),
        graphifyFiles: await countRows(client, 'graphify_files'),
      };
      if (legacyDuring.graphifyRuns !== legacyBefore.graphifyRuns || legacyDuring.graphifyFiles !== legacyBefore.graphifyFiles) {
        throw new Error(`GRAPHIFY_V2_CANARY_LEGACY_ROW_COUNT_CHANGED:${JSON.stringify({ legacyBefore, legacyDuring })}`);
      }

      if (commit) await client.query('COMMIT');
      else await client.query('ROLLBACK');

      const legacyAfter = {
        graphifyRuns: await countRows(client, 'graphify_runs'),
        graphifyFiles: await countRows(client, 'graphify_files'),
      };
      if (legacyAfter.graphifyRuns !== legacyBefore.graphifyRuns || legacyAfter.graphifyFiles !== legacyBefore.graphifyFiles) {
        throw new Error(`GRAPHIFY_V2_CANARY_LEGACY_ROW_COUNT_CHANGED_AFTER:${JSON.stringify({ legacyBefore, legacyAfter })}`);
      }

      const v2After = {
        workspaceRevisions: await countRows(client, 'graphify_workspace_revisions_v2'),
        sourceRevisions: await countRows(client, 'graphify_source_revisions_v2'),
      };

      if (!commit && (v2After.workspaceRevisions !== v2Before.workspaceRevisions || v2After.sourceRevisions !== v2Before.sourceRevisions)) {
        throw new Error(`GRAPHIFY_V2_CANARY_ROLLBACK_FAILED:${JSON.stringify({ v2Before, v2After })}`);
      }

      console.log(JSON.stringify({
        schema: 'atlas.graphify-source-inventory-v2-canary.v1',
        status: commit
          ? 'GRAPHIFY_REVISION_OWNER_V2_CONTROLLED_PERSISTENCE_COMMITTED'
          : 'GRAPHIFY_REVISION_OWNER_V2_WRITE_READBACK_PROVEN_ROLLED_BACK',
        transactionCommitted: commit,
        receipt,
        legacyBefore,
        legacyAfter,
        v2Before,
        v2After,
        legacyRowsMutated: false,
        legacyConstraintRemovalAttempted: false,
        canonicalWriteAttempted: true,
        fanoutMayConsumeAsCanonical: false,
        nextProof: commit
          ? 'run independent read-only v2 owner proof before FANOUT'
          : 'review receipt, then explicitly opt into one non-production committed canary',
      }, null, 2));
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
