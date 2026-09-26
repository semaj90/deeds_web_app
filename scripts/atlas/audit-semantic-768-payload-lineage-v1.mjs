#!/usr/bin/env node
/** Read-only audit for revision-qualified semantic_768 projection payloads. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { validateSemantic768Payload } from './lib/qdrant-semantic-768-payload-v1.mjs';

const root = REPO_ROOT;
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const limit = Math.max(1, Math.min(128, Number(arg('limit', 16))));
const workspaceRevision = arg('workspace-revision', null);
const reportPath = path.resolve(root, String(arg('out', 'docs/reports/semantic-768-payload-lineage-v1.json')));
const admittedPath = path.join(root, 'docs/reports/graphify-workspace-snapshot-binding-v1.json');
let admitted = null;
try { admitted = JSON.parse(fs.readFileSync(admittedPath, 'utf8')).admittedWorkspaceRevision ?? null; } catch { /* report is optional */ }
const expectedWorkspaceRevision = workspaceRevision ?? admitted;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const report = {
  schema: 'atlas.semantic-768-payload-lineage.v1',
  mode: 'READ_ONLY_DRY_RUN',
  expectedWorkspaceRevision,
  source: 'codebase_chunk_index.content_embedding_768',
  representationId: 'semantic_768',
  dimension: 768,
  selected: 0,
  valid: 0,
  eligibleForProjection: 0,
  missingWorkspaceId: 0,
  missingWorkspaceRevision: 0,
  missingSourceRevision: 0,
  missingPacketKey: 0,
  missingChunkId: 0,
  missingContentHash: 0,
  mixedWorkspaceRevision: 0,
  errors: [],
  writesPerformed: false,
  canonicalAuthority: false,
};
try {
  if (!expectedWorkspaceRevision || !/^sha256:[0-9a-f]{64}$/i.test(expectedWorkspaceRevision)) {
    report.errors.push('ADMITTED_WORKSPACE_REVISION_REQUIRED');
  }
  const result = await pool.query(`
    SELECT id::text, qdrant_id::text, source_ref, repo_id, chunk_id::text,
           content_hash, embedding_model, metadata
    FROM public.codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    ORDER BY id
    LIMIT $1
  `, [limit]);
  report.selected = result.rows.length;
  const workspaceRevisions = new Set();
  for (const row of result.rows) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const payload = {
      schema_version: 'atlas.semantic-768-qdrant-payload.v1',
      canonical_id: row.id,
      packet_key: metadata.packet_key ?? null,
      workspace_id: metadata.workspace_id ?? null,
      workspace_revision: metadata.workspace_revision ?? null,
      repository_id: row.repo_id ?? null,
      source_ref: row.source_ref ?? null,
      source_revision: metadata.source_revision ?? null,
      content_hash: row.content_hash ?? null,
      chunk_id: row.chunk_id ?? null,
      representation_id: 'semantic_768',
      representation_revision: 'semantic_768@v1',
      embedding_dimension: 768,
      model_revision: row.embedding_model ?? metadata.embedding_model ?? 'embeddinggemma:latest',
      projection_revision: 'graphify-content-768-v1',
    };
    const result = validateSemantic768Payload(payload, { workspaceRevision: expectedWorkspaceRevision });
    if (result.valid) report.valid += 1;
    else {
      for (const error of result.errors) {
        if (error.startsWith('workspace_id:')) report.missingWorkspaceId += 1;
        if (error.startsWith('workspace_revision:')) report.missingWorkspaceRevision += 1;
        if (error.startsWith('source_revision:')) report.missingSourceRevision += 1;
        if (error.startsWith('packet_key:')) report.missingPacketKey += 1;
        if (error.startsWith('chunk_id:')) report.missingChunkId += 1;
        if (error.startsWith('content_hash:')) report.missingContentHash += 1;
      }
    }
    if (payload.workspace_revision) workspaceRevisions.add(payload.workspace_revision);
  }
  report.mixedWorkspaceRevision = workspaceRevisions.size > 1 ? workspaceRevisions.size : 0;
  report.eligibleForProjection = report.selected > 0 && report.valid === report.selected && report.mixedWorkspaceRevision === 0;
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  await pool.end();
}
const temp = `${reportPath}.${process.pid}.partial`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temp, reportPath);
console.log(JSON.stringify({ status: report.eligibleForProjection ? 'SEMANTIC_768_PAYLOAD_DRY_RUN_ELIGIBLE' : 'SEMANTIC_768_PAYLOAD_LINEAGE_BLOCKED', ...report, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
