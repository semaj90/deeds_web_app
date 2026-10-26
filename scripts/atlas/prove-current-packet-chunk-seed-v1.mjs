#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const readArg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
const executionId = readArg('--execution-id');
const workspaceRevision = readArg('--workspace-revision');
const sourceRef = readArg('--source-ref');
const reportArg = readArg('--report-path');
const maxSourceBytes = Number(readArg('--max-source-bytes') ?? 16 * 1024 * 1024);
if (!executionId || !workspaceRevision || !sourceRef || !reportArg) {
  throw new Error('EXECUTION_WORKSPACE_SOURCE_AND_REPORT_PATH_REQUIRED');
}
if (!/^sha256:[a-f0-9]{64}$/i.test(workspaceRevision)) throw new Error('INVALID_WORKSPACE_REVISION');
if (path.isAbsolute(sourceRef) || sourceRef.split(/[\\/]/).includes('..')) throw new Error('INVALID_SOURCE_REF');
if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) throw new Error('INVALID_MAX_SOURCE_BYTES');
const repoRoot = fs.realpathSync(root);
const lexicalSourcePath = path.resolve(repoRoot, sourceRef);
const relativeSourcePath = path.relative(repoRoot, lexicalSourcePath);
if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) {
  throw new Error('SOURCE_REF_OUTSIDE_REPOSITORY');
}
let sourceReadback = {
  available: false,
  byteLength: null,
  sha256: null,
  error: null,
};
try {
  const realSourcePath = fs.realpathSync(lexicalSourcePath);
  const realRelativeSourcePath = path.relative(repoRoot, realSourcePath);
  if (realRelativeSourcePath.startsWith('..') || path.isAbsolute(realRelativeSourcePath)) {
    throw new Error('SOURCE_SYMLINK_OUTSIDE_REPOSITORY');
  }
  const sourceStat = fs.statSync(realSourcePath);
  if (!sourceStat.isFile()) throw new Error('SOURCE_REF_NOT_FILE');
  if (sourceStat.size > maxSourceBytes) throw new Error('SOURCE_EXCEEDS_READBACK_LIMIT');
  const sourceBytes = fs.readFileSync(realSourcePath);
  sourceReadback = {
    available: true,
    byteLength: sourceBytes.byteLength,
    sha256: `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`,
    error: null,
  };
} catch (error) {
  sourceReadback.error = error instanceof Error ? error.message : String(error);
}
const reportPath = path.resolve(root, reportArg);
const scratchRoot = `${path.resolve(root, '.tmp', 'atlas')}${path.sep}`;
if (!reportPath.startsWith(scratchRoot)) throw new Error('REPORT_PATH_MUST_BE_UNDER_TMP_ATLAS');
if (fs.existsSync(reportPath)) throw new Error('REFUSING_TO_OVERWRITE_RECEIPT');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 15000 });
const client = await pool.connect();
let transactionOpened = false;
let transactionRolledBack = false;
let databaseError = null;
let evidence = null;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transactionOpened = true;
  const execution = (await client.query(
    `SELECT execution_id::text, workspace_revision::text, canonical_authority
       FROM public.graphify_executions WHERE execution_id = $1::uuid`,
    [executionId],
  )).rows[0] ?? null;
  const membershipRows = (await client.query(
    `SELECT repository_id::text, source_ref::text, code_source_revision::text,
            content_hash::text, workspace_revision::text
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision = $2 AND source_ref = $3
      ORDER BY repository_id, repository_relative_path`,
    [executionId, workspaceRevision, sourceRef],
  )).rows;
  const member = membershipRows[0] ?? null;
  const bindingRows = (await client.query(
    `SELECT repo_id::text, canonical_source_ref::text, source_revision::text,
            content_digest::text, workspace_revision::text, binding_checksum::text
       FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND canonical_source_ref = $1 AND workspace_revision = $2
      ORDER BY source_revision, content_digest`,
    [sourceRef, workspaceRevision],
  )).rows;
  const packetRows = (await client.query(
    `SELECT packet_key::text, source_ref::text, source_revision::text,
            lineage_binding_checksum::text, lineage_producer_revision::text,
            content_hash::text
       FROM public.atlas_packets WHERE source_ref = $1 ORDER BY packet_key`,
    [sourceRef],
  )).rows;
  const packetKeys = [...new Set(packetRows.map((row) => row.packet_key).filter(Boolean))];
  const packet = packetKeys.length === 1
    ? packetRows.find((row) => row.packet_key === packetKeys[0]) ?? null
    : null;
  const lineageRows = packet ? (await client.query(
    `SELECT l.packet_key::text, l.source_ref::text, l.source_revision::text,
            l.revision_status::text, l.canonical_chunk_id::text, l.chunk_row_id::text,
            c.id::text AS physical_chunk_row_id, c.chunk_id::text AS physical_chunk_id,
            c.file_content_hash::text AS file_content_hash
       FROM public.atlas_packet_chunk_lineage l
       LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
      WHERE l.source_ref = $1 AND l.source_revision = $2
        AND l.packet_key::text = $3 AND l.revision_status = 'PROVEN'
      ORDER BY l.canonical_chunk_id, l.chunk_row_id`,
    [sourceRef, member?.code_source_revision ?? '', packet.packet_key],
  )).rows : [];

  const normalizeDigest = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');
  const bindingMatches = member ? bindingRows.filter((row) =>
    row.source_revision === member.code_source_revision
    && row.workspace_revision === member.workspace_revision
    && normalizeDigest(row.content_digest) === normalizeDigest(member.content_hash)) : [];
  const packetQualified = Boolean(member && packet
    && packet.source_revision === member.code_source_revision
    && String(packet.lineage_binding_checksum ?? '').trim()
    && String(packet.lineage_producer_revision ?? '').trim());
  const lineageChecks = lineageRows.map((row) => ({
    ...row,
    physicalChunkMatches: Boolean(row.chunk_row_id && row.chunk_row_id === row.physical_chunk_row_id),
    canonicalChunkMatches: Boolean(row.canonical_chunk_id && row.canonical_chunk_id === row.physical_chunk_id),
    sourceDigestMatches: normalizeDigest(row.file_content_hash) === normalizeDigest(member?.content_hash),
  }));
  const validLineageRows = lineageChecks.filter((row) =>
    row.physicalChunkMatches && row.canonicalChunkMatches && row.sourceDigestMatches);
  const checks = {
    canonicalExecution: execution?.execution_id === executionId && execution?.canonical_authority === true,
    executionWorkspaceRevision: execution?.workspace_revision === workspaceRevision,
    uniqueMembership: membershipRows.length === 1,
    exactWorkspaceSourceBinding: bindingMatches.length === 1,
    uniquePacketIdentity: packetKeys.length === 1,
    packetSourceRevisionAndLineageProvenance: packetQualified,
    exactProvenPacketChunkRows: lineageChecks.length > 0 && validLineageRows.length === lineageChecks.length,
    sourceBytesReadWithinRepository: sourceReadback.available,
    sourceBytesMatchWorkspaceBinding: Boolean(member
      && normalizeDigest(sourceReadback.sha256) === normalizeDigest(member.content_hash)),
  };
  evidence = {
    executionId,
    sourceRef,
    workspaceRevision,
    repositoryId: member?.repository_id ?? null,
    sourceRevision: member?.code_source_revision ?? null,
    sourceContentDigest: member?.content_hash ?? null,
    sourceReadback,
    packetKey: packet?.packet_key ?? null,
    packetContentHash: packet?.content_hash ?? null,
    packetContentHashPolicy: 'DIAGNOSTIC_ONLY_NOT_SOURCE_REVISION_AUTHORITY',
    chunkRowCount: lineageChecks.length,
    chunkRowIds: validLineageRows.map((row) => row.chunk_row_id),
    lineageEvidenceChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(validLineageRows.map((row) => ({
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      canonicalChunkId: row.canonical_chunk_id,
      chunkRowId: row.chunk_row_id,
      fileContentHash: row.file_content_hash,
    })))).digest('hex')}`,
    checks,
    status: Object.values(checks).every(Boolean) ? 'P12_SINGLE_SOURCE_QUALIFIED' : 'P12_SINGLE_SOURCE_REJECTED',
  };
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  if (client && transactionOpened) {
    try {
      await client.query('ROLLBACK');
      transactionRolledBack = true;
    } catch (error) {
      databaseError ??= error instanceof Error ? error.message : String(error);
    }
  }
  client.release();
  await pool.end();
}

const body = {
  schema: 'atlas.p12-single-source-packet-chunk-readback.v1',
  mode: 'READ_ONLY_SINGLE_SOURCE',
  generatedAt: new Date().toISOString(),
  ...evidence,
  databaseError,
  databaseTransaction: 'REPEATABLE READ READ ONLY',
  transactionOpened,
  transactionRolledBack,
  writesPerformed: false,
  canonicalAuthority: false,
  promotionAuthorized: false,
};
body.receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath, status: body.status, receiptChecksum: body.receiptChecksum, writesPerformed: false }, null, 2));
if (databaseError || !transactionRolledBack || body.status !== 'P12_SINGLE_SOURCE_QUALIFIED') process.exitCode = 1;
