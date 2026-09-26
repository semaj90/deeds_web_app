import test from 'node:test';
import assert from 'node:assert/strict';
import { markDocumentGovernanceTopicConflictsV1 as markConflicts } from './document-governance-topic-conflicts-v1.mjs';

const record = (path, topicIds, canonicalForTopics = topicIds) => ({
  documentId: `doc:${path}`,
  path,
  status: 'CANONICAL_CURRENT',
  topicIds,
  canonicalForTopics,
  topicOwnershipStatus: 'ASSIGNED',
  validation: { status: 'NOT_CHECKED', contradictions: [] },
});

test('marks every duplicate canonical topic claim as CONFLICT without choosing a winner', () => {
  const input = [record('a.md', ['t1', 't2']), record('b.md', ['t1'])];
  const { records, conflicts } = markConflicts(input);
  assert.deepEqual(conflicts, [{ topicId: 't1', documentIds: ['doc:a.md', 'doc:b.md'] }]);
  assert.equal(records[0].status, 'CONFLICT');
  assert.equal(records[1].status, 'CONFLICT');
  assert.equal(records[0].validation.status, 'FAILED');
  assert.equal(input[0].status, 'CANONICAL_CURRENT');
});

test('does not treat supporting mentions as canonical ownership', () => {
  const { records, conflicts } = markConflicts([
    record('owner.md', ['t1']),
    record('support.md', ['t1'], []),
  ]);
  assert.deepEqual(conflicts, []);
  assert.equal(records[0].status, 'CANONICAL_CURRENT');
  assert.equal(records[1].status, 'CANONICAL_CURRENT');
});

test('returns a deterministic empty-conflict result for no claims', () => {
  assert.deepEqual(markConflicts([record('unassigned.md', [], [])]).conflicts, []);
});
