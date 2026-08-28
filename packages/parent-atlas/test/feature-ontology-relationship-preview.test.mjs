import assert from 'node:assert/strict';
import test from 'node:test';
import {
  previewFeatureOntologyRelationship,
  previewFeatureOntologyEvidence,
  previewFeatureOntologyRelationships,
} from '../../../scripts/atlas/lib/feature-ontology-relationship-preview-v1.mjs';

const row = (overrides = {}) => ({
  id: 'tuple:uses-concept-1',
  packet_key: 'packet:1',
  source_ref: 'src/example.ts:1',
  feature_key: 'example',
  feature_id: 'feature:example',
  feature_label: 'Example feature',
  domain_class: 'backend',
  workspace_revision: `sha256:${'d'.repeat(64)}`,
  subject_type: 'feature',
  subject_id: 'feature:example',
  predicate: 'USES_CONCEPT',
  object_type: 'concept',
  object_id: 'concept:retrieval',
  confidence: 0.7,
  ontology_version: 'atlas-ontology-v1',
  extractor_version: 'atlas-packets-ontology-v1',
  ...overrides,
});

test('maps USES_CONCEPT into a deterministic preview relationship', () => {
  const first = previewFeatureOntologyRelationship(row());
  const second = previewFeatureOntologyRelationship(row());
  assert.deepEqual(first, second);
  assert.equal(first.relationship_type, 'USES_CONCEPT');
  assert.equal(first.participant_count, 2);
  assert.equal(first.participants[0].entity_type, 'feature');
  assert.equal(first.participants[0].entity_id, 'feature:example');
  assert.equal(first.relationship_degree_kind, 'binary');
  assert.equal(first.participants.length, 2);
  assert.equal(first.metadata.preview_only, true);
  assert.deepEqual(first.evidence_refs, ['feature_ontology_tuples:tuple:uses-concept-1']);
});

test('does not map taxonomy predicates into FI relationships', () => {
  assert.equal(previewFeatureOntologyRelationship(row({ predicate: 'CLASSIFIED_AS' })), null);
});

test('rejects missing or non-canonical workspace revisions instead of substituting history', () => {
  assert.throws(() => previewFeatureOntologyRelationship(row({ workspace_revision: undefined })), /MISSING_WORKSPACE_REVISION/);
  assert.throws(() => previewFeatureOntologyRelationship(row({ workspace_revision: 'git:old-head' })), /NON_CANONICAL_WORKSPACE_REVISION/);
});

test('rejects malformed rows without fabricating evidence', () => {
  const result = previewFeatureOntologyRelationships([row({ source_ref: '' }), row()]);
  assert.equal(result.relationships.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /SOURCE_REF/);
});

test('builds an atlas_evidence-compatible preview with stable identity', () => {
  const evidence = previewFeatureOntologyEvidence(row());
  assert.equal(evidence.evidence_id, 'feature_ontology_tuples:tuple:uses-concept-1');
  assert.equal(evidence.evidence_kind, 'ontology_tuple');
  assert.equal(evidence.source_ref, 'src/example.ts:1');
  assert.equal(evidence.payload.source_table, 'feature_ontology_tuples');
  assert.match(evidence.search_text, /USES_CONCEPT/);
});
