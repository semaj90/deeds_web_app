#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundlePath = path.join(root, 'docs', 'reports', 'domain-classifier-weak-label-bundle-v1.json');
const checkpointPath = path.join(root, 'models', 'domain-classifier', 'checkpoint.joblib');
const reportPath = path.join(root, 'docs', 'reports', 'domain-classifier-training-readiness-v1.json');
const sourceSnapshotAuditPath = path.resolve(root, process.env.ATLAS_KNOWLEDGE_SOURCE_SNAPSHOT_REPORT ?? path.join('.tmp', 'knowledge-source-snapshot-live-v1.json'));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function checksum(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function validRevision(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/i.test(value);
}

let bundle = null;
let loadError = null;
try {
  bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
} catch (error) {
  loadError = String(error);
}

let sourceSnapshotAudit = null;
let sourceSnapshotAuditError = null;
try {
  sourceSnapshotAudit = JSON.parse(readFileSync(sourceSnapshotAuditPath, 'utf8'));
} catch (error) {
  sourceSnapshotAuditError = String(error);
}

const rows = Array.isArray(bundle?.rows) ? bundle.rows : [];
const labels = [...new Set(rows.map((row) => row?.weakLabel).filter((value) => typeof value === 'string' && value.trim()))].sort();
const revisionQualifiedRows = rows.filter((row) => validRevision(row?.sourceRevision));
const contentQualifiedRows = rows.filter((row) => validRevision(row?.contentChecksum));
const authorityQualifiedRows = rows.filter((row) => row?.sourceAuthorityStatus === 'CURRENT_ADMITTED');
const gateReasons = [];

if (loadError) gateReasons.push('LABEL_BUNDLE_UNAVAILABLE');
if (!rows.length) gateReasons.push('LABEL_ROWS_EMPTY');
if (rows.length && revisionQualifiedRows.length !== rows.length) gateReasons.push('SOURCE_REVISION_MISSING_OR_INVALID');
if (rows.length && contentQualifiedRows.length !== rows.length) gateReasons.push('CONTENT_CHECKSUM_MISSING_OR_INVALID');
if (!authorityQualifiedRows.length || authorityQualifiedRows.length !== rows.length) gateReasons.push('SOURCE_AUTHORITY_NOT_CURRENT_ADMITTED');
if (sourceSnapshotAuditError) gateReasons.push('SOURCE_SNAPSHOT_AUDIT_UNAVAILABLE');
else if (sourceSnapshotAudit?.status !== 'PROVEN' || sourceSnapshotAudit?.sourceRegistryParity !== true || sourceSnapshotAudit?.worktreeFingerprintParity !== true) gateReasons.push('CURRENT_WORKTREE_SNAPSHOT_NOT_ADMITTED');
if (labels.length < 2) gateReasons.push('MINIMUM_CLASS_COVERAGE_UNMET');
gateReasons.push('OPERATOR_MINIMUM_COVERAGE_UNSPECIFIED');
if (!existsSync(checkpointPath)) gateReasons.push('CHECKPOINT_NOT_PRESENT');

const report = {
  schema: 'atlas.domain-classifier-training-readiness.v1',
  status: gateReasons.length === 0 ? 'TRAINING_READY_REVIEW_REQUIRED' : 'DOMAIN_CLASSIFIER_TRAINING_READY_FALSE',
  input: {
    bundlePath: path.relative(root, bundlePath).replaceAll('\\', '/'),
    bundleSchema: bundle?.schema ?? null,
    taxonomyRevision: bundle?.taxonomyRevision ?? null,
    bundleFileSetChecksum: bundle?.fileSetChecksum ?? null,
    bundleLabelSetChecksum: bundle?.labelSetChecksum ?? null,
  },
  coverage: {
    rowCount: rows.length,
    labels,
    labelCount: labels.length,
    revisionQualifiedRows: revisionQualifiedRows.length,
    contentQualifiedRows: contentQualifiedRows.length,
    currentAdmittedRows: authorityQualifiedRows.length,
  },
  sourceSnapshot: {
    path: path.relative(root, sourceSnapshotAuditPath).replaceAll('\\', '/'),
    status: sourceSnapshotAudit?.status ?? null,
    workspaceRevision: sourceSnapshotAudit?.workspaceRevision ?? null,
    sourceRegistryParity: sourceSnapshotAudit?.sourceRegistryParity ?? false,
    worktreeFingerprintParity: sourceSnapshotAudit?.worktreeFingerprintParity ?? false,
    exactRegistryMatches: sourceSnapshotAudit?.exactRegistryMatches ?? 0,
    sourceCount: sourceSnapshotAudit?.sourceCount ?? 0,
    issueCount: sourceSnapshotAudit?.issueCount ?? null,
    error: sourceSnapshotAuditError,
  },
  gateReasons,
  checkpoint: {
    path: path.relative(root, checkpointPath).replaceAll('\\', '/'),
    present: existsSync(checkpointPath),
    writeAuthorized: false,
  },
  operatorApproval: {
    minimumClassCount: null,
    minimumRowsPerClass: null,
    approved: false,
  },
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
};
report.reportChecksum = checksum(report);

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, gateReasons, rowCount: rows.length, labels, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
if (report.status !== 'TRAINING_READY_REVIEW_REQUIRED') process.exitCode = 1;
