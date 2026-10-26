import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeFunctionDiscoveryReadbackV1 } from './function-discovery-readback-v1.mjs';

const workspace = `sha256:${'a'.repeat(64)}`;
const source = `sha256:${'b'.repeat(64)}`;
const candidates = [{ symbolVersionId: 'symbol-version:one', sourceRevision: source }];
const row = {
  symbol_version_id: 'symbol-version:one', registry_status: 'active',
  canonical_source_revision: source, canonical_workspace_revision: workspace,
  projection_source_revision: source, projection_workspace_revision: workspace,
};

test('accepts exact canonical and projection readback without inventing identity', () => {
  assert.deepEqual(summarizeFunctionDiscoveryReadbackV1(candidates, [row], workspace), {
    canonicalReadbackVerified: true, projectionReadbackVerified: true, projectionRevisionDifferenceCount: 0,
  });
});

test('a canonical snapshot can qualify while stale projection revisions remain blocked', () => {
  for (const field of ['projection_source_revision', 'projection_workspace_revision']) {
    for (const value of [null, '', 'legacy-sha1', `sha256:${'c'.repeat(64)}`]) {
      const result = summarizeFunctionDiscoveryReadbackV1(candidates, [{ ...row, [field]: value }], workspace);
      assert.equal(result.canonicalReadbackVerified, true);
      assert.equal(result.projectionReadbackVerified, false);
      assert.equal(result.projectionRevisionDifferenceCount, 1);
    }
  }
});

test('rejects empty, missing, unknown, duplicate and inactive canonical rows', () => {
  for (const [input, rows] of [
    [[], []], [candidates, []], [candidates, [{ ...row, symbol_version_id: 'unrelated' }]],
    [[...candidates, ...candidates], [row, row]],
    [candidates, [{ ...row, registry_status: 'inactive' }]],
    [candidates, [{ ...row, canonical_source_revision: null }]],
    [candidates, [{ ...row, canonical_workspace_revision: null }]],
  ]) {
    const result = summarizeFunctionDiscoveryReadbackV1(input, rows, workspace);
    assert.equal(result.canonicalReadbackVerified, false);
    assert.equal(result.projectionReadbackVerified, false);
  }
});

test('duplicate readback cannot substitute for a missing second candidate', () => {
  const result = summarizeFunctionDiscoveryReadbackV1([
    ...candidates, { symbolVersionId: 'symbol-version:two', sourceRevision: source },
  ], [row, row], workspace);
  assert.equal(result.canonicalReadbackVerified, false);
  assert.equal(result.projectionReadbackVerified, false);
});
