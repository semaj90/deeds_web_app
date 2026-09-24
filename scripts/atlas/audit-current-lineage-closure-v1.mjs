#!/usr/bin/env node

/**
 * Compose the current lineage funnel from existing read-only audit receipts.
 * This is an evidence report, not a materializer and not an authority writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';
import { currentRevisionQualifiedPacketCountV1 } from './lib/lineage-packet-qualification-v1.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-lineage-closure-v1.json');
const funnelReportPath = path.join(root, 'docs/reports/parent-atlas-current-lineage-funnel-v1.json');
const inputPaths = {
  sourceCohort: 'docs/reports/current-source-cohort-lineage-v1.json',
  executionOwner: 'docs/reports/current-graphify-execution-owner-decision-v1.json',
  packetChunkJoin: 'docs/reports/current-workspace-packet-chunk-join-v1.json',
  packetWriter: 'docs/reports/packet-writer-lineage-v1.json',
  packetRevisionOwner: 'docs/reports/packet-revision-owner-v1.json',
  packetIdentityReconciliation: 'docs/reports/current-packet-chunk-identity-reconciliation-v1.json',
  packetDigestBridge: 'docs/reports/current-packet-digest-bridge-v1.json',
  sourceOwner: 'docs/reports/current-source-owner-reconciliation-v1.json',
  sourceAuthorityRepairPlan: 'docs/reports/current-source-authority-repair-plan-v1.json',
  sourceEvidence: 'docs/reports/current-source-evidence-hydration-v1.json',
};

function loadReceipt(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`RECEIPT_MISSING:${relativePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

const sourceCohort = loadReceipt(inputPaths.sourceCohort);
const executionOwner = loadReceipt(inputPaths.executionOwner);
const packetChunkJoin = loadReceipt(inputPaths.packetChunkJoin);
const packetWriter = loadReceipt(inputPaths.packetWriter);
const packetRevisionReceipt = loadReceipt(inputPaths.packetRevisionOwner);
const packetIdentityReconciliation = loadReceipt(inputPaths.packetIdentityReconciliation);
const packetDigestBridge = loadReceipt(inputPaths.packetDigestBridge);
const sourceOwner = loadReceipt(inputPaths.sourceOwner);
const sourceAuthorityRepairPlan = loadReceipt(inputPaths.sourceAuthorityRepairPlan);
const sourceEvidence = loadReceipt(inputPaths.sourceEvidence);
const cohort = sourceCohort.counts ?? {};
const join = packetChunkJoin.counts ?? {};
const packetQualifiedRows = currentRevisionQualifiedPacketCountV1(join);
const sourceDelta = sourceOwner.workspace?.admittedSnapshotDelta ?? null;

const workspaceRevision = cohort.currentWorkspaceRevision ?? null;
const executionId = executionOwner.chosenExecutionId ?? packetChunkJoin.executionId ?? null;
const packetRevisionOwner = {
  status: packetRevisionReceipt.status ?? 'NOT_PROVEN',
  ownerKind: packetRevisionReceipt.owner?.kind ?? null,
  derivationRevision: packetRevisionReceipt.owner?.derivationRevision ?? null,
  writerAdoption: packetRevisionReceipt.writerAdoption === true,
  canonicalAuthority: packetRevisionReceipt.canonicalAuthority === true,
  writerVerdict: packetWriter.verdict ?? null,
  sourceRevisionColumn: packetWriter.liveSchemaDependency?.sourceRevisionColumn ?? null,
  nextGate: packetWriter.nextGate ?? null,
};

const report = {
  schema: 'atlas.current-lineage-closure.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EVIDENCE_COMPOSITION',
  scope: {
    sourceCohortRows: cohort.cohortRows ?? null,
    packetChunkJoinLimit: packetChunkJoin.limit ?? 128,
    workspaceRevision,
    executionId,
  },
  workspaceAuthority: {
    status: workspaceRevision ? 'ADMITTED' : 'UNAVAILABLE',
    revision: workspaceRevision,
    cohortAligned: cohort.workspaceRevisionSourceAligned === true && (cohort.currentWorkspaceMatched ?? 0) > 0,
    source: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT',
  },
  executionAuthority: {
    status: executionOwner.readbackVerified === true ? 'APPLIED_AND_READ_BACK' : 'NOT_PROVEN',
    executionId,
    readbackVerified: executionOwner.readbackVerified === true,
    lifecycleOwner: 'NOT_PROVEN_BY_LIFECYCLE_AUDIT',
  },
  sourceProducerAuthority: {
    status: sourceOwner.admission?.status ?? 'NOT_PROVEN',
    ownerDecision: sourceOwner.ownerDecision ?? null,
    safeToPromote: sourceOwner.admission?.safeToPromote === true,
    writesPerformed: sourceOwner.writesPerformed === true,
    repairPlanStatus: sourceAuthorityRepairPlan.status ?? null,
    repairPlanWorkspaceRevision: sourceAuthorityRepairPlan.currentWorkspaceRevision ?? null,
    repairPlanExactCurrentBindingCount: sourceAuthorityRepairPlan.exactCurrentBindingCount ?? null,
    repairPlanAuthorizationRequired: sourceAuthorityRepairPlan.authorizationRequired === true,
    worktreeSnapshotDelta: sourceDelta
      ? {
          requiresSnapshotRefresh: sourceDelta.requiresSnapshotRefresh === true,
          currentOnlyCount: sourceDelta.currentOnlyCount ?? null,
          admittedOnlyCount: sourceDelta.admittedOnlyCount ?? null,
          sharedDigestMismatchCount: sourceDelta.sharedDigestMismatchCount ?? null,
          deltaChecksum: sourceDelta.deltaChecksum ?? null,
        }
      : null,
  },
  packetRevisionOwner,
  funnel: {
    workspaceSourceRows: cohort.cohortRows ?? 0,
    packetQualifiedRows,
    packetQualificationBasis: 'UNIQUE_PACKET_KEY_SOURCE_REVISION_WORKSPACE_KEY_AND_BINDING_PROVENANCE',
    packetChunkQualifiedRows: join.packet_chunk_exact_sources ?? 0,
    astQualifiedRows: sourceEvidence.astRevisionQualifiedRows ?? 0,
    spanQualifiedRows: sourceEvidence.evidenceSpanReady ?? 0,
    candidateOrdinalEligibleRows: 0,
  },
  independentEvidenceCounts: {
    historicalProvenPacketChunkRows: join.packet_chunk_exact_sources ?? 0,
    revisionQualifiedAstRows: sourceEvidence.astRevisionQualifiedRows ?? 0,
  },
  promotionFunnel: {
    workspaceSources: cohort.cohortRows ?? 0,
    packetIdentityQualified: packetQualifiedRows,
    packetRevisionQualified: join.packet_revision_matches ?? 0,
    packetLegacyFullContentIdentityMatches: join.packet_full_identity_matches ?? 0,
    packetChunkCurrentQualified: join.packet_chunk_exact_sources ?? 0,
    packetAstCurrentQualified: 0,
    spanQualified: sourceEvidence.evidenceSpanReady ?? 0,
    candidateOrdinalEligible: 0,
  },
  supportingCounts: {
    sourceRevisionQualifiedRows: cohort.sourceRevisionQualified ?? 0,
    currentWorkspaceMatchedRows: cohort.currentWorkspaceMatched ?? 0,
    provenLineageSources: join.binding_proven_lineage_sources ?? 0,
    packetSourceRows: join.packet_source_rows ?? 0,
    packetRevisionMatches: join.packet_revision_matches ?? 0,
    packetRevisionWorkspaceBindingMatches: packetQualifiedRows,
    packetContentMatches: join.packet_content_matches ?? 0,
    chunkFileContentMatches: join.chunk_file_content_matches ?? 0,
    authoritativeNamespaces: sourceEvidence.authoritativeNamespaces ?? 0,
    evidenceSpanReady: sourceEvidence.evidenceSpanReady ?? 0,
    digestBridgeSampledMembershipRows: packetDigestBridge.counts?.sampledMembershipRows ?? 0,
    digestBridgeCanonicalMatches: packetDigestBridge.counts?.CANONICAL_CONTENT_DIGEST_MATCH ?? 0,
    digestBridgeMissingPackets: packetDigestBridge.counts?.MISSING_PACKET ?? 0,
    digestBridgeMissingPacketDigests: packetDigestBridge.counts?.PACKET_CONTENT_DIGEST_MISSING ?? 0,
  },
  firstFailureBoundary: sourceOwner.admission?.safeToPromote !== true
    ? 'EXECUTION_SOURCE_AUTHORITY'
    : packetRevisionOwner.status !== 'DERIVATION_OWNER_PROVEN' && packetRevisionOwner.status !== 'PACKET_REVISION_OWNER_PROVEN'
    ? 'PACKET_REVISION_OWNER'
    : packetQualifiedRows === 0
      ? 'CURRENT_PACKET_IDENTITY'
      : (sourceEvidence.evidenceSpanReady ?? 0) === 0
        ? 'AST_SPAN_AUTHORITY'
        : 'CANDIDATE_ORDINAL_ADMISSION',
  unresolvedByReason: {
    executionSourceAuthority: sourceOwner.admission?.safeToPromote === true ? 0 : 1,
    workspaceRevisionMismatch: cohort.workspaceMismatchAfterSourceQualification ?? 0,
    packetRevisionOwner: packetRevisionOwner.status === 'DERIVATION_OWNER_PROVEN' || packetRevisionOwner.status === 'PACKET_REVISION_OWNER_PROVEN' ? 0 : 1,
    packetRevisionWriterAdoption: packetRevisionOwner.writerAdoption ? 0 : 1,
    packetIdentityIncomplete: Math.max(0, (join.packet_source_rows ?? 0) - packetQualifiedRows),
    authoritativeNamespaceMissing: sourceEvidence.authoritativeNamespaces === 0 ? 1 : 0,
    evidenceSpanMissing: sourceEvidence.evidenceSpanReady === 0 ? 1 : 0,
  },
  canonicalAuthority: false,
  writesPerformed: false,
  inputReceipts: inputPaths,
};
const reconciliationCounts = packetIdentityReconciliation.counts ?? {};
report.packetRevisionDerivableRows = join.packet_revision_matches ?? 0;
report.packetRevisionUnqualifiedRows = Math.max(0, (reconciliationCounts.packet_ref_matches ?? 0) - (reconciliationCounts.packet_digest_matches ?? 0));
report.packetRevisionUnqualifiedByReason = {
  PACKET_MISSING: reconciliationCounts.missing_packet_rows ?? 0,
  CONTENT_DIGEST_MISSING: reconciliationCounts.packet_content_digest_missing ?? 0,
  CONTENT_DIGEST_MISMATCH: reconciliationCounts.packet_digest_mismatches ?? 0,
};
report.reportChecksum = createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
function atomicWrite(targetPath, contents) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, contents, 'utf8');
  fs.renameSync(temporaryPath, targetPath);
}

atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const funnelReport = {
  schema: 'ParentAtlasCurrentLineageFunnelV1',
  generatedAt: report.generatedAt,
  mode: report.mode,
  workspaceAuthority: report.workspaceAuthority,
  executionAuthority: report.executionAuthority,
  packetRevisionOwner: report.packetRevisionOwner,
  sourceProducerAuthority: report.sourceProducerAuthority,
  independentEvidenceCounts: report.independentEvidenceCounts,
  promotionFunnel: report.promotionFunnel,
  admittedWorkspaceSources: report.funnel.workspaceSourceRows,
  selectedExecutionExactSources: join.graphify_exact_sources ?? 0,
  packetRows: join.packet_source_rows ?? 0,
  packetSourceRevisionMatches: join.packet_revision_matches ?? 0,
  packetRevisionWorkspaceBindingMatches: packetQualifiedRows,
  packetQualificationBasis: report.funnel.packetQualificationBasis,
  packetContentDigestMatches: join.packet_content_matches ?? 0,
  packetRevisionQualified: report.funnel.packetQualifiedRows,
  provenPacketChunkRows: report.funnel.packetChunkQualifiedRows,
  canonicalChunkMatches: join.chunk_file_content_matches ?? 0,
  revisionQualifiedAstRows: report.funnel.astQualifiedRows,
  namespaceQualified: sourceEvidence.authoritativeNamespaces ?? 0,
  spanQualified: report.funnel.spanQualifiedRows,
  fullyQualified: 0,
  candidateOrdinalEligibleRows: report.funnel.candidateOrdinalEligibleRows,
  unresolvedByReason: report.unresolvedByReason,
  firstFailureBoundary: report.firstFailureBoundary,
  scope: report.scope,
  canonicalAuthority: false,
  writesPerformed: false,
  inputReceipts: inputPaths,
};
funnelReport.reportChecksum = createHash('sha256').update(JSON.stringify(funnelReport)).digest('hex');
atomicWrite(funnelReportPath, `${JSON.stringify(funnelReport, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.firstFailureBoundary,
  workspaceSourceRows: report.funnel.workspaceSourceRows,
  packetQualifiedRows: report.funnel.packetQualifiedRows,
  packetChunkQualifiedRows: report.funnel.packetChunkQualifiedRows,
  astQualifiedRows: report.funnel.astQualifiedRows,
  spanQualifiedRows: report.funnel.spanQualifiedRows,
  candidateOrdinalEligibleRows: report.funnel.candidateOrdinalEligibleRows,
  writesPerformed: report.writesPerformed,
  reportPaths: [
    'docs/reports/current-lineage-closure-v1.json',
    'docs/reports/parent-atlas-current-lineage-funnel-v1.json',
  ],
}, null, 2));
