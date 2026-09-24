import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentGovernanceFrontmatterV1 as extract } from './document-governance-frontmatter-v1.mjs';

test('extracts only explicit governance fields deterministically', () => {
  const result = extract('---\ntopicIds:\n  - parent-atlas.identity\ndocumentStatus: ACTIVE_SUPPORTING\n---\nBody');
  assert.deepEqual(result, {
    status: 'ACTIVE_SUPPORTING',
    topicIds: ['parent-atlas.identity'],
    canonicalForTopics: [],
    topicOwnershipStatus: 'ASSIGNED',
    validationStatus: 'NOT_CHECKED',
    contradictions: [],
  });
});

test('does not reinterpret generic OKF status as document lifecycle status', () => {
  assert.equal(extract('---\nstatus: PROVEN\n---\nBody', 'UNCLASSIFIED').status, 'UNCLASSIFIED');
});

test('fails closed on malformed or inconsistent canonical topic claims', () => {
  const malformed = extract('---\ndocumentStatus: made-up\ntopicIds: [\n---\nBody', 'ACTIVE_SUPPORTING');
  assert.equal(malformed.status, 'UNCLASSIFIED');
  assert.equal(malformed.validationStatus, 'FAILED');

  const conflicting = extract('---\ntopicIds: [parent-atlas.identity]\ncanonicalForTopics: [parent-atlas.other]\ndocumentStatus: CANONICAL_CURRENT\n---\nBody');
  assert.equal(conflicting.status, 'UNCLASSIFIED');
  assert.equal(conflicting.topicOwnershipStatus, 'UNASSIGNED');
  assert.ok(conflicting.contradictions.includes('CANONICAL_TOPIC_NOT_DECLARED_IN_TOPIC_IDS'));
});

test('rejects duplicate key aliases and does not infer from body text', () => {
  const duplicate = extract('---\ntopicIds: [a]\ntopic_ids: [b]\n---\nBody');
  assert.equal(duplicate.validationStatus, 'FAILED');
  assert.equal(extract('DocumentStatus: CANONICAL_CURRENT').status, 'UNCLASSIFIED');
});
