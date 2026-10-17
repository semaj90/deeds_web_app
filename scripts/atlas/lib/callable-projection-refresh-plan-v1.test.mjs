import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCallableProjectionRefreshPlanV1 } from './callable-projection-refresh-plan-v1.mjs';

const sourceRevision = `sha256:${'a'.repeat(64)}`;
const workspaceRevision = `sha256:${'b'.repeat(64)}`;
function input() {
  const symbol = {
    symbol_version_id: `symbol-version:${'c'.repeat(64)}`, stable_symbol_id: 'stable-symbol:one',
    packet_key: 'packet:one', source_ref: 'src/one.ts', source_revision: sourceRevision,
    workspace_revision: workspaceRevision, qualified_name: 'one', signature_normalized: 'function one()',
    upstream_node_id: 'native-node-one', registry_status: 'active',
  };
  return {
    symbol, workspaceRevision,
    projections: [{ ...symbol, tree_node_id: 'native-node-one', source_revision: 'legacy-token', workspace_revision: 'old-workspace', updated_at: '2026-08-30T00:00:00Z' }],
    qualification: { status: 'QUALIFIED', receipt: {
      qualificationOutcome: 'QUALIFIED', symbolVersionId: symbol.symbol_version_id,
      sourceRevision, workspaceRevision, packetKey: symbol.packet_key,
      treeNodeId: symbol.upstream_node_id, sourceContentHash: 'a'.repeat(64),
      receiptChecksum: 'd'.repeat(64), snapshotChecksum: 'e'.repeat(64), evidenceRefs: ['source:one'],
    } },
  };
}

test('proposes only canonical field deltas with rollback/CAS evidence, never write authority', () => {
  const data = input();
  const before = JSON.stringify(data);
  const result = buildCallableProjectionRefreshPlanV1(data);
  assert.equal(result.status, 'RECONCILIATION_PROPOSED');
  assert.deepEqual(result.proposedChanges.map((change) => change.field), ['source_revision', 'workspace_revision']);
  assert.deepEqual(result.expectedProjection, data.projections[0]);
  assert.equal(result.eligibleForApply, false);
  assert.equal(result.applyImplemented, false);
  assert.equal(result.writesPerformed, false);
  assert.ok(result.requirements.includes('POST_P20_REVISION_WRITE_GATE'));
  assert.equal(JSON.stringify(data), before);
});

test('seals deterministic plans independently of object key insertion order', () => {
  const data = input();
  const first = buildCallableProjectionRefreshPlanV1(data);
  const reordered = {
    ...data, symbol: Object.fromEntries(Object.entries(data.symbol).reverse()),
    projections: [Object.fromEntries(Object.entries(data.projections[0]).reverse())],
  };
  assert.equal(buildCallableProjectionRefreshPlanV1(reordered).planChecksum, first.planChecksum);
  assert.equal(buildCallableProjectionRefreshPlanV1(data).planChecksum, first.planChecksum);
  data.projections[0].updated_at = 'changed';
  assert.notEqual(buildCallableProjectionRefreshPlanV1(data).planChecksum, first.planChecksum);
});

test('an already matching projection yields no changes without granting authority', () => {
  const data = input();
  Object.assign(data.projections[0], data.symbol);
  const result = buildCallableProjectionRefreshPlanV1(data);
  assert.equal(result.status, 'NO_CHANGES');
  assert.deepEqual(result.proposedChanges, []);
  assert.equal(result.eligibleForApply, false);
});

test('missing, ambiguous or differently identified projections are blocked', () => {
  for (const projections of [[], [input().projections[0], input().projections[0]], [{ ...input().projections[0], stable_symbol_id: 'different' }]]) {
    const result = buildCallableProjectionRefreshPlanV1({ ...input(), projections });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.proposedChanges, []);
  }
});

test('requires active canonical SHA-256 source/workspace identity', () => {
  for (const patch of [{ registry_status: 'inactive' }, { source_revision: 'git-token' }, { workspace_revision: 'old' }]) {
    const data = input();
    Object.assign(data.symbol, patch);
    assert.equal(buildCallableProjectionRefreshPlanV1(data).status, 'BLOCKED');
  }
});

test('rejects missing, stale and proxy qualification evidence', () => {
  for (const patch of [
    { sourceRevision: 'wrong' }, { packetKey: 'other' }, { treeNodeId: 'other' },
    { sourceContentHash: '0'.repeat(64) }, { receiptChecksum: null },
    { snapshotChecksum: null }, { qualificationOutcome: 'PROPOSAL' },
  ]) {
    const data = input();
    Object.assign(data.qualification.receipt, patch);
    assert.equal(buildCallableProjectionRefreshPlanV1(data).reason, 'SOURCE_AST_QUALIFICATION_REQUIRED');
  }
  assert.equal(buildCallableProjectionRefreshPlanV1({ ...input(), qualification: null }).status, 'BLOCKED');
});

test('does not silently rewrite a mismatched AST identity bridge', () => {
  const data = input();
  data.projections[0].tree_node_id = 'unrelated-node';
  const result = buildCallableProjectionRefreshPlanV1(data);
  assert.equal(result.reason, 'PROJECTION_AST_IDENTITY_RECONCILIATION_REQUIRED');
  assert.equal(result.status, 'RECONCILIATION_REQUIRES_AST_REVIEW');
  assert.equal(result.eligibleForApply, false);
  assert.ok(result.requirements.includes('REVIEW_TYPED_AST_IDENTITY_BRIDGE_AND_STORAGE_CONSTRAINTS'));
  assert.deepEqual(result.proposedChanges.at(-1), { field: 'tree_node_id', before: 'unrelated-node', after: 'native-node-one' });
});

test('does not invent signature enrichment when the canonical signature column is null', () => {
  const data = input();
  data.symbol.signature_normalized = null;
  data.projections[0].signature_normalized = null;
  const result = buildCallableProjectionRefreshPlanV1(data);
  assert.equal(result.status, 'RECONCILIATION_PROPOSED');
  assert.equal(result.canonicalSignatureMissing, true);
  assert.ok(result.requirements.includes('REVIEW_CANONICAL_SIGNATURE_ENRICHMENT_SEPARATELY'));
  assert.equal(result.proposedChanges.some((change) => change.field === 'signature_normalized'), false);
});
