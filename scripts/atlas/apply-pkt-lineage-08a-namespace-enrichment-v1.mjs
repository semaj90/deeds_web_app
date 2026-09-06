#!/usr/bin/env node
/** Explicitly authorized, bounded source_ref enrichment with readback. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

if (!process.argv.includes('--apply')) throw new Error('EXPLICIT_APPLY_REQUIRED');
const readArg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const authPath = readArg('--authorization');
const proposalPath = readArg('--proposal');
if (!authPath || !proposalPath) throw new Error('AUTHORIZATION_AND_PROPOSAL_REQUIRED');
const auth = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, authPath), 'utf8'));
const proposal = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, proposalPath), 'utf8'));
if (auth.schema !== 'atlas.pkt-lineage-08a.namespace-enrichment-authorization.v1' || auth.status !== 'AUTHORIZED_BOUNDED_APPLY') throw new Error('AUTHORIZATION_INVALID');
if (proposal.schema !== 'atlas.pkt-lineage-08a.namespace-enrichment-plan.v1') throw new Error('PROPOSAL_SCHEMA_INVALID');
if (auth.proposalChecksum !== proposal.proposalChecksum || auth.targetSourceSetChecksum !== proposal.targetSourceSetChecksum || auth.targetCount !== proposal.proposals.length) throw new Error('AUTHORIZATION_PROPOSAL_BINDING_MISMATCH');
if (proposal.status !== 'NAMESPACE_PROPOSAL_BLOCKED' && proposal.status !== 'NAMESPACE_PROPOSAL_READY') throw new Error(`PROPOSAL_NOT_APPLYABLE:${proposal.status}`);
if (auth.mutation?.table !== 'public.codebase_chunk_index' || auth.mutation?.column !== 'source_ref'
  || auth.targetRowCount !== proposal.proposals.reduce((count, row) => count + row.chunkCount, 0)
  || auth.mutation?.allowInsert !== false || auth.mutation?.allowDelete !== false
  || auth.mutation?.allowOtherColumns !== false || auth.mutation?.allowAdditionalRows !== false) throw new Error('MUTATION_SCOPE_INVALID');

const reportPath = path.join(REPO_ROOT, 'docs/reports/pkt-lineage-08a-namespace-enrichment-apply-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const expected = proposal.proposals.filter((row) => row.proposedSourceRef === row.sourceRef && row.chunkCount > 0);
const currentOrigin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.pkt-lineage-08a.namespace-enrichment.apply.v1',
});
const currentBindings = new Map(currentOrigin.bindings.map((binding) => [binding.sourceRef, binding]));
for (const row of expected) {
  const binding = currentBindings.get(row.sourceRef);
  if (!binding || binding.sourceRevision !== row.sourceRevision || binding.contentDigest !== row.contentDigest || binding.byteLength !== row.byteLength) {
    throw new Error(`TARGET_SOURCE_PROPOSAL_DRIFT:${row.sourceRef}`);
  }
}
let updated = 0;
let alreadyApplied = 0;
let readback = [];
let postCommitReadback = [];
const chunkPlans = expected.flatMap((row) => row.chunks.map((chunk) => ({ ...chunk, sourceRef: row.sourceRef })));
const chunkRowIds = chunkPlans.map((chunk) => chunk.chunkRowId);
if (new Set(chunkRowIds).size !== chunkRowIds.length) throw new Error('DUPLICATE_PHYSICAL_ROW_KEY');
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (chunkPlans.length !== auth.targetRowCount) throw new Error('TARGET_ROW_COUNT_MISMATCH');
    for (const chunk of chunkPlans) {
      const current = await client.query(`
        SELECT id::text AS chunk_row_id, source_ref, relative_path, chunk_id, content_hash
          FROM public.codebase_chunk_index WHERE id = $1::uuid FOR UPDATE
      `, [chunk.chunkRowId]);
      const row = current.rows[0];
      if (!row) throw new Error(`ROW_PREIMAGE_MISSING:${chunk.chunkRowId}`);
      if (row.relative_path !== chunk.expectedRelativePath || String(row.chunk_id) !== String(chunk.canonicalChunkId) || String(row.content_hash ?? '') !== String(chunk.chunkContentHash ?? '')) {
        throw new Error(`ROW_PREIMAGE_DRIFT:${chunk.chunkRowId}`);
      }
      if (row.source_ref === chunk.sourceRef) { alreadyApplied += 1; continue; }
      if (row.source_ref !== null) throw new Error(`SOURCE_REF_ALREADY_POPULATED:${chunk.chunkRowId}`);
      const result = await client.query(`
        UPDATE public.codebase_chunk_index
           SET source_ref = $2
         WHERE id = $1::uuid AND source_ref IS NULL AND relative_path = $3
         RETURNING id::text AS chunk_row_id, source_ref, relative_path, chunk_id
      `, [chunk.chunkRowId, chunk.sourceRef, chunk.expectedRelativePath]);
      if ((result.rowCount ?? 0) !== 1) throw new Error(`ROW_PREIMAGE_DRIFT:${chunk.chunkRowId}`);
      updated += 1;
    }
    const refs = expected.map((row) => row.sourceRef);
    const result = await client.query(`
      SELECT id::text AS chunk_row_id, source_ref, relative_path, chunk_id
        FROM public.codebase_chunk_index
       WHERE id = ANY($1::uuid[])
       ORDER BY id
    `, [chunkRowIds]);
    readback = result.rows;
    const byId = new Map(readback.map((row) => [row.chunk_row_id, row]));
    const mismatches = chunkPlans.filter((chunk) => {
      const row = byId.get(chunk.chunkRowId);
      return !row || row.source_ref !== chunk.sourceRef || row.relative_path !== chunk.expectedRelativePath
        || String(row.chunk_id) !== String(chunk.canonicalChunkId);
    });
    if (mismatches.length) throw new Error(`NAMESPACE_READBACK_MISMATCH:${mismatches.length}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
const postCommitPool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
try {
  const result = await postCommitPool.query(`
    SELECT id::text AS chunk_row_id, source_ref, relative_path, chunk_id
      FROM public.codebase_chunk_index
     WHERE id = ANY($1::uuid[])
     ORDER BY id
  `, [chunkRowIds]);
  postCommitReadback = result.rows;
} finally { await postCommitPool.end(); }
const postCommitById = new Map(postCommitReadback.map((row) => [row.chunk_row_id, row]));
const postCommitMismatches = chunkPlans.filter((chunk) => {
  const row = postCommitById.get(chunk.chunkRowId);
  return !row || row.source_ref !== chunk.sourceRef || row.relative_path !== chunk.expectedRelativePath
    || String(row.chunk_id) !== String(chunk.canonicalChunkId);
});
const receipt = {
  schema: 'atlas.pkt-lineage-08a.namespace-enrichment-apply.v1',
  generatedAt: new Date().toISOString(),
  status: postCommitMismatches.length > 0 ? 'POSTCOMMIT_READBACK_DRIFT'
    : updated === 0 && alreadyApplied === auth.targetRowCount ? 'ALREADY_APPLIED_EXACT' : 'APPLIED_EXACT',
  authorizationPath: authPath,
  proposalPath,
  proposalChecksum: proposal.proposalChecksum,
  targetSourceSetChecksum: proposal.targetSourceSetChecksum,
  targetCount: proposal.targetCount,
  sourceCountApplied: expected.length,
  expectedRowCount: auth.targetRowCount,
  chunkRowsUpdated: updated,
  chunkRowsAlreadyApplied: alreadyApplied,
  chunkRowsReadBack: readback.length,
  chunkRowsPostCommitReadBack: postCommitReadback.length,
  mutation: 'codebase_chunk_index.source_ref NULL -> relative_path after exact current binding proposal',
  wholeSourceHashComparedToChunkHash: false,
  aceEvidenceAuthority: false,
  writesPerformed: { postgres: true, qdrant: false, neo4j: false, valkey: false },
  readbackSourceRefs: [...new Set(readback.map((row) => row.source_ref))].length,
  transactionalReadbackParity: readback.length === chunkPlans.length,
  postCommitReadbackParity: postCommitReadback.length === chunkPlans.length && postCommitMismatches.length === 0,
  postCommitReadbackMismatchCount: postCommitMismatches.length,
  rollbackRequired: true,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ schema: receipt.schema, status: receipt.status, sourceCountApplied: receipt.sourceCountApplied, chunkRowsUpdated: receipt.chunkRowsUpdated, chunkRowsReadBack: receipt.chunkRowsReadBack, reportPath }, null, 2));
