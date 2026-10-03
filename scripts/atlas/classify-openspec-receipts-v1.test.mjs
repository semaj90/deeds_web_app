import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyOpenSpecReceiptsV1 } from './classify-openspec-receipts-v1.mjs';

test('confirms receipt type without marking the receipt proof-eligible', () => {
  const report = classifyOpenSpecReceiptsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    evidenceReceipts: [],
    historicalReceiptCandidates: [
      {
        uri: 'docs/reports/cuvs-cosine-768-proof-v1.json',
        schema: 'atlas.cuvs-cosine-768-proof.v1',
        canonicalSchemaValid: true,
        fields: {
          identity_match: true,
          score_match: true,
        },
      },
      {
        uri: 'docs/reports/gpu-fp32-exact-receipt.json',
        schema: null,
        canonicalSchemaValid: true,
        fields: {
          receipt_kind: 'GPU_FP32_EXACT_REPLAY_PROVEN',
          producer_id: 'gpu',
          input_hash: 'sha256:input',
          output_hash: 'sha256:output',
        },
      },
      {
        uri: 'docs/reports/symbol-reconciliation-writer-v1.json',
        schema: 'atlas.symbol-reconciliation-writer-receipt.v1',
        canonicalSchemaValid: true,
        fields: {
          action: 'CANONICALIZATION_APPLIED',
          apply: true,
        },
      },
    ],
  });

  const byUri = new Map(report.receipts.map((receipt) => [receipt.uri, receipt]));
  assert.equal(byUri.get('docs/reports/cuvs-cosine-768-proof-v1.json').candidateType, 'VECTOR_READBACK');
  assert.equal(byUri.get('docs/reports/gpu-fp32-exact-receipt.json').candidateType, 'STATIC_AUDIT');
  assert.equal(byUri.get('docs/reports/symbol-reconciliation-writer-v1.json').candidateType, 'CONTROLLED_APPLY');
  assert.equal(report.receipts.every((receipt) => receipt.typeConfirmed === true), true);
  assert.equal(report.receipts.every((receipt) => !Object.hasOwn(receipt, 'proofEligibleType')), true);
  assert.equal(report.summary.typeConfirmedCount, 3);
});

test('does not infer OpenSpec scope from implementation source refs alone', () => {
  const report = classifyOpenSpecReceiptsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    evidenceReceipts: [],
    historicalReceiptCandidates: [
      {
        uri: 'docs/reports/atlas-proof.json',
        schema: 'atlas.static-audit.v1',
        canonicalSchemaValid: true,
        fields: { sourceRefs: ['scripts/atlas/audit-example.mjs'] },
      },
      {
        uri: 'docs/reports/task-proof.json',
        schema: 'atlas.static-audit.v1',
        canonicalSchemaValid: true,
        fields: { sourceRefs: ['openspec/changes/change-a/tasks.md#L12'] },
      },
    ],
  });

  const byUri = new Map(report.receipts.map((receipt) => [receipt.uri, receipt]));
  assert.equal(byUri.get('docs/reports/atlas-proof.json').scopeDisposition, 'ATLAS_UNSCOPED');
  assert.equal(byUri.get('docs/reports/task-proof.json').scopeDisposition, 'OPENSPEC_SCOPED');
});
