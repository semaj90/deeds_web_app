import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTaxonomyForestV1 } from './taxonomy-forest-invariants-v1.mjs';

test('accepts a rooted forest and records independent multi-parent typed relations', () => {
  const result = evaluateTaxonomyForestV1(
    [{ node_key: 'root', parent_key: null }, { node_key: 'a', parent_key: 'root' }, { node_key: 'b', parent_key: 'root' }],
    [
      { relation: 'PART_OF', source_key: 'p1', target_key: 'x' },
      { relation: 'PART_OF', source_key: 'p2', target_key: 'x' },
      { relation: 'IS_A', source_key: 'p1', target_key: 'y' },
    ],
  );
  assert.equal(result.isBranchingForest, true);
  assert.equal(result.nodeCount, 3);
  assert.equal(result.rootCount, 1);
  assert.deepEqual(result.typedRelationMultiParentCounts, { PART_OF: 1 });
  assert.equal(result.typedRelationDag.PART_OF.isDag, true);
  assert.equal(result.typedRelationDag.PART_OF.multiParentTargetCount, 1);
  assert.equal(result.canonicalAuthority, false);
});

test('rejects a cycle in a typed relation graph without treating multiparents as a forest violation', () => {
  const result = evaluateTaxonomyForestV1([], [
    { relation: 'CALLS', source_key: 'a', target_key: 'b' },
    { relation: 'CALLS', source_key: 'b', target_key: 'a' },
  ]);
  assert.equal(result.typedRelationDag.CALLS.isDag, false);
  assert.equal(result.isBranchingForest, true);
});

test('fails closed for missing parent, cycles, and duplicate node keys', () => {
  const missing = evaluateTaxonomyForestV1([{ node_key: 'a', parent_key: 'absent' }]);
  assert.equal(missing.missingParentCount, 1);
  assert.equal(missing.isBranchingForest, false);
  const cycle = evaluateTaxonomyForestV1([{ node_key: 'a', parent_key: 'b' }, { node_key: 'b', parent_key: 'a' }]);
  assert.ok(cycle.cycleStartCount > 0);
  assert.equal(cycle.isBranchingForest, false);
  const duplicate = evaluateTaxonomyForestV1([{ node_key: 'a', parent_key: null }, { node_key: 'a', parent_key: null }]);
  assert.equal(duplicate.duplicateNodeKeyCount, 1);
  assert.equal(duplicate.isBranchingForest, false);
});
