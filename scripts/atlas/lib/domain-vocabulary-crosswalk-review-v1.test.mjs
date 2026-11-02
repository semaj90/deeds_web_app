import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDomainVocabularyCrosswalkV1, summarizeMissingFeatureIdsV1 } from './domain-vocabulary-crosswalk-review-v1.mjs';

const domains = [
  { id: 'machine-learning', label: 'Machine Learning', active: true },
  { id: 'inactive-domain', label: 'Inactive Domain', active: false },
];

test('reproducible normalized exact rows remain noncanonical proposals', () => {
  const result = reviewDomainVocabularyCrosswalkV1([
    { source_vocab: 'legacy', source_value: 'Machine Learning', taxonomy_domain_id: 'machine-learning', match_method: 'NORMALIZED_EXACT', canonical: false, source_row_count: 3, crosswalk_version: 'v1' },
  ], domains);
  assert.equal(result.rows[0].state, 'PROPOSED_NORMALIZED_EXACT');
  assert.equal(result.rows[0].canonicalAuthority, false);
});

test('normalization mismatch, unresolved, and missing targets stay distinct', () => {
  const result = reviewDomainVocabularyCrosswalkV1([
    { source_vocab: 'legacy', source_value: 'MachineLearning', taxonomy_domain_id: 'machine-learning', match_method: 'NORMALIZED_EXACT', canonical: false },
    { source_vocab: 'legacy', source_value: 'Unknown', taxonomy_domain_id: null, match_method: 'UNRESOLVED', canonical: false },
    { source_vocab: 'legacy', source_value: 'Other', taxonomy_domain_id: null, match_method: 'NORMALIZED_EXACT', canonical: false },
    { source_vocab: 'legacy', source_value: '', taxonomy_domain_id: null, match_method: 'UNRESOLVED', canonical: false },
  ], domains);
  assert.deepEqual(result.rows.map((row) => row.state), [
    'REVIEW_REQUIRED_NORMALIZATION_MISMATCH', 'UNRESOLVED', 'REVIEW_REQUIRED_TARGET_MISSING', 'UNRESOLVED_EMPTY_SOURCE_VALUE',
  ]);
});

test('canonical flags, duplicate source keys, and inactive targets never resolve as canonical', () => {
  const result = reviewDomainVocabularyCrosswalkV1([
    { source_vocab: 'legacy', source_value: 'Machine Learning', taxonomy_domain_id: 'machine-learning', match_method: 'NORMALIZED_EXACT', canonical: true },
    { source_vocab: 'legacy', source_value: 'Repeated', taxonomy_domain_id: 'machine-learning', match_method: 'NORMALIZED_EXACT', canonical: false },
    { source_vocab: 'legacy', source_value: 'Repeated', taxonomy_domain_id: 'machine-learning', match_method: 'NORMALIZED_EXACT', canonical: false },
    { source_vocab: 'legacy', source_value: 'Inactive Domain', taxonomy_domain_id: 'inactive-domain', match_method: 'NORMALIZED_EXACT', canonical: false },
  ], domains);
  assert.deepEqual(result.rows.map((row) => row.state), [
    'BLOCKED_CANONICAL_FLAG_PRESENT', 'REVIEW_REQUIRED_DUPLICATE_SOURCE_KEY',
    'REVIEW_REQUIRED_DUPLICATE_SOURCE_KEY', 'REVIEW_REQUIRED_TARGET_UNKNOWN_OR_INACTIVE',
  ]);
  assert.equal(result.canonicalAuthority, false);
});

test('invalid inputs block and feature-map IDs are counted separately', () => {
  assert.equal(reviewDomainVocabularyCrosswalkV1(null, domains).status, 'BLOCKED_INVALID_INPUT');
  const result = summarizeMissingFeatureIdsV1([
    { normalized_path: 'a.ts', source_ref: 'src/a.ts', feature_id: 'f1' },
    { normalized_path: 'b.ts', source_ref: null, feature_id: null },
    { normalized_path: 'c.ts', source_ref: null, feature_id: '  ' },
  ], 4);
  assert.equal(result.status, 'REVIEW_REQUIRED_MISSING_FEATURE_IDS');
  assert.equal(result.missingFeatureIdCount, 2);
  assert.equal(result.rowCount, 4);
  assert.equal(result.canonicalAuthority, false);
});
