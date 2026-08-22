#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from '$lib/server/atlas/indexing/graphify-workspace-manifest-completeness-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_PATH = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_GRAPHIFY_MANIFEST_COMPLETENESS_REPORT
    ?? 'docs/reports/graphify-workspace-manifest-completeness.json',
);
const PRODUCER_REVISION = 'atlas.graphify-workspace-manifest-completeness-proof.2026-08-22.v1';
const requestedWorkspaceId = process.env.ATLAS_GRAPHIFY_WORKSPACE_ID?.trim() || null;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: PRODUCER_REVISION,
});

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
let report: Record<string, unknown>;

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('graphify_runs', 'graphify_files')
    `);
    const runColumns = new Set(columns.rows.filter((row) => row.table_name === 'graphify_runs').map((row) => row.column_name));
    const fileColumns = new Set(columns.rows.filter((row) => row.table_name === 'graphify_files').map((row) => row.column_name));
    const requiredRunColumns = ['run_id','workspace_id','workspace_revision','source_manifest_digest','source_manifest_source_count'];
    const requiredFileColumns = ['workspace_id','source_ref','code_source_revision','content_hash','byte_length','last_seen_run_id'];
    const missingRunColumns = requiredRunColumns.filter((column) => !runColumns.has(column));
    const missingFileColumns = requiredFileColumns.filter((column) => !fileColumns.has(column));

    if (missingRunColumns.length || missingFileColumns.length) {
      report = {
        schema: 'atlas.graphify-workspace-manifest-completeness-proof.v1',
        status: 'GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED',
        complete: false,
        graphMayConsumeWorkspaceRevision: false,
        workspaceRevision: origin.record.workspaceRevision,
        sourceManifestDigest: origin.record.sourceManifestDigest,
        expectedSourceCount: origin.record.sourceCount,
        missingRunColumns,
        missingFileColumns,
        readOnly: true,
        canonicalWritesAttempted: false,
        producerRevision: PRODUCER_REVISION,
      };
      await client.query('ROLLBACK');
    } else {
      const params: unknown[] = [origin.record.workspaceRevision, origin.record.sourceManifestDigest];
      let workspaceFilter = '';
      if (requestedWorkspaceId) {
        params.push(requestedWorkspaceId);
        workspaceFilter = ` AND workspace_id = $${params.length}::uuid`;
      }
      const runs = await client.query<{
        run_id: string;
        workspace_id: string;
        workspace_revision: string;
        source_manifest_digest: string;
        source_manifest_source_count: number;
        repository_revision: string;
      }>(`
        SELECT run_id, workspace_id, workspace_revision, source_manifest_digest,
               source_manifest_source_count, repository_revision
        FROM graphify_runs
        WHERE workspace_revision = $1
          AND source_manifest_digest = $2
          ${workspaceFilter}
        ORDER BY started_at DESC, run_id DESC
        LIMIT 3
      `, params);

      if (runs.rowCount !== 1) {
        report = {
          schema: 'atlas.graphify-workspace-manifest-completeness-proof.v1',
          status: runs.rowCount === 0 ? 'PERSISTED_WORKSPACE_MANIFEST_NOT_FOUND' : 'PERSISTED_WORKSPACE_MANIFEST_AMBIGUOUS',
          complete: false,
          graphMayConsumeWorkspaceRevision: false,
          workspaceRevision: origin.record.workspaceRevision,
          sourceManifestDigest: origin.record.sourceManifestDigest,
          expectedSourceCount: origin.record.sourceCount,
          observedMatchingRuns: runs.rowCount,
          requestedWorkspaceId,
          readOnly: true,
          canonicalWritesAttempted: false,
          producerRevision: PRODUCER_REVISION,
        };
        await client.query('ROLLBACK');
      } else {
        const run = runs.rows[0];
        const sources = await client.query<{
          source_ref: string;
          code_source_revision: string;
          content_hash: string;
          byte_length: string | number;
          last_seen_run_id: string;
        }>(`
          SELECT source_ref, code_source_revision, content_hash, byte_length, last_seen_run_id
          FROM graphify_files
          WHERE workspace_id = $1::uuid
            AND last_seen_run_id = $2::uuid
          ORDER BY source_ref
        `, [run.workspace_id, run.run_id]);

        const receipt = evaluateGraphifyWorkspaceManifestCompletenessV1({
          workspaceRecord: origin.record,
          sourceBindings: origin.bindings,
          persistedRun: {
            runId: run.run_id,
            workspaceRevision: run.workspace_revision,
            sourceManifestDigest: run.source_manifest_digest,
            sourceManifestSourceCount: Number(run.source_manifest_source_count),
          },
          persistedSources: sources.rows.map((row) => ({
            sourceRef: row.source_ref,
            codeSourceRevision: row.code_source_revision,
            contentHash: row.content_hash.toLowerCase(),
            byteLength: Number(row.byte_length),
            lastSeenRunId: row.last_seen_run_id,
          })),
          producerRevision: PRODUCER_REVISION,
        });
        report = {
          schema: 'atlas.graphify-workspace-manifest-completeness-proof.v1',
          status: receipt.complete ? 'WORKSPACE_MANIFEST_COMPLETENESS_PROVEN' : receipt.status,
          ...receipt,
          workspaceId: run.workspace_id,
          repositoryRevisionObserved: run.repository_revision,
          currentGitProvenance: origin.record.baseCommitOid,
          gitProvenanceIsAuthority: false,
          skippedSourceCount: origin.skipped.length,
        };
        await client.query('ROLLBACK');
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report!, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report!.status,
  complete: report!.complete,
  graphMayConsumeWorkspaceRevision: report!.graphMayConsumeWorkspaceRevision,
  workspaceRevision: report!.workspaceRevision,
  expectedSourceCount: report!.expectedSourceCount,
  reportPath: REPORT_PATH,
  postgresWritesAttempted: false,
}, null, 2));
