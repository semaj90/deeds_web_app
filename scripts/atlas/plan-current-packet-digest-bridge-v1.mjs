#!/usr/bin/env node
/**
 * CURRENT-PACKET-DIGEST-BRIDGE-01
 *
 * Read-only planner for the bridge between immutable Graphify source
 * membership and packet content identity.  It never updates packet rows and
 * never treats a legacy digest match as promotion authority.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyPacketDigestBridgeRows } from './lib/classify-packet-digest-bridge-v1.mjs';

const root = REPO_ROOT;
const scratchRoot = path.resolve(root, '.tmp/atlas');
const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const limit = Math.max(1, Math.min(Number(arg('--limit', '25')), 500));
const ownerPreflightPath = path.resolve(root, arg('--owner-preflight', 'docs/reports/selected-graphify-execution-owner-v1.json'));
const ownerPlanPath = path.resolve(root, arg('--owner-plan', 'docs/reports/current-graphify-execution-owner-resolution-v1.json'));
const reportPath = path.resolve(root, arg('--output', '.tmp/atlas/current-packet-digest-bridge-v1.json'));
for (const inputPath of [ownerPreflightPath, ownerPlanPath]) {
  const relative = path.relative(root, inputPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OWNER_RECEIPT_PATH_MUST_REMAIN_UNDER_REPOSITORY');
}
const reportRelativeToScratch = path.relative(scratchRoot, reportPath);
if (reportRelativeToScratch.startsWith('..') || path.isAbsolute(reportRelativeToScratch)) {
  throw new Error('REPORT_OUTPUT_MUST_REMAIN_UNDER_TMP_ATLAS');
}
if (!workspaceRevision || !executionId) {
  throw new Error('EXPLICIT_WORKSPACE_REVISION_AND_EXECUTION_ID_REQUIRED');
}
if (!(await fs.stat(ownerPreflightPath).catch(() => null))) throw new Error('GRAPHIFY_EXECUTION_OWNER_PREFLIGHT_REQUIRED');
const ownerPreflight = JSON.parse(await fs.readFile(ownerPreflightPath, 'utf8'));
const ownerPlan = JSON.parse(await fs.readFile(ownerPlanPath, 'utf8'));
const ownerPlanForChecksum = { ...ownerPlan };
delete ownerPlanForChecksum.generatedAt;
delete ownerPlanForChecksum.reportPath;
const currentOwnerPlanChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(ownerPlanForChecksum), 'utf8').digest('hex')}`;
const ownerDecisionValid = (ownerPreflight.status === 'OWNER_SELECTION_VALIDATED_NOT_APPLIED'
  || ownerPreflight.status === 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED')
  && ownerPlan.admittedWorkspaceRevision === workspaceRevision
  && ownerPlan.canonicalAuthority === false
  && ownerPlan.writesPerformed === false
  && ownerPlan.safeToApply === false
  && ownerPlan.candidates?.some((candidate) => candidate.execution_id === executionId
    && candidate.sourceMembershipExact === true)
  && ownerPreflight.selectedExecutionId === executionId
  && ownerPreflight.ownerPlanChecksum === currentOwnerPlanChecksum
  && (ownerPreflight.status === 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED'
    ? ownerPreflight.canonicalAuthority === true
    : ownerPreflight.canonicalAuthority === false)
  && ownerPreflight.safeToApply === false
  && ownerPreflight.writesPerformed === false;
if (!ownerDecisionValid) {
  throw new Error('GRAPHIFY_EXECUTION_OWNER_PREFLIGHT_MISMATCH');
}

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const checksum = (value) => sha256(JSON.stringify(value));
const writeReport = async (report) => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, reportPath);
};
const reportRef = () => path.relative(root, reportPath).replaceAll('\\', '/');

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-packet-digest-bridge-v1',
});
let client;
let rows;
let databaseError = null;
try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(`
    WITH members AS (
      SELECT source_ref, workspace_revision, code_source_revision, content_hash,
             byte_length
       FROM public.graphify_execution_file_membership_v2
       WHERE execution_id = $1
         AND workspace_revision = $2
       ORDER BY source_ref
       LIMIT $3
    ), packets AS (
      SELECT packet_key::text AS packet_key, source_ref,
             content_hash::text AS content_hash,
             sha256::text AS legacy_sha256,
             source_revision::text AS packet_source_revision
        FROM public.atlas_packets
    )
    SELECT m.source_ref,
           m.workspace_revision::text AS workspace_revision,
           m.code_source_revision::text AS code_source_revision,
           m.content_hash::text AS member_content_hash,
           m.byte_length,
           p.packet_key,
           p.content_hash AS packet_content_hash,
           p.legacy_sha256,
           p.packet_source_revision
      FROM members m
      LEFT JOIN packets p
        ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
         = lower(regexp_replace(regexp_replace(btrim(m.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
     ORDER BY m.source_ref, p.packet_key
  `, [executionId, workspaceRevision, limit]);
  rows = result.rows;
  await client.query('ROLLBACK');
} catch (error) {
  databaseError = {
    name: error?.name ?? 'Error',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  };
} finally {
  client?.release();
  await pool.end();
}

if (databaseError) {
  const report = {
    schema: 'parent-atlas.current-packet-digest-bridge.v1',
    status: 'POSTGRES_UNAVAILABLE',
    generatedAt: new Date().toISOString(),
    inputs: { workspaceRevision, executionId, limit, membershipOwner: 'graphify_execution_file_membership_v2',
      ownerPreflightStatus: ownerPreflight.status, ownerDecisionChecksum: ownerPreflight.decisionChecksum,
      ownerPlanChecksum: currentOwnerPlanChecksum },
    counts: { sampledMembershipRows: 0, CANONICAL_CONTENT_DIGEST_MATCH: 0,
      PACKET_SOURCE_REVISION_MISSING: 0, LEGACY_DIGEST_ONLY: 0,
      PACKET_CONTENT_DIGEST_MISSING: 0, MISSING_PACKET: 0,
      PACKET_CONTENT_DIGEST_MISMATCH: 0 },
    databaseError,
    safeToApply: false,
    canonicalAuthority: false,
    writesPerformed: false,
    nextGate: 'POSTGRES_HEALTH_THEN_PACKET-DIGEST-BRIDGE-RERUN',
    reportPath: reportRef(),
    admissionAuthorized: false,
  };
  await writeReport(report);
  console.log(JSON.stringify({ status: report.status, databaseError,
    writesPerformed: false, reportPath: report.reportPath }, null, 2));
  process.exit(0);
}

const classifications = classifyPacketDigestBridgeRows(rows);
const planned = classifications.map((item) => {
  const row = rows.find((candidate) => normalizeRef(candidate.source_ref) === normalizeRef(item.sourceRef)
    && candidate.workspace_revision === item.workspaceRevision
    && candidate.code_source_revision === item.codeSourceRevision
    && candidate.member_content_hash === item.memberContentHash
    && (item.packetKey === null || candidate.packet_key === item.packetKey)) ?? {};
  return {
    sourceRef: item.sourceRef,
    normalizedSourceRef: normalizeRef(item.sourceRef),
    packetKey: item.packetKey,
    packetCandidates: item.packetCandidates ?? [],
    workspaceRevision: item.workspaceRevision,
    codeSourceRevision: item.codeSourceRevision,
    packetSourceRevision: row.packet_source_revision
      ? String(row.packet_source_revision).toLowerCase()
      : null,
    memberContentHash: row.member_content_hash,
    packetContentHash: row.packet_content_hash,
    legacySha256: row.legacy_sha256,
    byteLength: Number(row.byte_length),
    classification: item.classification,
    digestCrosswalkEligible: item.promotionEligible,
    admissionAuthorized: false,
  };
});

const counts = Object.fromEntries(['CANONICAL_CONTENT_DIGEST_MATCH', 'PACKET_SOURCE_REVISION_MISSING',
  'LEGACY_DIGEST_ONLY', 'PACKET_CONTENT_DIGEST_MISSING', 'MISSING_PACKET', 'PACKET_IDENTITY_AMBIGUOUS',
  'PACKET_CANONICAL_ROW_CONFLICT', 'PACKET_CONTENT_DIGEST_MISMATCH']
  .map((kind) => [kind, planned.filter((row) => row.classification === kind).length]));
const report = {
  schema: 'parent-atlas.current-packet-digest-bridge.v1',
  status: counts.CANONICAL_CONTENT_DIGEST_MATCH === planned.length && planned.length > 0
    ? 'PACKET_DIGEST_CROSSWALK_ONLY'
    : 'PACKET_DIGEST_BRIDGE_BLOCKED',
  generatedAt: new Date().toISOString(),
  inputs: { workspaceRevision, executionId, limit, membershipOwner: 'graphify_execution_file_membership_v2',
    ownerPreflightStatus: ownerPreflight.status, ownerDecisionChecksum: ownerPreflight.decisionChecksum,
    ownerPlanChecksum: currentOwnerPlanChecksum },
  counts: { sampledMembershipRows: planned.length, ...counts },
  digestPolicy: {
    memberWholeSourceDigest: 'graphify_execution_file_membership_v2.content_hash',
    canonicalPacketDigest: 'atlas_packets.content_hash',
    canonicalPacketSourceRevision: 'atlas_packets.source_revision',
    packetSourceRevisionRequiredForPromotion: true,
    legacyPacketDigest: 'atlas_packets.sha256',
    legacyDigestPromotionEligible: false,
    codeSourceRevisionIsNotCanonicalSourceRevision: true,
  },
  rows: planned,
  candidateChecksum: checksum(planned.map((row) => [row.sourceRef, row.packetKey, row.classification,
    row.memberContentHash, row.packetContentHash, row.legacySha256, row.codeSourceRevision, row.packetSourceRevision])),
  safeToApply: false,
  canonicalAuthority: false,
  admissionAuthorized: false,
  writesPerformed: false,
  nextGate: 'PACKET-DIGEST-BRIDGE-AUTHORIZATION-AND-READBACK-01',
  reportPath: reportRef(),
};
report.reportChecksum = sha256(JSON.stringify(report));
await writeReport(report);
console.log(JSON.stringify({ status: report.status, counts: report.counts, candidateChecksum: report.candidateChecksum,
  writesPerformed: false, reportPath: report.reportPath }, null, 2));
