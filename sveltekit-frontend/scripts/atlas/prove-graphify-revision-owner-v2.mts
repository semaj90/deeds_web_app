#!/usr/bin/env tsx

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { deriveGraphifyRevisionAuthorityV2 } from '$lib/server/atlas/indexing/graphify-revision-authority-v2.js';
import { classifyGraphifyRevisionOwnerV2 } from '$lib/server/atlas/indexing/graphify-revision-owner-v2.js';
import { classifyGraphifySourceInventorySchemaV2 } from '$lib/server/atlas/indexing/graphify-source-inventory-schema-v2.js';

await loadAtlasEnv();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.graphify-revision-owner-v2.proof.v1';
const WRITER_RELATIVE = 'sveltekit-frontend/scripts/atlas/materialize-graphify-source-inventory-v3.mts';
const WRITER = path.resolve(REPO_ROOT, WRITER_RELATIVE);
const SAMPLE_SOURCE = path.resolve(REPO_ROOT, process.env.ATLAS_CODE_REVISION_CANARY_SOURCE ?? 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts');
const OUTPUT = path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_REVISION_OWNER_V2_OUT ?? 'docs/reports/graphify-revision-owner-v2.json');
if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

async function writerObservation() {
  try {
    await access(WRITER);
    const source = await readFile(WRITER, 'utf8');
    const v2Compatible = source.includes('code_source_revision')
      && source.includes('graphify_runs')
      && source.includes('workspace_id')
      && source.includes('source_manifest_digest');
    return { present: true, v2Compatible };
  } catch {
    return { present: false, v2Compatible: false };
  }
}

const sourceRef = path.relative(REPO_ROOT, SAMPLE_SOURCE).replaceAll('\\', '/');
const boundedSourceScope = process.env.ATLAS_REVISION_OWNER_FULL_SCAN === 'true'
  ? undefined
  : [sourceRef];
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: PRODUCER_REVISION,
  sourceRefs: boundedSourceScope,
});
const binding = origin.bindings.find((item) => item.sourceRef === sourceRef);
if (!binding) throw new Error(`GRAPHIFY_REVISION_OWNER_SAMPLE_NOT_IN_MANIFEST:${sourceRef}`);
const authority = deriveGraphifyRevisionAuthorityV2({ workspaceRoot: REPO_ROOT, absoluteSourcePath: SAMPLE_SOURCE, workspaceRecord: origin.record, sourceBinding: binding, producerRevision: PRODUCER_REVISION, canonicalWritesAllowed: false });
const writer = await writerObservation();

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
await pool.query('BEGIN READ ONLY');
try {
  const tables = await pool.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('graphify_runs','graphify_files')`);
  const tableNames = new Set(tables.rows.map((row) => row.table_name));
  const columns = await pool.query<{ table_name: string; column_name: string }>(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('graphify_runs','graphify_files')`);
  const schema = classifyGraphifySourceInventorySchemaV2({
    graphifyRunsPresent: tableNames.has('graphify_runs'),
    graphifyFilesPresent: tableNames.has('graphify_files'),
    runColumns: columns.rows.filter((row) => row.table_name === 'graphify_runs').map((row) => row.column_name),
    fileColumns: columns.rows.filter((row) => row.table_name === 'graphify_files').map((row) => row.column_name),
  });

  let persistedMatchingRows = 0;
  if (schema.v2Ready) {
    const matching = await pool.query<{ matches: number }>(`
      SELECT COUNT(*)::integer AS matches
      FROM public.graphify_files gf
      JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
      WHERE replace(gf.source_ref, '\\', '/') = $1
        AND lower(gr.repository_revision) = lower($2)
        AND gr.workspace_revision = $3
        AND lower(gr.source_manifest_digest) = lower($4)
        AND gf.code_source_revision = $5
        AND lower(replace(gf.content_hash, 'sha256:', '')) = lower($6)
        AND gf.byte_length = $7
    `, [authority.sourceRef, authority.baseGitCommitOid, authority.workspaceRevision, authority.workspaceSourceManifestDigest, authority.sourceRevision, authority.sourceContentDigest, authority.sourceByteLength]);
    persistedMatchingRows = Number(matching.rows[0]?.matches ?? 0);
  }

  const receipt = classifyGraphifyRevisionOwnerV2({
    authority,
    storage: {
      graphifyRunsPresent: schema.graphifyRunsPresent,
      graphifyFilesPresent: schema.graphifyFilesPresent,
      requiredRunColumnsPresent: schema.requiredRunColumnsPresent,
      requiredFileColumnsPresent: schema.requiredFileColumnsPresent,
      logicalWorkspaceRevisionColumnsPresent: schema.runColumns.includes('workspace_revision') && schema.runColumns.includes('source_manifest_digest'),
      logicalCodeSourceRevisionColumnPresent: schema.fileColumns.includes('code_source_revision'),
      productionWriterPath: writer.present ? WRITER_RELATIVE : null,
      productionWriterPresent: writer.present,
      productionWriterCreatesWorkspaceRevision: writer.v2Compatible,
      productionWriterCreatesSourceRevision: writer.v2Compatible,
      persistedMatchingRows,
      notes: [
        'Read-only independent v2 proof; no canonical write attempted.',
        writer.v2Compatible ? 'Current V3 materializer statically references the v2 two-table authority coordinates.' : 'Current V3 materializer is not statically compatible with the v2 two-table authority contract.',
      ],
    },
    producerRevision: PRODUCER_REVISION,
  });

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ ...receipt, schemaObservation: schema, workspaceOrigin: { record: origin.record, skipped: origin.skipped }, boundedSourceScope: boundedSourceScope ?? null }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: receipt.status, workspaceRevision: authority.workspaceRevision, sourceRevision: authority.sourceRevision, sourceRef: authority.sourceRef, boundedSourceScope: boundedSourceScope ?? null, schemaV2Ready: schema.v2Ready, productionWriterPresent: writer.present, productionWriterV2Compatible: writer.v2Compatible, persistedMatchingRows, revisionOwnerProven: receipt.revisionOwnerProven, fanoutMayConsumeAsCanonical: receipt.fanoutMayConsumeAsCanonical, blockers: receipt.blockers, canonicalWriteAttempted: false, output: OUTPUT }, null, 2));
  if (!receipt.revisionOwnerProven) process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
