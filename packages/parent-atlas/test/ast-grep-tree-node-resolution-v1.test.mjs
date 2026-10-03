import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAstGrepTreeNodeIdsV1 } from '../dist/core/ast-grep-tree-node-resolution-v1.js';

const sha = 'a'.repeat(64);
const observation = (overrides = {}) => ({
  observation_id: 'obs-1', rule_id: 'rule-1', source_ref: 'src/example.ts', source_revision: `sha256:${sha}`,
  byte_start: 10, byte_end: 24, matched_text_hash: sha, captures: { name: 'run' },
  observation_kind: 'method_definition', confidence: 1, extractor_revision: `sha256:${sha}`, canonical_authority: false,
  ...overrides,
});
const candidate = (overrides = {}) => ({
  tree_node_id: 'tree-node-exact', relative_path: 'src/example.ts', source_revision: `sha256:${sha}`,
  start_byte: 10, end_byte: 24, ...overrides,
});

test('resolves tree node only on exact path, revision, and byte-span match', () => {
  const [result] = resolveAstGrepTreeNodeIdsV1({ observations: [observation()], candidates: [candidate()] });
  assert.equal(result.status, 'EXACT');
  assert.equal(result.treeNodeId, 'tree-node-exact');
  assert.equal(result.canonicalAuthority, false);
});

test('preserves path, revision, span, and duplicate-match failures without inventing an ID', () => {
  const results = resolveAstGrepTreeNodeIdsV1({
    observations: [observation(), observation({ observation_id: 'obs-path', source_ref: 'other.ts' }), observation({ observation_id: 'obs-rev', source_revision: `sha256:${'b'.repeat(64)}` }), observation({ observation_id: 'obs-span', byte_start: 11 })],
    candidates: [candidate(), candidate({ tree_node_id: 'tree-node-duplicate' })],
  });
  assert.deepEqual(results.map(({ status, treeNodeId }) => [status, treeNodeId]), [
    ['AMBIGUOUS', undefined], ['PATH_MISMATCH', undefined], ['REVISION_MISMATCH', undefined], ['SPAN_MISMATCH', undefined],
  ]);
});
