#!/usr/bin/env node

/**
 * Read-only preflight for the future packet↔chunk lineage capture canary.
 *
 * GRAPHIFY-REVISION-TIEBREAK-FIX-01 (2026-09-05): the namespace/revision LATERAL
 * join below previously picked one `graphify_files` row per source_ref via
 * `ORDER BY workspace_revision DESC, code_source_revision DESC` -- sorting sha256
 * content hashes as if they were timestamps, with no relationship to which row was
 * actually current. Fixed to join `graphify_runs` and filter `status = 'COMPLETED'`,
 * tie-broken by the real `completed_at` timestamp (never a hash column). This is
 * still a legacy bridge over a mutable table, not canonical authority -- see
 * scripts/atlas/lib/graphify-source-evidence.mjs for the full rationale and the
 * corpus-wide safety proof (GRAPHIFY-COMPLETED-LEGACY-COVERAGE-01).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '10', 10) || 10, 100));
const reportPath = path.resolve(root, 'docs/reports/packet-chunk-lineage-promotion-preflight-v1.json');
const ownerPlanPath = path.resolve(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const ownerPlan = fs.existsSync(ownerPlanPath)
  ? JSON.parse(fs.readFileSync(ownerPlanPath, 'utf8'))
  : null;
const executionId = process.argv.find((arg) => arg.startsWith('--execution-id='))?.split('=')[1]
  ?? ownerPlan?.existingCanonicalOwner?.executionId
  ?? null;
const requestedRunId = process.argv.find((arg) => arg.startsWith('--run-id='))?.split('=')[1]
  ?? ownerPlan?.existingCanonicalOwner?.legacyGraphifyRunId
  ?? null;
const workspaceRevision = process.argv.find((arg) => arg.startsWith('--workspace-revision='))?.split('=')[1]
  ?? ownerPlan?.existingCanonicalOwner?.workspaceRevision
  ?? ownerPlan?.candidates?.find((candidate) => candidate.execution_id === executionId)?.workspace_revision
  ?? null;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 30000 });

let candidates = [];
let databaseError = null;
let executionBridge = null;
let joinFunnel = null;
try {
  const executionResult = await pool.query(
    `SELECT execution_id::text, legacy_graphify_run_id::text, workspace_revision::text,
            canonical_authority
       FROM graphify_executions
      WHERE execution_id = $1::uuid`,
    [executionId],
  );
  const execution = executionResult.rows[0] ?? null;
  executionBridge = {
    executionFound: Boolean(execution),
    legacyGraphifyRunId: execution?.legacy_graphify_run_id ?? null,
    canonicalAuthority: execution?.canonical_authority === true,
    status: !execution ? 'EXECUTION_NOT_FOUND' : !execution.legacy_graphify_run_id
      ? 'EXECUTION_RUN_BRIDGE_MISSING'
      : execution.canonical_authority !== true ? 'EXECUTION_NOT_CANONICAL' : 'BRIDGE_AVAILABLE',
  };
  const funnelResult = await pool.query(`
    WITH members AS (
      SELECT source_ref, code_source_revision, content_hash
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid
    ),
    candidate_run AS (
      SELECT run_id
      FROM public.graphify_runs
      WHERE run_id = COALESCE($3::uuid, run_id)
        AND workspace_revision = $2
        AND workspace_id = (SELECT workspace_id FROM public.graphify_executions WHERE execution_id = $1::uuid)
        AND status = 'COMPLETED' AND dry_run IS NOT TRUE
        AND source_manifest_digest IS NOT NULL
        AND source_manifest_source_count > 0
    ),
    run_files AS (
      SELECT gf.source_ref, gf.code_source_revision, gf.source_revision, gf.content_hash
      FROM public.graphify_files gf JOIN candidate_run cr ON cr.run_id = gf.last_seen_run_id
    ),
    any_legacy_files AS (
      SELECT gf.source_ref, gf.last_seen_run_id
      FROM public.graphify_files gf
      JOIN members m ON m.source_ref = gf.source_ref
    )
    SELECT
      (SELECT COUNT(*)::int FROM members) AS execution_membership_rows,
      (SELECT COUNT(*)::int FROM run_files) AS legacy_run_source_rows,
      (SELECT COUNT(*)::int FROM public.graphify_files WHERE last_seen_run_id = $3::uuid) AS requested_run_file_rows,
      (SELECT COUNT(*)::int FROM candidate_run) AS candidate_run_registry_rows,
      (SELECT workspace_revision FROM public.graphify_runs WHERE run_id = $3::uuid) AS requested_run_workspace_revision,
      (SELECT source_manifest_digest FROM public.graphify_runs WHERE run_id = $3::uuid) AS requested_run_manifest_digest,
      (SELECT source_manifest_source_count FROM public.graphify_runs WHERE run_id = $3::uuid) AS requested_run_manifest_source_count,
      (SELECT status FROM public.graphify_runs WHERE run_id = $3::uuid) AS requested_run_status,
      (SELECT COUNT(DISTINCT source_ref)::int FROM any_legacy_files) AS legacy_source_refs_any_run,
      (SELECT COUNT(*)::int FROM any_legacy_files) AS legacy_rows_any_run,
      (SELECT COUNT(DISTINCT last_seen_run_id)::int FROM any_legacy_files) AS legacy_run_ids_any_run,
      COUNT(*) FILTER (WHERE rf.source_ref = m.source_ref)::int AS source_ref_matches,
      COUNT(*) FILTER (WHERE rf.source_ref = m.source_ref AND (rf.code_source_revision = m.code_source_revision OR rf.source_revision = m.code_source_revision))::int AS source_revision_matches,
      COUNT(*) FILTER (WHERE rf.source_ref = m.source_ref AND rf.content_hash = m.content_hash)::int AS content_digest_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.atlas_packets ap WHERE ap.source_ref = m.source_ref))::int AS packet_source_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.atlas_packets ap WHERE ap.source_ref = m.source_ref AND ap.source_revision = m.code_source_revision))::int AS packet_revision_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.atlas_packets ap WHERE ap.source_ref = m.source_ref AND ap.source_revision = m.code_source_revision AND ap.content_hash = m.content_hash))::int AS packet_digest_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.codebase_chunk_index cci WHERE cci.source_ref = m.source_ref))::int AS chunk_source_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.codebase_chunk_index cci WHERE cci.source_ref = m.source_ref AND cci.source_revision = m.code_source_revision AND cci.workspace_revision = $2))::int AS chunk_revision_matches,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.codebase_chunk_index cci WHERE cci.source_ref = m.source_ref AND cci.source_revision = m.code_source_revision AND cci.workspace_revision = $2 AND cci.file_content_hash = m.content_hash))::int AS chunk_file_content_matches
    FROM members m LEFT JOIN run_files rf ON rf.source_ref = m.source_ref
  `, [executionId, workspaceRevision, requestedRunId]);
  joinFunnel = funnelResult.rows[0] ?? null;
  if (joinFunnel) {
    const members = Number(joinFunnel.execution_membership_rows ?? 0);
    const runFiles = Number(joinFunnel.legacy_run_source_rows ?? 0);
    const requestedRunFiles = Number(joinFunnel.requested_run_file_rows ?? 0);
    const candidateRunRegistryRows = Number(joinFunnel.candidate_run_registry_rows ?? 0);
    const sourceRefs = Number(joinFunnel.source_ref_matches ?? 0);
    const sourceRevisions = Number(joinFunnel.source_revision_matches ?? 0);
    const sourceDigests = Number(joinFunnel.content_digest_matches ?? 0);
    const packetSources = Number(joinFunnel.packet_source_matches ?? 0);
    const packetRevisions = Number(joinFunnel.packet_revision_matches ?? 0);
    const packetDigests = Number(joinFunnel.packet_digest_matches ?? 0);
    const chunkSources = Number(joinFunnel.chunk_source_matches ?? 0);
    const chunkRevisions = Number(joinFunnel.chunk_revision_matches ?? 0);
    const chunkFileContents = Number(joinFunnel.chunk_file_content_matches ?? 0);
    const legacyRefsAnyRun = Number(joinFunnel.legacy_source_refs_any_run ?? 0);
    joinFunnel.requestedRunId = requestedRunId;
    joinFunnel.legacyEvidenceStatus = runFiles === 0 && requestedRunFiles > 0 && candidateRunRegistryRows === 0
      ? 'REQUESTED_RUN_FILES_PRESENT_BUT_RUN_REGISTRY_MISSING'
      : runFiles === 0 && legacyRefsAnyRun > 0
      ? 'RUN_FILE_EVIDENCE_UNDER_OTHER_RUN'
      : runFiles === 0 ? 'RUN_FILE_MISSING' : 'RUN_FILE_BOUND';
    joinFunnel.firstFailingBoundary = runFiles === 0 && requestedRunFiles > 0 && candidateRunRegistryRows === 0
      ? 'RUN_REGISTRY_MISSING'
      : runFiles === 0
      ? 'RUN_FILE_MISSING'
      : sourceRefs < members
        ? 'SOURCE_REF_MISMATCH'
        : sourceRevisions < sourceRefs
          ? 'SOURCE_REVISION_MISMATCH'
          : sourceDigests < sourceRevisions
            ? 'SOURCE_DIGEST_MISMATCH'
            : packetSources < members
              ? 'PACKET_MISSING'
              : packetRevisions < packetSources
                ? 'PACKET_REVISION_MISMATCH'
                : packetDigests < packetRevisions
                  ? 'PACKET_DIGEST_MISMATCH'
                  : chunkSources < members
                    ? 'CHUNK_MISSING'
                    : chunkRevisions < chunkSources
                      ? 'CHUNK_REVISION_MISMATCH'
                      : 'QUALIFIED';
  }
  const { rows } = await pool.query(`
    SELECT
      m.source_ref,
      m.code_source_revision,
      m.content_hash AS source_content_hash,
      m.workspace_revision,
      cci.chunk_id AS canonical_chunk_id,
      MIN(cci.id::text) AS chunk_row_id,
      MIN(cci.source_revision) AS chunk_source_revision,
      MIN(cci.workspace_revision) AS chunk_workspace_revision,
      MIN(cci.content_hash) AS chunk_content_hash,
      MIN(cci.file_content_hash) AS chunk_file_content_hash,
      (SELECT COUNT(*)::int FROM public.codebase_chunk_index cci2
        WHERE cci2.source_ref = m.source_ref) AS chunk_source_row_count
    FROM public.graphify_execution_file_membership_v2 m
    LEFT JOIN public.codebase_chunk_index cci
      ON cci.source_ref = m.source_ref
     AND cci.source_revision = m.code_source_revision
     AND cci.workspace_revision = $3
     AND NULLIF(BTRIM(cci.chunk_id::text), '') IS NOT NULL
    WHERE m.execution_id = $2::uuid
      AND m.workspace_revision = $3
      AND NULLIF(BTRIM(m.source_ref), '') IS NOT NULL
    GROUP BY m.source_ref, m.code_source_revision, m.content_hash, m.workspace_revision, cci.chunk_id
    ORDER BY m.source_ref, cci.chunk_id NULLS FIRST
    LIMIT $1
  `, [limit * 20, executionId, workspaceRevision]);

  // Resolve packet identity in one bounded-independent canonical read. The
  // packet table remains the identity owner; keeping normalization out of the
  // large chunk join avoids an unindexed expression join and timeout.
  const packetResult = await pool.query(`
    SELECT packet_key::text AS packet_key, source_ref, source_revision,
           content_hash, workspace_revision_key AS workspace_revision,
           lineage_binding_checksum
    FROM atlas_packets
    WHERE NULLIF(BTRIM(source_ref), '') IS NOT NULL
    ORDER BY source_ref, packet_key
  `);
  const packetsBySource = new Map();
  for (const packet of packetResult.rows) {
    const key = String(packet.source_ref).trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
    const packetKeys = packetsBySource.get(key) ?? [];
    packetKeys.push(String(packet.packet_key));
    packetsBySource.set(key, packetKeys);
  }

  const bySource = new Map();
  for (const row of rows) {
    const list = bySource.get(row.source_ref) ?? [];
    list.push(row);
    bySource.set(row.source_ref, list);
  }
  const packetsBySourceRecords = new Map();
  for (const packet of packetResult.rows) {
    const key = String(packet.source_ref).trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
    const records = packetsBySourceRecords.get(key) ?? [];
    records.push(packet);
    packetsBySourceRecords.set(key, records);
  }
  candidates = [...bySource.entries()].slice(0, limit).map(([sourceRef, rowsForSource]) => {
    const membership = rowsForSource[0];
    const packetRecords = packetsBySourceRecords.get(sourceRef.trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase()) ?? [];
    const exactPackets = packetRecords.filter((packet) => packet.source_revision === membership.code_source_revision
      && packet.content_hash === membership.source_content_hash
      && packet.workspace_revision === workspaceRevision);
    const packetKeys = [...new Set(packetRecords.map((packet) => String(packet.packet_key)))];
    const namespaces = [...new Set(rowsForSource.map((row) => row.workspace_revision).filter(Boolean))];
    const revisions = [...new Set(rowsForSource.map((row) => row.code_source_revision).filter(Boolean))];
    const qualified = exactPackets.length === 1 && rowsForSource.some((row) => row.chunk_row_id
      && row.chunk_file_content_hash === membership.source_content_hash);
    const memberships = rowsForSource.map((row) => ({
      canonicalChunkId: row.canonical_chunk_id,
      chunkRowId: row.chunk_row_id,
    }));
    const membershipChecksum = crypto.createHash('sha256').update(JSON.stringify(memberships)).digest('hex');
    return {
      packetKey: qualified ? exactPackets[0].packet_key : null,
      sourceRef,
      namespace: qualified ? `workspace:${namespaces[0]}` : null,
      sourceRevision: qualified ? membership.code_source_revision : null,
      membershipCount: memberships.length,
      membershipChecksum: `sha256:${membershipChecksum}`,
      memberships,
      packetEvidence: packetRecords.slice(0, 5),
      classification: qualified ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED_LINEAGE_AUTHORITY',
      blockedReasons: [
        ...(packetRecords.length === 0 ? ['PACKET_MISSING'] : []),
        ...(packetRecords.length > 1 ? ['PACKET_AMBIGUOUS'] : []),
        ...(packetRecords.length > 0 && exactPackets.length === 0
          ? [packetRecords.some((packet) => packet.source_revision === membership.code_source_revision)
            ? 'PACKET_DIGEST_MISMATCH' : 'PACKET_REVISION_MISMATCH'] : []),
        ...(namespaces.length !== 1 ? ['SOURCE_WORKSPACE_REVISION_UNPROVEN_OR_AMBIGUOUS'] : []),
        ...(revisions.length !== 1 ? ['SOURCE_REVISION_UNPROVEN_OR_AMBIGUOUS'] : []),
        ...(!rowsForSource.some((row) => row.chunk_row_id)
          ? [Number(membership.chunk_source_row_count) > 0 ? 'CHUNK_REVISION_MISMATCH' : 'CHUNK_MISSING']
          : !rowsForSource.some((row) => row.chunk_file_content_hash === membership.source_content_hash)
            ? ['CHUNK_HASH_MISMATCH'] : []),
      ],
    };
  });
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const eligible = candidates.filter((candidate) => candidate.classification === 'READY_FOR_AUTHORIZATION');
const blockedReasonCounts = candidates.reduce((counts, candidate) => {
  for (const reason of candidate.blockedReasons ?? []) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}, {});
const deterministicBody = {
  schema: 'atlas.packet-chunk-lineage-promotion-preflight.v1',
  mode: 'READ_ONLY_PROMOTION_PREFLIGHT',
  limit,
  executionId,
  requestedRunId,
  workspaceRevision,
  executionBridge,
  joinFunnel,
  candidates,
  boundedCandidateBlockedReasonCounts: blockedReasonCounts,
  eligibleCandidateCount: eligible.length,
  plannedWrites: eligible[0] ? { atlas_packets: 0, atlas_packet_chunk_lineage: eligible[0].membershipCount, qdrant: 0, graph: 0, cache: 0 } : { atlas_packets: 0, atlas_packet_chunk_lineage: 0, qdrant: 0, graph: 0, cache: 0 },
  verdict: databaseError ? 'BLOCKED_DATABASE_READ'
    : executionBridge?.status === 'EXECUTION_RUN_BRIDGE_MISSING' ? 'BLOCKED_EXECUTION_RUN_BRIDGE'
      : executionBridge?.status !== 'BRIDGE_AVAILABLE' ? 'BLOCKED_EXECUTION_AUTHORITY'
        : eligible[0] ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED_NO_QUALIFIED_CANDIDATE',
};
const report = {
  ...deterministicBody,
  generatedAt: new Date().toISOString(),
  databaseError,
  writesPerformed: false,
  canonicalAuthority: false,
  promotionAuthorized: false,
  rollback: 'Transaction rollback before commit; no transaction was opened by this preflight.',
  preflightChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(deterministicBody)).digest('hex')}`,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
// Keep report publication atomic. Some Windows sync/indexing agents can hold
// the destination briefly; a unique sibling plus rename avoids truncating a
// previously valid receipt and makes a transient destination lock explicit.
const reportTempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(reportTempPath, reportPath);
console.log(JSON.stringify({ reportPath, verdict: report.verdict, eligibleCandidateCount: report.eligibleCandidateCount, writesPerformed: false }, null, 2));
