#!/usr/bin/env node
/**
 * PACKET DIGEST BRIDGE ADMISSION 01 (read-only proposal proof)
 *
 * Implements the PacketDigestBridgeProposalV1 contract for Parent Atlas.
 * Resolves exact source and packet owners using existing authority receipts,
 * fetches exact revision-qualified input receipts, independently recomputes
 * compatible digests, and rejects ambiguous, stale, or missing bindings.
 *
 * Strict constraint: admissionAuthorized is ALWAYS false.
 * Never mutates schema, database, or production cache.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

export const SCHEMA_PROPOSAL_V1 = 'atlas.packet-digest-bridge-proposal.v1';
export const DEFAULT_SOURCE_AUTHORITY_RECEIPT = 'docs/reports/selected-graphify-execution-owner-v1.json';
export const DEFAULT_PACKET_LINEAGE_RECEIPT = 'docs/reports/packet-writer-lineage-v1.json';
export const DEFAULT_REVISION_CONTRACT_RECEIPT = 'docs/reports/packet-write-revision-contract-v1.json';

export const SHA256_HEX = /^[a-f0-9]{64}$/i;
export const SHA256_PREFIXED = /^sha256:[a-f0-9]{64}$/i;

export function sha256Hex(bufferOrStr) {
  return crypto.createHash('sha256').update(bufferOrStr).digest('hex');
}

export function sha256Prefixed(bufferOrStr) {
  return `sha256:${sha256Hex(bufferOrStr)}`;
}

export function normalizeSourceRef(value) {
  return String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

/**
 * Pure evaluation function conforming to PacketDigestBridgeProposalV1.
 */
export function evaluatePacketDigestBridgeRow(input) {
  const {
    workspaceRevision,
    executionId,
    sourceRef,
    sourceRevision,
    sourceContentDigest,
    packetKey = null,
    packetContentDigest = null,
    packetSourceRevision = null,
    packetWorkspaceRevisionKey = null,
    hasAmbiguousPackets = false,
    chunkContentDigests = [],
    sourceAuthorityReceiptRef = DEFAULT_SOURCE_AUTHORITY_RECEIPT,
    packetLineageReceiptRef = DEFAULT_PACKET_LINEAGE_RECEIPT,
  } = input;

  const normSourceRev = String(sourceRevision ?? '').trim().toLowerCase();
  const normSourceDigest = String(sourceContentDigest ?? '').trim().toLowerCase();
  const normPacketKey = packetKey ? String(packetKey).trim() : null;
  const normPacketDigest = packetContentDigest ? String(packetContentDigest).trim().toLowerCase() : null;
  const normPacketSourceRev = packetSourceRevision ? String(packetSourceRevision).trim().toLowerCase() : null;
  const chunks = Array.isArray(chunkContentDigests)
    ? chunkContentDigests.map((c) => String(c ?? '').trim().toLowerCase()).filter(Boolean)
    : [];

  let status;

  if (hasAmbiguousPackets) {
    status = 'AMBIGUOUS';
  } else if (!normPacketKey) {
    status = 'MISSING_BINDING';
  } else if (!normPacketSourceRev || normPacketSourceRev !== normSourceRev) {
    status = 'REVISION_MISMATCH';
  } else if (!normPacketDigest || normPacketDigest !== normSourceDigest) {
    status = 'DIGEST_MISMATCH';
  } else {
    status = 'EXACT_MATCH';
  }

  const proposal = {
    schema: SCHEMA_PROPOSAL_V1,
    workspaceRevision: String(workspaceRevision ?? ''),
    executionId: String(executionId ?? ''),
    sourceRef: String(sourceRef ?? ''),
    sourceRevision: String(sourceRevision ?? ''),
    packetKey: normPacketKey,
    packetContentDigest: normPacketDigest,
    sourceContentDigest: normSourceDigest,
    chunkContentDigests: chunks,
    sourceAuthorityReceiptRef: String(sourceAuthorityReceiptRef ?? ''),
    packetLineageReceiptRef: String(packetLineageReceiptRef ?? ''),
    status,
    admissionAuthorized: false,
  };

  return proposal;
}

