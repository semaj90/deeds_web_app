#!/usr/bin/env node

/** Read-only classification of the current source -> packet -> chunk identity bridge. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-packet-chunk-identity-reconciliation-v1.json');
const ownerPreflightPath = path.join(root, 'docs/reports/selected-graphify-execution-owner-v1.json');
const ownerPlanPath = path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const revisionIndex = process.argv.indexOf('--workspace-revision');
const executionIndex = process.argv.indexOf('--execution-id');
const workspaceRevision = revisionIndex >= 0 ? process.argv[revisionIndex + 1] : null;
const executionId = executionIndex >= 0 ? process.argv[executionIndex + 1] : null;
if (!workspaceRevision) throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)) throw new Error('INVALID_EXPLICIT_WORKSPACE_REVISION');
if (!executionId) throw new Error('CURRENT_GRAPHIFY_EXECUTION_ID_REQUIRED');
if (!fs.existsSync(ownerPreflightPath)) throw new Error('GRAPHIFY_EXECUTION_OWNER_PREFLIGHT_REQUIRED');
const ownerPreflight = JSON.parse(fs.readFileSync(ownerPreflightPath, 'utf8'));
const ownerPlan = JSON.parse(fs.readFileSync(ownerPlanPath, 'utf8'));
const ownerPlanForChecksum = { ...ownerPlan };
delete ownerPlanForChecksum.generatedAt;
delete ownerPlanForChecksum.reportPath;
const ownerPlanChecksum = `sha256:${createHash('sha256').update(JSON.stringify(ownerPlanForChecksum), 'utf8').digest('hex')}`;
const ownerDecisionValid = (ownerPreflight.status === 'OWNER_SELECTION_VALIDATED_NOT_APPLIED'
  || ownerPreflight.status === 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED')
  && ownerPreflight.selectedExecutionId === executionId
  && ownerPreflight.ownerPlanChecksum === ownerPlanChecksum
  && (ownerPreflight.status === 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED'
    ? ownerPreflight.canonicalAuthority === true
    : ownerPreflight.canonicalAuthority === false)
  && ownerPreflight.safeToApply === false
  && ownerPreflight.writesPerformed === false;
if (!ownerDecisionValid) {
  throw new Error('GRAPHIFY_EXECUTION_OWNER_PREFLIGHT_MISMATCH');
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-packet-chunk-identity-reconciliation-v1',
});

try {
  const result = await pool.query(`
    WITH bindings AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(source_revision::text) AS source_revision,
             lower(content_digest::text) AS content_digest
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND workspace_revision::text = lower($1::text)
    ), packets AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(content_hash::text) AS content_hash,
             lower(sha256::text) AS legacy_sha256,
             packet_key
      FROM public.atlas_packets
    ), lineage AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(source_revision::text) AS source_revision,
             packet_key, canonical_chunk_id, chunk_row_id
      FROM public.atlas_packet_chunk_lineage
      WHERE revision_status = 'PROVEN'
    )
    SELECT
      (SELECT count(*) FROM bindings)::int AS binding_sources,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN packets p ON p.source_ref = b.source_ref)::int AS packet_ref_matches,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN packets p ON p.source_ref = b.source_ref AND p.content_hash = b.content_digest)::int AS packet_digest_matches,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN packets p ON p.source_ref = b.source_ref AND p.legacy_sha256 = b.content_digest)::int AS packet_legacy_sha256_matches,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN packets p ON p.source_ref = b.source_ref AND (p.content_hash = b.content_digest OR p.legacy_sha256 = b.content_digest))::int AS packet_any_digest_matches,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN lineage l ON l.source_ref = b.source_ref)::int AS lineage_ref_matches,
      (SELECT count(DISTINCT b.source_ref) FROM bindings b JOIN packets p ON p.source_ref = b.source_ref JOIN lineage l ON l.packet_key = p.packet_key)::int AS packet_lineage_matches,
      (SELECT count(*) FROM bindings b WHERE NOT EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref))::int AS missing_packet_rows,
      (SELECT count(*) FROM bindings b WHERE EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref AND p.content_hash IS NULL) AND NOT EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref AND p.content_hash = b.content_digest))::int AS packet_content_digest_missing,
      (SELECT count(*) FROM bindings b WHERE EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref AND p.content_hash IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref AND (p.content_hash = b.content_digest OR p.legacy_sha256 = b.content_digest)))::int AS packet_digest_mismatches,
      (SELECT count(*) FROM bindings b WHERE EXISTS (SELECT 1 FROM packets p WHERE p.source_ref = b.source_ref AND p.content_hash = b.content_digest) AND NOT EXISTS (SELECT 1 FROM lineage l WHERE l.source_ref = b.source_ref))::int AS missing_lineage_rows,
      (SELECT count(*) FROM bindings b WHERE EXISTS (SELECT 1 FROM lineage l WHERE l.source_ref = b.source_ref) AND NOT EXISTS (SELECT 1 FROM packets p JOIN lineage l ON l.packet_key = p.packet_key WHERE p.source_ref = b.source_ref))::int AS lineage_packet_join_gaps
  `, [workspaceRevision]);

  const execution = await pool.query(
    `SELECT execution_id::text, workspace_revision::text, status
       FROM public.graphify_executions WHERE execution_id = $1::uuid`,
    [executionId],
  );
  const executionRow = execution.rows[0] ?? null;
  const counts = result.rows[0];
  const report = {
    schema: 'atlas.current-packet-chunk-identity-reconciliation.v1',
    mode: 'READ_ONLY_CENSUS',
    executionId,
    workspaceRevision,
    ownerPreflight: {
      status: ownerPreflight.status,
      selectedExecutionId: ownerPreflight.selectedExecutionId,
      decisionChecksum: ownerPreflight.decisionChecksum,
      ownerPlanChecksum,
      applied: false,
    },
    execution: executionRow,
    counts,
    identityPolicy: {
      wholeSourceDigestIsNotChunkDigest: true,
      packetDigestMatchRequired: true,
      canonicalPacketDigestColumn: 'content_hash',
      legacyPacketDigestColumn: 'sha256',
      legacyPacketDigestIsPromotionEligible: false,
      provenLineageRequired: true,
      syntheticIdentityAllowed: false,
    },
    digestNamespace: {
      canonicalSourceBindingDigest: 'atlas_workspace_source_bindings.content_digest',
      canonicalPacketDigest: 'atlas_packets.content_hash',
      legacyPacketDigest: 'atlas_packets.sha256',
      legacyMatchesAreDiagnosticOnly: true,
    },
    status: Number(counts.packet_digest_matches) === 0
      ? 'PACKET_DIGEST_BRIDGE_MISSING'
      : Number(counts.lineage_ref_matches) === 0
        ? 'PACKET_CHUNK_LINEAGE_MISSING'
        : 'PACKET_CHUNK_IDENTITY_PARTIAL',
    nextGate: 'PACKET-CHUNK-IDENTITY-OWNER-DECISION-01',
    writesPerformed: false,
    writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tempReportPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(tempReportPath, reportPath);
  console.log(JSON.stringify({ status: report.status, counts, reportPath: path.relative(root, reportPath) }, null, 2));
} finally {
  await pool.end();
}
