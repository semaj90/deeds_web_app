#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePromotionReceiptCohort } from './reconcile-promotion-receipt-cohort-v1.mjs';

const WORKSPACE = 'sha256:' + 'a'.repeat(64);
const OTHER_WORKSPACE = 'sha256:' + 'b'.repeat(64);
const CANDIDATE = 'candidate:v1';
const ORDINAL = 'c'.repeat(64);
const GRAPH = 'sha256:' + 'd'.repeat(64);

function rawReceipts(entries) {
  return new Map(Object.entries(entries).map(([receiptPath, value]) => [receiptPath, {
    exists: true,
    relativePath: receiptPath,
    value,
  }]));
}

test('proves one coherent cohort and leaves stale receipts historical', () => {
  const currentness = {
    selection: { selectedWorkspaceRevision: WORKSPACE },
    admittedWorkspaceRevision: WORKSPACE,
    receipts: [
      { receiptPath: 'current.json', exists: true, receiptChecksum: '1', workspaceRevision: WORKSPACE },
      { receiptPath: 'historical.json', exists: true, receiptChecksum: '2', workspaceRevision: OTHER_WORKSPACE },
    ],
  };
  const ordinalAdmission = {
    candidateSnapshotRevision: CANDIDATE,
    ordinalMapChecksum: ORDINAL,
    sourceMap: 'map.json',
  };
  const ordinalMap = { workspaceRevision: WORKSPACE };
  const graphReport = {
    selected: {
      workspaceRevision: WORKSPACE,
      graphRevision: GRAPH,
      reviewOnly: false,
      workspaceRevisionMatch: true,
    },
  };
  const report = evaluatePromotionReceiptCohort({
    currentness,
    ordinalAdmission,
    ordinalMap,
    graphReport,
    rawReceipts: rawReceipts({
      'current.json': {
        workspaceRevision: WORKSPACE,
        candidateSnapshotRevision: CANDIDATE,
        ordinalMapChecksum: ORDINAL,
        graphRevision: GRAPH,
      },
      'historical.json': { workspaceRevision: OTHER_WORKSPACE },
    }),
  });

  assert.equal(report.status, 'PROMOTION_RECEIPT_COHORT_PROVEN');
  assert.deepEqual(report.currentReceiptRefs, ['current.json']);
  assert.equal(report.excludedReceipts[0].classification, 'STALE_WORKSPACE');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.writesPerformed, false);
});

test('blocks when ordinal map lacks selected workspace binding', () => {
  const report = evaluatePromotionReceiptCohort({
    currentness: {
      selection: { selectedWorkspaceRevision: WORKSPACE },
      admittedWorkspaceRevision: WORKSPACE,
      receipts: [{ receiptPath: 'current.json', exists: true, workspaceRevision: WORKSPACE }],
    },
    ordinalAdmission: { candidateSnapshotRevision: CANDIDATE, ordinalMapChecksum: ORDINAL },
    ordinalMap: {},
    graphReport: {
      selected: { workspaceRevision: WORKSPACE, graphRevision: GRAPH, reviewOnly: false, workspaceRevisionMatch: true },
    },
    rawReceipts: rawReceipts({ 'current.json': { workspaceRevision: WORKSPACE } }),
  });

  assert.equal(report.status, 'PROMOTION_RECEIPT_COHORT_BLOCKED');
  assert.ok(report.blockers.includes('ORDINAL_MAP_WORKSPACE_BINDING_MISSING'));
});

test('blocks when no graph revision is proven for selected workspace', () => {
  const report = evaluatePromotionReceiptCohort({
    currentness: {
      selection: { selectedWorkspaceRevision: WORKSPACE },
      receipts: [{ receiptPath: 'current.json', exists: true, workspaceRevision: WORKSPACE }],
    },
    ordinalAdmission: { candidateSnapshotRevision: CANDIDATE, ordinalMapChecksum: ORDINAL },
    ordinalMap: { workspaceRevision: WORKSPACE },
    graphReport: {
      selected: { workspaceRevision: OTHER_WORKSPACE, graphRevision: GRAPH, reviewOnly: false, workspaceRevisionMatch: true },
    },
    rawReceipts: rawReceipts({ 'current.json': { workspaceRevision: WORKSPACE } }),
  });

  assert.equal(report.status, 'PROMOTION_RECEIPT_COHORT_BLOCKED');
  assert.ok(report.blockers.includes('CURRENT_GRAPH_REVISION_NOT_PROVEN_FOR_SELECTED_WORKSPACE'));
});