export async function runBridgeProposalAudit(options = {}) {
  const root = REPO_ROOT;
  const sourceAuthorityReceiptRef = options.sourceAuthorityReceiptRef ?? DEFAULT_SOURCE_AUTHORITY_RECEIPT;
  const packetLineageReceiptRef = options.packetLineageReceiptRef ?? DEFAULT_PACKET_LINEAGE_RECEIPT;
  const revisionContractReceiptRef = options.revisionContractReceiptRef ?? DEFAULT_REVISION_CONTRACT_RECEIPT;

  const authReceiptPath = path.resolve(root, sourceAuthorityReceiptRef);
  const lineageReceiptPath = path.resolve(root, packetLineageReceiptRef);
  const revisionReceiptPath = path.resolve(root, revisionContractReceiptRef);

  if (!fs.existsSync(authReceiptPath)) {
    throw new Error(`SOURCE_AUTHORITY_RECEIPT_NOT_FOUND: ${sourceAuthorityReceiptRef}`);
  }
  if (!fs.existsSync(lineageReceiptPath)) {
    throw new Error(`PACKET_LINEAGE_RECEIPT_NOT_FOUND: ${packetLineageReceiptRef}`);
  }
  if (!fs.existsSync(revisionReceiptPath)) {
    throw new Error(`REVISION_CONTRACT_RECEIPT_NOT_FOUND: ${revisionContractReceiptRef}`);
  }

  const authReceipt = JSON.parse(fs.readFileSync(authReceiptPath, 'utf8'));
  const lineageReceipt = JSON.parse(fs.readFileSync(lineageReceiptPath, 'utf8'));
  const revisionReceipt = JSON.parse(fs.readFileSync(revisionReceiptPath, 'utf8'));

  const workspaceRevision = options.workspaceRevision ?? authReceipt.candidate?.workspaceRevision;
  const executionId = options.executionId ?? authReceipt.selectedExecutionId;
  const limit = Math.max(1, Math.min(Number(options.limit ?? 50), 500));

  if (!workspaceRevision || !SHA256_PREFIXED.test(workspaceRevision)) {
    throw new Error(`INVALID_WORKSPACE_REVISION: ${workspaceRevision}`);
  }
  if (!executionId) {
    throw new Error('MISSING_EXECUTION_ID');
  }

  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
    max: 2,
    statement_timeout: 60000,
    application_name: 'prove-packet-digest-bridge-proposal-v1',
  });

  const client = await pool.connect();
  const proposals = [];
  const statusCounts = {
    EXACT_MATCH: 0,
    MISSING_BINDING: 0,
    REVISION_MISMATCH: 0,
    DIGEST_MISMATCH: 0,
    AMBIGUOUS: 0,
  };

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const filterSourceRef = options.filterSourceRef ? normalizeSourceRef(options.filterSourceRef) : null;

    // Fetch bounded membership rows
    const membersQuery = filterSourceRef
      ? `
        SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
        FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1
          AND workspace_revision = $2
          AND lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) = $4
        ORDER BY source_ref
        LIMIT $3;
      `
      : `
        SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
        FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1
          AND workspace_revision = $2
        ORDER BY source_ref
        LIMIT $3;
      `;

    const membersParams = filterSourceRef
      ? [executionId, workspaceRevision, limit, filterSourceRef]
      : [executionId, workspaceRevision, limit];

    const membersRes = await client.query(membersQuery, membersParams);

    for (const member of membersRes.rows) {
      const normRef = normalizeSourceRef(member.source_ref);

      // Query packets matching this source_ref
      const packetsRes = await client.query(`
        SELECT packet_key::text AS packet_key,
               source_ref,
               content_hash::text AS content_hash,
               sha256::text AS legacy_sha256,
               source_revision::text AS source_revision,
               workspace_revision_key::text AS workspace_revision_key
        FROM public.atlas_packets
        WHERE lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) = $1;
      `, [normRef]);

      // Query chunks matching this source_ref
      const chunksRes = await client.query(`
        SELECT content_hash, file_content_hash, line_start
        FROM public.codebase_chunk_index
        WHERE lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) = $1
        ORDER BY line_start ASC NULLS LAST;
      `, [normRef]);

      const chunkDigests = chunksRes.rows
        .map((c) => c.content_hash)
        .filter(Boolean);

      // Verify physical disk source bytes if available
      let physicalDiskDigest = null;
      const physicalPath = path.resolve(root, member.source_ref);
      if (fs.existsSync(physicalPath)) {
        try {
          const fileBytes = fs.readFileSync(physicalPath);
          physicalDiskDigest = sha256Hex(fileBytes);
        } catch {
          // ignore read error
        }
      }

      // Check for packet ambiguity
      const packetKeys = [...new Set(packetsRes.rows.map((p) => p.packet_key).filter(Boolean))];
      const hasAmbiguousPackets = packetKeys.length > 1;

      // Extract packet candidates
      const packetRow = packetsRes.rows[0] ?? null;

      // Notice: if packet.content_hash is NULL but packet.sha256 is present and matches member_hash,
      // determine whether packetContentDigest is canonical content_hash or legacy sha256.
      // Per contract: packetContentDigest is packet.content_hash ?? packet.sha256 ?? null
      const packetContentDigest = packetRow?.content_hash ?? packetRow?.legacy_sha256 ?? null;

      const proposal = evaluatePacketDigestBridgeRow({
        workspaceRevision,
        executionId,
        sourceRef: member.source_ref,
        sourceRevision: member.code_source_revision,
        sourceContentDigest: member.content_hash,
        packetKey: packetRow?.packet_key ?? null,
        packetContentDigest,
        packetSourceRevision: packetRow?.source_revision ?? null,
        packetWorkspaceRevisionKey: packetRow?.workspace_revision_key ?? null,
        hasAmbiguousPackets,
        chunkContentDigests: chunkDigests,
        sourceAuthorityReceiptRef,
        packetLineageReceiptRef,
      });

      if (physicalDiskDigest) {
        proposal.physicalDiskDigest = physicalDiskDigest;
        proposal.physicalDiskDigestMatch = physicalDiskDigest.toLowerCase() === String(member.content_hash).toLowerCase();
      }

      proposals.push(proposal);
      statusCounts[proposal.status] = (statusCounts[proposal.status] ?? 0) + 1;
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  const generatedAt = new Date().toISOString();
  const reportPayload = {
    schema: 'atlas.packet-digest-bridge-proposal-audit.v1',
    generatedAt,
    gate: 'PACKET_DIGEST_BRIDGE_ADMISSION_01',
    workspaceRevision,
    executionId,
    limit,
    receiptReferences: {
      sourceAuthorityReceiptRef,
      packetLineageReceiptRef,
      revisionContractReceiptRef,
    },
    counts: {
      sampledMembershipRows: proposals.length,
      ...statusCounts,
    },
    proposals,
    canonicalAuthority: false,
    writesPerformed: false,
    admissionAuthorized: false,
  };

  const serialized = JSON.stringify(reportPayload, null, 2);
  const reportChecksum = sha256Prefixed(serialized);
  reportPayload.reportChecksum = reportChecksum;

  const scratchPath = path.resolve(root, '.tmp/atlas/packet-digest-bridge-proposal-v1.json');
  const reportPath = path.resolve(root, 'docs/reports/packet-digest-bridge-proposal-v1.json');

  fs.mkdirSync(path.dirname(scratchPath), { recursive: true });
  fs.writeFileSync(scratchPath, JSON.stringify(reportPayload, null, 2), 'utf8');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2), 'utf8');

  // Independent readback verification
  const readback = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
  if (readback.reportChecksum !== reportChecksum) {
    throw new Error('SCRATCH_REPORT_READBACK_CHECKSUM_MISMATCH');
  }

  return reportPayload;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const getArg = (name) => {
    const idx = process.argv.indexOf(name);
    return idx >= 0 ? process.argv[idx + 1] : null;
  };

  const limit = getArg('--limit') ? Number(getArg('--limit')) : 50;
  const workspaceRevision = getArg('--workspace-revision');
  const executionId = getArg('--execution-id');
  const filterSourceRef = getArg('--filter-source-ref');

  try {
    const report = await runBridgeProposalAudit({
      limit,
      workspaceRevision,
      executionId,
      filterSourceRef,
    });
    console.log(JSON.stringify({
      status: 'SUCCESS',
      gate: report.gate,
      sampled: report.counts.sampledMembershipRows,
      counts: report.counts,
      reportChecksum: report.reportChecksum,
      admissionAuthorized: report.admissionAuthorized,
      writesPerformed: report.writesPerformed,
    }, null, 2));
  } catch (err) {
    console.error('PROPOSAL_AUDIT_ERROR:', err);
    process.exit(1);
  }
}
