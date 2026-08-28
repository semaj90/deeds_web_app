import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFreshOntologyCandidate,
  validateFreshOntologyCandidate,
} from '../../../scripts/atlas/lib/feature-ontology-fresh-candidate-v1.mjs';

const valid = {
  candidateId: 'candidate:1',
  packetKey: 'packet:1',
  sourceRef: 'sveltekit-frontend/src/lib/server/example.ts',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
  subjectId: 'source:packet:1',
  objectId: 'concept:retrieval',
  evidenceRefs: ['graphify_files:file-1', 'source-observation:example.ts'],
  extractorRevision: 'fresh-ontology-extractor:v1',
  confidence: 0.8,
};

test('normalizes a review-only fresh candidate', () => {
  const candidate = normalizeFreshOntologyCandidate(valid);
  assert.equal(candidate.schema, 'atlas.feature-ontology-fresh-candidate.v1');
  assert.equal(candidate.predicate, 'USES_CONCEPT');
  assert.equal(candidate.status, 'REVIEW_REQUIRED');
  assert.equal(candidate.canonicalAuthority, false);
});

test('rejects a candidate without source revision', () => {
  const result = validateFreshOntologyCandidate({ ...valid, schema: 'atlas.feature-ontology-fresh-candidate.v1', sourceRevision: null, predicate: 'USES_CONCEPT', status: 'REVIEW_REQUIRED', canonicalAuthority: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('sourceRevision:required'));
});

test('rejects canonical or non-review status', () => {
  const result = validateFreshOntologyCandidate({ ...normalizeFreshOntologyCandidate(valid), canonicalAuthority: true, status: 'PROMOTED' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('canonicalAuthority:false_required'));
  assert.ok(result.errors.includes('status:REVIEW_REQUIRED_required'));
});
