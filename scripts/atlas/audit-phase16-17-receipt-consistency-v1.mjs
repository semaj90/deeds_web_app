/** Fail-closed, read-only consistency audit for bounded Phase 16/17 receipts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const reportPath = resolve(root, 'docs/reports/phase16-17-receipt-consistency-v1.json');
const files = [
  'docs/reports/candidate-feature-gpu-aten-parity-live-20260911.json',
  'docs/reports/candidate-feature-gpu-parity-5k-v1.json',
  'docs/reports/8098-feature-matrix-join-replay-v1.json',
  'docs/reports/8098-candidate-ordinal-roundtrip-v1.json',
  'docs/reports/candidate-feature-gpu-capability-live-20260912.json',
];

const report = {
  schema: 'atlas.phase16-17-receipt-consistency.v1',
  readOnly: true,
  status: 'BLOCKED',
  receipts: [],
  checks: {},
  errors: [],
};

try {
  for (const relativePath of files) {
    const value = JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
    report.receipts.push({
      path: relativePath,
      status: value.status,
      candidateSnapshotRevision: value.candidateSnapshotRevision ?? null,
      graphRevision: value.result?.graphRevision ?? value.graphRevision ?? null,
      featureRevision: value.result?.featureRevision ?? value.featureRevision ?? null,
      torchVersion: value.torchVersion ?? null,
      cudaVersion: value.cudaVersion ?? null,
      backendVersion: value.capabilities?.backendVersion ?? null,
      algorithmRevision: value.capabilities?.algorithmRevision ?? null,
      noWrites: (value.health?.writes
        ? Object.values(value.health.writes).every((flag) => flag === false)
        : false)
        || value.storeWrites === false
        || value.checks?.noWrites === true
        || value.checks?.canonicalWrites === false,
    });
  }

  const candidateRevisions = [...new Set(report.receipts
    .map((receipt) => receipt.candidateSnapshotRevision)
    .filter(Boolean))];
  const graphRevisions = [...new Set(report.receipts
    .map((receipt) => receipt.graphRevision)
    .filter(Boolean))];
  const missingRevisionEvidence = report.receipts.filter((receipt) =>
    receipt.candidateSnapshotRevision === null
    && receipt.graphRevision === null
    && receipt.algorithmRevision === null,
  ).map((receipt) => receipt.path);

  report.checks = {
    receiptsLoaded: report.receipts.length === files.length,
    allReadOnly: report.receipts.every((receipt) => receipt.noWrites),
    oneCandidateSnapshotRevision: candidateRevisions.length <= 1,
    oneGraphRevision: graphRevisions.length <= 1,
    noUnboundReceipts: missingRevisionEvidence.length === 0,
  };
  report.summary = { candidateRevisions, graphRevisions, missingRevisionEvidence };

  if (!Object.values(report.checks).every(Boolean)) {
    report.status = 'PHASE16_17_MIXED_OR_UNBOUND_REVISION_EVIDENCE';
  } else {
    report.status = 'PHASE16_17_RECEIPT_CONSISTENCY_PROVEN';
  }
} catch (error) {
  report.errors.push(String(error?.message ?? error));
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, checks: report.checks, summary: report.summary, errors: report.errors, reportPath }, null, 2));
if (report.status !== 'PHASE16_17_RECEIPT_CONSISTENCY_PROVEN') process.exitCode = 1;
