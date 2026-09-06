#!/usr/bin/env node
/** Read-only exact namespace proposal for PKT-LINEAGE-08A. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const arg = process.argv.find((value) => value.startsWith('--source-refs-file='));
if (!arg) throw new Error('PKT_LINEAGE_08A_SOURCE_REFS_REQUIRED');
const refs = [...new Set(JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, arg.slice(arg.indexOf('=') + 1)), 'utf8'))
  .map((value: unknown) => String(value).trim().replaceAll('\\', '/')).filter(Boolean))].sort();
if (!refs.length) throw new Error('PKT_LINEAGE_08A_SOURCE_REFS_EMPTY');
const hash = (value: string) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const reportPath = path.join(REPO_ROOT, 'docs/reports/pkt-lineage-08a-namespace-enrichment-plan-v1.json');
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.pkt-lineage-08a.namespace-enrichment.v1',
});
const bindingByRef = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let rows: any[] = [];
let databaseError: string | null = null;
try {
  const result = await pool.query(`
    SELECT id::text AS chunk_row_id, chunk_id AS canonical_chunk_id,
           source_ref AS stored_source_ref, relative_path, content_hash
      FROM public.codebase_chunk_index
     WHERE relative_path = ANY($1::text[]) OR source_ref = ANY($1::text[])
     ORDER BY relative_path, chunk_id, id
  `, [refs]);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}
const chunksByPath = new Map<string, any[]>();
for (const row of rows) {
  const relativePath = String(row.relative_path ?? '').replaceAll('\\', '/');
  const list = chunksByPath.get(relativePath) ?? [];
  list.push({
    chunkRowId: row.chunk_row_id,
    canonicalChunkId: row.canonical_chunk_id,
    expectedRelativePath: relativePath,
    storedSourceRef: row.stored_source_ref ?? null,
    chunkContentHash: row.content_hash ?? null,
    namespaceStatus: row.stored_source_ref ? 'AUTHORITATIVE_SOURCE_REF_PRESENT' : 'RELATIVE_PATH_ONLY',
  });
  chunksByPath.set(relativePath, list);
}
const proposals = refs.map((sourceRef) => {
  const binding = bindingByRef.get(sourceRef);
  const chunks = chunksByPath.get(sourceRef) ?? [];
  const duplicate = chunks.some((chunk) => chunk.canonicalChunkId == null || String(chunk.canonicalChunkId).trim() === '');
  const namespacePresent = chunks.length > 0 && chunks.every((chunk) => chunk.namespaceStatus === 'AUTHORITATIVE_SOURCE_REF_PRESENT' && chunk.storedSourceRef === sourceRef);
  return {
    sourceRef,
    proposedSourceRef: binding?.sourceRef ?? null,
    sourceRevision: binding?.sourceRevision ?? null,
    contentDigest: binding?.contentDigest ?? null,
    byteLength: binding?.byteLength ?? null,
    chunkCount: chunks.length,
    chunks,
    classification: !binding ? 'CURRENT_SOURCE_BINDING_MISSING'
      : chunks.length === 0 ? 'CHUNK_ROWS_MISSING'
        : duplicate ? 'CANONICAL_CHUNK_ID_MISSING'
          : namespacePresent ? 'EXACT_NAMESPACE_PROPOSAL'
            : 'RELATIVE_PATH_ONLY_REQUIRES_EXPLICIT_ENRICHMENT',
  };
});
const counts = proposals.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
const proposalCore = { sourceRefs: refs, workspaceRevision: origin.record.workspaceRevision, proposals };
const report = {
  schema: 'atlas.pkt-lineage-08a.namespace-enrichment-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_NAMESPACE_PROPOSAL',
  sourceRefsFile: arg.slice(arg.indexOf('=') + 1),
  targetSourceSetChecksum: hash(refs.join('\n')),
  proposalChecksum: hash(JSON.stringify(proposalCore)),
  workspaceRevisionAtCapture: origin.record.workspaceRevision,
  workspaceRevisionRecordChecksum: origin.record.checksum,
  counts,
  chunkRowsObserved: rows.length,
  databaseError,
  canonicalAuthority: false,
  authorizationRequired: true,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  status: databaseError ? 'NAMESPACE_PROPOSAL_FAILED' : counts.EXACT_NAMESPACE_PROPOSAL === refs.length ? 'NAMESPACE_PROPOSAL_READY' : 'NAMESPACE_PROPOSAL_BLOCKED',
  proposals,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, counts, chunkRowsObserved: rows.length, proposalChecksum: report.proposalChecksum, reportPath }, null, 2));
