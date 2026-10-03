#!/usr/bin/env node

/** Read-only structural lineage audit for one admitted Graphify execution. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/selected-graphify-structural-lineage-v1.json');
const currentnessPath = path.join(root, 'docs/reports/promotion-gate-receipt-currentness-v1.json');
const clean = (value) => String(value ?? '').trim();
const digest = (value) => clean(value).toLowerCase().replace(/^sha256:/, '');
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const key = (sourceRef, contentHash) => `${clean(sourceRef)}|${digest(contentHash)}`;
const tableColumns = async (pool, table) => {
  const result = await pool.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
};

const selected = JSON.parse(fs.readFileSync(currentnessPath, 'utf8'));
const executionId = arg('--execution-id') ?? selected.admittedExecutionId ?? null;
const workspaceRevision = arg('--workspace-revision') ?? selected.admittedWorkspaceRevision ?? null;
if (!executionId || !workspaceRevision) throw new Error('SELECTED_GRAPHIFY_EXECUTION_OR_REVISION_MISSING');

const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 2, statement_timeout: 120000, application_name: 'atlas-selected-graphify-structural-lineage-v1' });
let execution = null;
let members = [];
let chunks = [];
let packets = [];
let fileHashChunks = [];
const REPO_SCOPE = arg('--repository-id') ?? 'repo:root';
let error = null;
try {
  const executionResult = await pool.query(
    `select execution_id::text, workspace_revision::text, status
       from public.graphify_executions where execution_id=$1::uuid limit 1`,
    [executionId],
  );
  execution = executionResult.rows[0] ?? null;
  const membershipColumns = await tableColumns(pool, 'graphify_execution_file_membership_v2');
  const requiredMembership = ['execution_id', 'repository_id', 'repository_relative_path', 'source_ref', 'code_source_revision', 'content_hash', 'workspace_revision'];
  if (!requiredMembership.every((column) => membershipColumns.has(column))) throw new Error('MEMBERSHIP_V2_REQUIRED_COLUMNS_MISSING');
  // Scope filter added 2026-09-15 per the operator policy decision recorded in
  // parent-atlas-retrieval-lineage-dag-convergence/tasks.md (POLICY DECISION section):
  // CURRENT-STRUCTURAL-LINEAGE-01 covers repo:root only. The 6 other repositories present in
  // this execution's membership snapshot (claude-mem, turbovec, mcp-server-mcp, etc.) are
  // vendored/adjacent codebases swept up by the same Graphify crawl, confirmed to have 0/1,086
  // matches, and are explicitly out of scope for this gate -- not a gap to close.
  members = (await pool.query(
    `select execution_id::text, repository_id, repository_relative_path, source_ref,
            code_source_revision, content_hash, workspace_revision
       from public.graphify_execution_file_membership_v2
      where execution_id=$1::uuid and repository_id=$2
      order by repository_id, repository_relative_path`,
    [executionId, REPO_SCOPE],
  )).rows;

  const chunkColumns = await tableColumns(pool, 'codebase_chunk_index');
  if (chunkColumns.has('source_ref') && chunkColumns.has('content_hash')) {
    chunks = (await pool.query(
      `select source_ref, content_hash, ${chunkColumns.has('id') ? 'id::text as id' : 'null::text as id'},
              ${chunkColumns.has('chunk_id') ? 'chunk_id::text as chunk_id' : 'null::text as chunk_id'}
         from public.codebase_chunk_index
        where source_ref = any($1::text[]) and lower(content_hash) = any($2::text[])`,
      [members.map((row) => clean(row.source_ref)), members.map((row) => digest(row.content_hash))],
    )).rows;
  }

  // ADDITIVE (2026-09-15, task 6.1 of openspec/changes/parent-atlas-chunk-index-whole-file-hash):
  // a SEPARATE, secondary join via the new whole-file-scoped file_content_hash column, reported
  // alongside the existing content_hash-based join above, never replacing it. content_hash remains
  // chunk-scoped/sometimes-truncated; file_content_hash is the whole-file-comparable column added
  // and backfilled (52,154/55,853 rows) by that sibling change. See its tasks.md for the parity
  // proof and backfill provenance.
  if (chunkColumns.has('source_ref') && chunkColumns.has('file_content_hash')) {
    fileHashChunks = (await pool.query(
      `select source_ref, file_content_hash, ${chunkColumns.has('id') ? 'id::text as id' : 'null::text as id'},
              ${chunkColumns.has('chunk_id') ? 'chunk_id::text as chunk_id' : 'null::text as chunk_id'}
         from public.codebase_chunk_index
        where source_ref = any($1::text[]) and lower(file_content_hash) = any($2::text[])`,
      [members.map((row) => clean(row.source_ref)), members.map((row) => digest(row.content_hash))],
    )).rows;
  }

  const packetColumns = await tableColumns(pool, 'atlas_packets');
  if (packetColumns.has('source_ref') && packetColumns.has('content_hash')) {
    packets = (await pool.query(
      `select source_ref, content_hash,
              ${packetColumns.has('packet_key') ? 'packet_key::text as packet_key' : 'null::text as packet_key'},
              ${packetColumns.has('chunk_id') ? 'chunk_id::text as chunk_id' : 'null::text as chunk_id'}
         from public.atlas_packets
        where source_ref = any($1::text[]) and lower(content_hash) = any($2::text[])`,
      [members.map((row) => clean(row.source_ref)), members.map((row) => digest(row.content_hash))],
    )).rows;
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await pool.end();
}

const chunkByKey = new Map(chunks.map((row) => [key(row.source_ref, row.content_hash), row]));
const packetByKey = new Map(packets.map((row) => [key(row.source_ref, row.content_hash), row]));
const fileHashChunkByKey = new Map(fileHashChunks.map((row) => [key(row.source_ref, row.file_content_hash), row]));
const duplicateMembershipKeys = [];
const seen = new Set();
const rows = members.map((member) => {
  const identity = `${clean(member.repository_id)}:${clean(member.repository_relative_path).replaceAll('\\', '/')}`;
  const memberKey = key(member.source_ref, member.content_hash);
  if (seen.has(identity)) duplicateMembershipKeys.push(identity);
  seen.add(identity);
  const chunk = chunkByKey.get(memberKey) ?? null;
  const packet = packetByKey.get(memberKey) ?? null;
  const fileHashChunk = fileHashChunkByKey.get(memberKey) ?? null;
  return {
    identity,
    repositoryId: clean(member.repository_id),
    repositoryRelativePath: clean(member.repository_relative_path),
    sourceRef: clean(member.source_ref),
    sourceRevision: clean(member.code_source_revision) || null,
    contentHash: digest(member.content_hash) || null,
    workspaceRevision: clean(member.workspace_revision) || null,
    chunkId: chunk?.chunk_id ?? chunk?.id ?? null,
    packetKey: packet?.packet_key ?? null,
    packetChunkId: packet?.chunk_id ?? null,
    exactChunkMatch: Boolean(chunk),
    exactPacketMatch: Boolean(packet),
    classification: !chunk ? 'CHUNK_EXACT_MATCH_MISSING' : !packet ? 'PACKET_EXACT_MATCH_MISSING' : 'STRUCTURAL_CHAIN_EXACT_MATCH',
    // ADDITIVE (task 6.1): secondary signal via the whole-file-scoped column. Never overrides
    // exactChunkMatch/classification above -- those remain the content_hash-based primary gate.
    exactChunkMatchViaFileHash: Boolean(fileHashChunk),
    chunkIdViaFileHash: fileHashChunk?.chunk_id ?? fileHashChunk?.id ?? null,
  };
});

const counts = {
  selectedMembershipRows: members.length,
  repositoryCount: new Set(members.map((row) => clean(row.repository_id))).size,
  duplicateMembershipKeys: duplicateMembershipKeys.length,
  exactChunkMatches: rows.filter((row) => row.exactChunkMatch).length,
  exactPacketMatches: rows.filter((row) => row.exactPacketMatch).length,
  exactStructuralMatches: rows.filter((row) => row.classification === 'STRUCTURAL_CHAIN_EXACT_MATCH').length,
  missingChunks: rows.filter((row) => !row.exactChunkMatch).length,
  missingPackets: rows.filter((row) => !row.exactPacketMatch).length,
  workspaceRevisionMismatches: rows.filter((row) => row.workspaceRevision !== workspaceRevision).length,
  sourceRevisionMissing: rows.filter((row) => !row.sourceRevision).length,
  // ADDITIVE (task 6.1): secondary count via file_content_hash, informational only -- does not
  // feed report.status/firstBlocker/nextGate below, which remain the content_hash-based primary gate.
  exactChunkMatchesViaFileHash: rows.filter((row) => row.exactChunkMatchViaFileHash).length,
};
const report = {
  schema: 'atlas.selected-graphify-structural-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SELECTED_EXECUTION_RECONCILIATION',
  selectedExecutionId: executionId,
  selectedWorkspaceRevision: workspaceRevision,
  repositoryScope: REPO_SCOPE,
  execution,
  identityContract: 'repository_id + repository_relative_path; source_ref + content_hash for exact downstream joins',
  fallbackIdentityProhibited: ['path-only', 'basename-only', 'array-order-only', 'qdrant-point-id-only', 'historical-binding-fallback'],
  // Two distinct, intentionally non-interchangeable proofs (2026-09-15, per external review):
  //   proofA (canonical identity) = source_ref + source_revision -> atlas_packet_chunk_lineage
  //     -> chunk_row_id -> codebase_chunk_index.id. This is the ONLY mechanism that may ever
  //     authorize downstream promotion (semantic_768 admission, graph, feature matrix, etc).
  //   proofB (file content parity) = Graphify's whole-file digest vs codebase_chunk_index's
  //     ADDITIVE file_content_hash column (exactChunkMatchViaFileHash below). This is
  //     corroborating evidence that the right bytes were read -- it is NOT a substitute
  //     identity/lineage mechanism and MUST NEVER feed report.status/firstBlocker/nextGate.
  // counts.exactChunkMatches/exactPacketMatches/exactStructuralMatches are proofA.
  // counts.exactChunkMatchesViaFileHash is proofB.
  proofContracts: {
    proofA_canonicalIdentity: 'source_ref + source_revision -> atlas_packet_chunk_lineage -> chunk_row_id -> codebase_chunk_index.id (authorizes promotion)',
    proofB_fileContentParity: 'graphify whole-file digest vs codebase_chunk_index.file_content_hash (corroborating evidence only, never authorizes promotion)',
  },
  counts,
  status: error ? 'STRUCTURAL_LINEAGE_AUDIT_ERROR' : counts.duplicateMembershipKeys > 0 ? 'DUPLICATE_MEMBERSHIP_KEYS' : counts.workspaceRevisionMismatches > 0 ? 'WORKSPACE_REVISION_MISMATCH' : counts.exactStructuralMatches === members.length && members.length > 0 ? 'CURRENT_STRUCTURAL_LINEAGE_EXACT' : 'CURRENT_PACKET_CHUNK_JOIN_UNPROVEN',
  firstBlocker: error ? error : counts.duplicateMembershipKeys > 0 ? 'DUPLICATE_MEMBERSHIP_KEYS' : counts.workspaceRevisionMismatches > 0 ? 'WORKSPACE_REVISION_MISMATCH' : counts.missingChunks > 0 ? 'CURRENT_CHUNK_EXACT_MATCH_MISSING' : counts.missingPackets > 0 ? 'CURRENT_PACKET_EXACT_MATCH_MISSING' : 'SELECTED_EXECUTION_MEMBERSHIP_EMPTY',
  nextGate: counts.exactStructuralMatches === members.length && members.length > 0 ? 'SEMANTIC_768_CURRENT_COHORT_RECONCILIATION' : 'CURRENT_SOURCE_PACKET_CHUNK_RECONCILIATION',
  rows: rows.slice(0, 1000),
  rowsTruncated: rows.length > 1000,
  writesPerformed: false,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, firstBlocker: report.firstBlocker, counts, reportPath: 'docs/reports/selected-graphify-structural-lineage-v1.json' }, null, 2));
