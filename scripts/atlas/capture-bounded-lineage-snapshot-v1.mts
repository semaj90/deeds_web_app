#!/usr/bin/env node
/** Read-only bounded source/chunk snapshot for PKT-LINEAGE-08A. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const arg = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const refsPath = arg('--source-refs-file');
if (!refsPath) throw new Error('BOUNDED_LINEAGE_SOURCE_REFS_REQUIRED: use --source-refs-file=<JSON array>');
const resolvedRefsPath = path.resolve(REPO_ROOT, refsPath);
const requestedRefs = JSON.parse(fs.readFileSync(resolvedRefsPath, 'utf8'));
if (!Array.isArray(requestedRefs) || requestedRefs.length === 0 || requestedRefs.some((value) => typeof value !== 'string' || !value.trim())) {
  throw new Error('BOUNDED_LINEAGE_SOURCE_REFS_INVALID: expected a non-empty JSON array of sourceRef strings');
}
const targetSourceRefs = [...new Set(requestedRefs.map((value: string) => value.trim().replaceAll('\\', '/')))].sort();
const digest = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stable = (value: unknown) => JSON.stringify(value, Object.keys(value as object).sort());
const reportPath = path.join(REPO_ROOT, 'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json');

let currentWorkspace: any = null;
let materializationError: string | null = null;
try {
  currentWorkspace = materializeWorkspaceRevisionOriginV1({
    workspaceRoot: REPO_ROOT,
    repositoryId: path.basename(REPO_ROOT),
    producerRevision: 'atlas.pkt-lineage-08.bounded-snapshot.v1',
  });
} catch (error) {
  materializationError = error instanceof Error ? error.message : String(error);
}

const bindingByRef = new Map<string, any>(currentWorkspace?.bindings?.map((binding: any) => [binding.sourceRef, binding]) ?? []);
const sourceBindings = targetSourceRefs.map((sourceRef) => bindingByRef.get(sourceRef) ?? null);
const missingSourceRefs = targetSourceRefs.filter((sourceRef, index) => !sourceBindings[index]);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let chunkRows: any[] = [];
let workspaceId: string | null = null;
let databaseError: string | null = null;
try {
  const workspace = await pool.query('SELECT id::text AS id FROM public.workspaces ORDER BY id LIMIT 1');
  workspaceId = workspace.rows[0]?.id ?? null;
  const columnsResult = await pool.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
  `);
  const columns = new Set(columnsResult.rows.map((row) => String(row.column_name)));
  const required = ['id', 'chunk_id', 'content_hash', 'relative_path'];
  const missingColumns = required.filter((column) => !columns.has(column));
  if (missingColumns.length > 0) throw new Error(`CHUNK_OWNER_SCHEMA_INCOMPLETE:${missingColumns.join(',')}`);
  const sourceRefExpression = columns.has('source_ref') ? 'source_ref' : 'NULL::text';
  const contentExpression = columns.has('content') ? 'content' : 'NULL::text';
  const result = await pool.query(`
    SELECT id::text AS chunk_row_id, chunk_id AS canonical_chunk_id,
           ${sourceRefExpression} AS authoritative_source_ref,
           relative_path, content_hash, ${contentExpression} AS chunk_content
      FROM public.codebase_chunk_index
     WHERE relative_path = ANY($1::text[]) OR source_ref = ANY($1::text[])
     ORDER BY relative_path, chunk_id, id
  `, [targetSourceRefs]);
  chunkRows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const chunks = chunkRows.map((row) => {
  const sourceRef = row.authoritative_source_ref ? String(row.authoritative_source_ref) : null;
  const joinRef = sourceRef ?? String(row.relative_path ?? '');
  const content = row.chunk_content == null ? null : String(row.chunk_content);
  return {
    sourceRef,
    joinRef,
    expectedRelativePath: row.relative_path == null ? null : String(row.relative_path),
    chunkRowId: row.chunk_row_id,
    canonicalChunkId: row.canonical_chunk_id,
    chunkContentHash: row.content_hash ?? null,
    chunkPreimageChecksum: content == null ? null : digest(Buffer.from(content, 'utf8')),
    namespaceStatus: sourceRef ? 'AUTHORITATIVE_SOURCE_REF' : 'RELATIVE_PATH_ONLY',
  };
});
const chunksByRef = new Map<string, any[]>();
for (const chunk of chunks) chunksByRef.set(chunk.joinRef, [...(chunksByRef.get(chunk.joinRef) ?? []), chunk]);
const bindings = targetSourceRefs.map((sourceRef, index) => {
  const binding = sourceBindings[index];
  const sourceChunks = chunksByRef.get(sourceRef) ?? [];
  return {
    sourceRef,
    sourceRevision: binding?.sourceRevision ?? null,
    contentDigest: binding?.contentDigest ?? null,
    byteLength: binding?.byteLength ?? null,
    chunkCount: sourceChunks.length,
    chunks: sourceChunks,
    status: !binding ? 'TARGET_SOURCE_MISSING'
      : sourceChunks.length === 0 ? 'TARGET_SOURCE_NO_CHUNKS'
        : sourceChunks.some((chunk) => chunk.namespaceStatus !== 'AUTHORITATIVE_SOURCE_REF') ? 'TARGET_SOURCE_NAMESPACE_MISSING'
          : 'BOUNDED_SOURCE_AND_CHUNK_OBSERVED',
  };
});
const invalid = bindings.filter((binding) => binding.status !== 'BOUNDED_SOURCE_AND_CHUNK_OBSERVED');
const targetSourceSetChecksum = digest(targetSourceRefs.join('\n'));
const receiptCore = {
  schema: 'atlas.bounded-lineage-snapshot.v1',
  scope: 'BOUNDED_SOURCE_SET',
  workspaceId,
  workspaceRevisionAtCapture: currentWorkspace?.record.workspaceRevision ?? null,
  workspaceRevisionRecordChecksum: currentWorkspace?.record.checksum ?? null,
  targetSourceRefs,
  targetSourceSetChecksum,
  targetCount: targetSourceRefs.length,
  bindings,
  namespaceAuthorityRef: workspaceId ? `workspace:${workspaceId}/workspace-source-bindings-v1` : null,
};
const receiptChecksum = digest(stable(receiptCore));
const report = {
  ...receiptCore,
  generatedAt: new Date().toISOString(),
  status: databaseError || materializationError ? 'BOUNDED_LINEAGE_SNAPSHOT_FAILED'
    : invalid.length === 0 && targetSourceRefs.length > 0 ? 'BOUNDED_LINEAGE_SNAPSHOT_PROVEN'
      : 'BOUNDED_LINEAGE_SNAPSHOT_BLOCKED',
  receiptChecksum,
  readOnly: true,
  canonicalAuthority: false,
  authorizationRequired: true,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  databaseError,
  materializationError,
  missingSourceRefs,
  chunkRowsObserved: chunks.length,
  sourceRefsWithAuthoritativeNamespace: bindings.filter((binding) => binding.status === 'BOUNDED_SOURCE_AND_CHUNK_OBSERVED').length,
  note: 'workspaceRevisionAtCapture records the frozen bounded observation; apply must revalidate only these target sources and chunk preimages.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, targetCount: report.targetCount, chunkRowsObserved: report.chunkRowsObserved, sourceRefsWithAuthoritativeNamespace: report.sourceRefsWithAuthoritativeNamespace, receiptChecksum, reportPath }, null, 2));
