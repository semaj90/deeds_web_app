#!/usr/bin/env node
/**
 * PROMOTION-GATE-RECEIPT-CURRENTNESS-01
 *
 * Read-only reconciliation of revision-qualified lane receipts. This audit
 * never promotes a receipt and never treats a successful historical execution
 * as proof for a different workspace revision.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'docs/reports/promotion-gate-receipt-currentness-v1.json');
const explicitWorkspaceRevision = process.argv.slice(2)
  .find((value) => value.startsWith('--workspace-revision='))
  ?.slice('--workspace-revision='.length) ?? null;

const RECEIPT_PATHS = [
  'docs/reports/graphify-snapshot-native-readback-v1.json',
  'docs/reports/graphify-daily-lifecycle-v1.json',
  'docs/reports/current-source-cohort-lineage-v1.json',
  'docs/reports/lineage-semantic-768-cohort-v1.json',
  'docs/reports/current-repair-candidate-feature-matrix-v1.json',
  'docs/reports/feature-ontology-current-cohort-v1.json',
  'docs/reports/qdrant-packet-fanout-v1.json',
  'docs/reports/mcp-tool-selection-audit.json',
  'docs/reports/domain-classifier-lineage-v1.json',
  'docs/reports/semantic-768-contract-proof.json',
  'docs/reports/current-graph-artifact-readiness-v1.json',
  'docs/reports/parent-atlas-promotion-gates-v1.json',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function firstString(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].length > 0) return value[key];
  }
  return null;
}

function firstBoolean(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'boolean') return value[key];
  }
  return null;
}

function firstNumber(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) return value[key];
  }
  return null;
}

function readReceipt(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { receiptPath: relativePath, status: 'MISSING', exists: false };
  }

  const bytes = readFileSync(absolutePath);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    return {
      receiptPath: relativePath,
      status: 'INVALID_JSON',
      exists: true,
      receiptChecksum: sha256(bytes),
      parseError: String(error?.message ?? error),
    };
  }

  const counts = value.counts && typeof value.counts === 'object' ? value.counts : null;
  const candidateMap = value.candidateMap && typeof value.candidateMap === 'object'
    ? value.candidateMap : null;
  const writes = value.writes && typeof value.writes === 'object' ? value.writes : null;

  return {
    receiptPath: relativePath,
    exists: true,
    receiptChecksum: sha256(bytes),
    generatedAt: firstString(value, ['generatedAt', 'generated_at', 'createdAt']),
    status: firstString(value, ['status', 'verdict', 'decision']) ?? 'UNSPECIFIED',
    workspaceRevision: firstString(value, ['workspaceRevision', 'workspace_revision'])
      ?? firstString(candidateMap, ['workspaceRevision', 'workspace_revision'])
      ?? firstString(counts, ['currentWorkspaceRevision', 'workspaceRevision']),
    snapshotRevision: firstString(value, ['snapshotRevision', 'snapshot_revision'])
      ?? firstString(candidateMap, ['snapshotRevision', 'snapshot_revision']),
    sourceCohortChecksum: firstString(value, [
      'sourceCohortChecksum', 'source_cohort_checksum', 'sourcePopulationChecksum',
      'populationChecksum', 'selectionChecksum',
    ]) ?? firstString(candidateMap, ['sourceCohortChecksum', 'source_cohort_checksum', 'selectionChecksum']),
    executionId: firstString(value, ['executionId', 'execution_id']),
    authorityScope: firstString(value, ['authorityScope', 'authority_scope', 'sourceAuthorityStatus']),
    canonicalAuthority: firstBoolean(value, ['canonicalAuthority', 'canonical_authority']),
    writesPerformed: firstBoolean(value, ['writesPerformed', 'writes_performed'])
      ?? (writes ? Object.values(writes).some((item) => item === true) : null),
    selectedSourceCount: firstNumber(value, ['selectedSourceCount', 'sourceCount', 'candidateCount'])
      ?? firstNumber(counts, ['selectedSourceCount', 'candidates', 'cohortRows']),
    value,
  };
}

const receipts = RECEIPT_PATHS.map(readReceipt);
const graphify = receipts.find((receipt) => receipt.receiptPath.endsWith('graphify-snapshot-native-readback-v1.json'));
const lifecycle = receipts.find((receipt) => receipt.receiptPath.endsWith('graphify-daily-lifecycle-v1.json'));
const requestedAnchor = explicitWorkspaceRevision
  ? receipts.find((receipt) => receipt.workspaceRevision === explicitWorkspaceRevision
    && (receipt.receiptPath.endsWith('graphify-snapshot-native-readback-v1.json')
      || receipt.receiptPath.endsWith('graphify-daily-lifecycle-v1.json')))
  : null;
const anchor = requestedAnchor ?? (graphify?.workspaceRevision ? graphify : lifecycle);
const admittedWorkspaceRevision = anchor?.workspaceRevision ?? null;
const admittedSnapshotRevision = anchor?.snapshotRevision ?? null;
const admittedExecutionId = graphify?.executionId ?? lifecycle?.executionId ?? null;
const selectedWorkspaceRevision = explicitWorkspaceRevision ?? admittedWorkspaceRevision;

const revisionValues = [...new Set(receipts
  .map((receipt) => receipt.workspaceRevision)
  .filter((revision) => typeof revision === 'string'))];
const mixedRevisionEvidence = revisionValues.length > 1;
const selectedReceipts = receipts.filter((receipt) => receipt.workspaceRevision === selectedWorkspaceRevision);

for (const receipt of receipts) {
  if (!receipt.exists || receipt.status === 'INVALID_JSON') {
    receipt.currentness = 'UNAVAILABLE';
  } else if (!receipt.workspaceRevision) {
    receipt.currentness = 'UNBOUND';
  } else if (receipt.workspaceRevision === admittedWorkspaceRevision
    && (!admittedSnapshotRevision || !receipt.snapshotRevision || receipt.snapshotRevision === admittedSnapshotRevision)) {
    receipt.currentness = 'CURRENT_TO_GRAPHIFY_ANCHOR';
  } else {
    receipt.currentness = 'HISTORICAL_OR_DIFFERENT_REVISION';
  }
  delete receipt.value;
}

const currentSourceCohort = receipts.find((receipt) => receipt.receiptPath.endsWith('current-source-cohort-lineage-v1.json'));
const graphifyExecutionValidForOwnRevision = Boolean(
  graphify?.status === 'SNAPSHOT_NATIVE_READBACK_PROVEN'
  && graphify.executionId === admittedExecutionId
  && graphify.workspaceRevision === admittedWorkspaceRevision,
);
const graphifyDoesNotProveCurrentCohort = Boolean(
  currentSourceCohort?.workspaceRevision
  && currentSourceCohort.workspaceRevision !== admittedWorkspaceRevision,
);

const violations = [];
if (!admittedWorkspaceRevision) violations.push('GRAPHIFY_REVISION_ANCHOR_MISSING');
if (mixedRevisionEvidence) violations.push('AGGREGATE_MIXED_REVISION_EVIDENCE');
if (!graphifyExecutionValidForOwnRevision) violations.push('GRAPHIFY_EXECUTION_ANCHOR_INVALID');
if (graphifyDoesNotProveCurrentCohort) violations.push('GRAPHIFY_EXECUTION_DOES_NOT_PROVE_CURRENT_SOURCE_COHORT');

const selectedRevisionSafe = Boolean(
  explicitWorkspaceRevision
  && selectedWorkspaceRevision
  && selectedReceipts.length > 0
  && graphifyExecutionValidForOwnRevision,
);

const report = {
  schema: 'PromotionGateReceiptCurrentnessV1',
  generatedAt: new Date().toISOString(),
  status: selectedRevisionSafe
    ? 'SELECTED_REVISION_RECONCILED_HISTORICAL_EVIDENCE'
    : violations.length === 0 ? 'RECEIPTS_CURRENT_TO_SINGLE_REVISION' : 'AGGREGATE_MIXED_REVISION_EVIDENCE',
  proofLevel: 'READ_ONLY_RECONCILIATION',
  authority: false,
  writesPerformed: false,
  admittedWorkspaceRevision,
  admittedSnapshotRevision,
  admittedExecutionId,
  selection: {
    explicitWorkspaceRevision,
    selectedWorkspaceRevision,
    selectedReceiptCount: selectedReceipts.length,
    selectedReceiptPaths: selectedReceipts.map((receipt) => receipt.receiptPath),
    selectedRevisionSafe,
    aggregateStillMixed: mixedRevisionEvidence,
  },
  graphifyReconciliation: {
    executionId: admittedExecutionId,
    validForOwnRevision: graphifyExecutionValidForOwnRevision,
    doesNotProveCurrentSourceCohort: graphifyDoesNotProveCurrentCohort,
    currentSourceCohortRevision: currentSourceCohort?.workspaceRevision ?? null,
  },
  revisionSet: revisionValues,
  mixedRevisionEvidence,
  receiptCount: receipts.length,
  receipts,
  blockerSource: 'AGGREGATE_DERIVED',
  violations,
  nextGate: selectedRevisionSafe
    ? 'RERUN_DEPENDENT_LINEAGE_AUDITS_FOR_SELECTED_REVISION'
    : mixedRevisionEvidence
    ? 'SELECT_ONE_REVISION_AND_RERUN_DEPENDENT_LINEAGE_AUDITS'
    : 'CURRENT_STRUCTURAL_LINEAGE_01',
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
const tempPath = `${REPORT_PATH}.tmp-${process.pid}`;
writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(tempPath, REPORT_PATH);

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  admittedWorkspaceRevision,
  selectedWorkspaceRevision,
  selectedRevisionSafe,
  admittedSnapshotRevision,
  admittedExecutionId,
  receiptCount: report.receiptCount,
  revisionSet: report.revisionSet,
  mixedRevisionEvidence: report.mixedRevisionEvidence,
  graphifyExecutionValidForOwnRevision,
  graphifyDoesNotProveCurrentCohort,
  violations,
  reportPath: 'docs/reports/promotion-gate-receipt-currentness-v1.json',
  writesPerformed: false,
}, null, 2));

if (report.status === 'AGGREGATE_MIXED_REVISION_EVIDENCE' && !selectedRevisionSafe) process.exitCode = 3;
