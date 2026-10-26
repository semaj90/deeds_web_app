import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMAIN_PATH_LABELING_V1, deriveSyntheticPathDomainV1 } from './domain-path-labeling-v1.mjs';

test('path-derived labels are explicitly synthetic and non-promotional', () => {
  assert.deepEqual(DOMAIN_PATH_LABELING_V1, {
    provenance: 'PATH_HEURISTIC_SYNTHETIC',
    evaluationMeaning: 'PATH_LABEL_PREDICTABILITY_ONLY',
    groundTruth: false,
    promotionEligible: false,
  });
});

test('derives deterministic heuristic labels without claiming taxonomy truth', () => {
  assert.equal(deriveSyntheticPathDomainV1('src/lib/search/vector.ts'), 'retrieval');
  assert.equal(deriveSyntheticPathDomainV1('src/components/Button.svelte'), 'frontend');
  assert.equal(deriveSyntheticPathDomainV1('src/unmatched/file.py'), 'agent');
  assert.equal(deriveSyntheticPathDomainV1(null), 'agent');
});
