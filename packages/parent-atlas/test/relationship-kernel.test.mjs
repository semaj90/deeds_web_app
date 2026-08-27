import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import {
  featureRelationshipToKernel,
  buildRelationshipKernel,
  assertRelationTypeNamespace,
  KAG_TAXONOMY_RELATION_TYPES,
} from '../dist/core/relationship-kernel.js';

function relationship(participants) {
  return buildFeatureRelationship({
    relationship_id: 'rel:docs:qdrant',
    relationship_type: 'DOC_RELATES_CONCEPTS',
    participants,
    source_ref: 'docs/retrieval.md',
    source_revision: 'sha256:' + 'a'.repeat(64),
    relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1',
    evidence_refs: ['evidence:b', 'evidence:a'],
  });
}

test('FeatureRelationshipV1 compiles to a deterministic non-persistent kernel', () => {
  const first = featureRelationshipToKernel(relationship([
    { role: 'object', entity_type: 'concept', entity_id: 'concept:qdrant' },
    { role: 'subject', entity_type: 'document', entity_id: 'doc:retrieval' },
  ]));
  const second = featureRelationshipToKernel(relationship([
    { role: 'subject', entity_type: 'document', entity_id: 'doc:retrieval' },
    { role: 'object', entity_type: 'concept', entity_id: 'concept:qdrant' },
  ]));

  assert.equal(first.authority, 'FEATURE_INTELLIGENCE');
  assert.equal(first.workspaceRevision, null);
  assert.deepEqual(first.participants, second.participants);
  assert.equal(first.checksum, second.checksum);
  assert.equal(first.evidenceRefs.join(','), 'evidence:a,evidence:b');
});

test('REL-OWNER-07: FEATURE_INTELLIGENCE may never mint a KAG_TAXONOMY-reserved relation type', () => {
  for (const reserved of KAG_TAXONOMY_RELATION_TYPES) {
    assert.throws(
      () => assertRelationTypeNamespace(reserved, 'FEATURE_INTELLIGENCE'),
      /RELATIONSHIP_KERNEL_RELATION_TYPE_COLLISION/,
    );
  }
});

test('REL-OWNER-07: KAG_TAXONOMY may only mint its registered predicates', () => {
  assert.throws(
    () => assertRelationTypeNamespace('SOME_UNREGISTERED_PREDICATE', 'KAG_TAXONOMY'),
    /RELATIONSHIP_KERNEL_UNREGISTERED_KAG_TAXONOMY_RELATION_TYPE/,
  );
  for (const reserved of KAG_TAXONOMY_RELATION_TYPES) {
    assert.doesNotThrow(() => assertRelationTypeNamespace(reserved, 'KAG_TAXONOMY'));
  }
});

test('REL-OWNER-07: FEATURE_INTELLIGENCE open-vocabulary predicates pass through freely', () => {
  assert.doesNotThrow(() => assertRelationTypeNamespace('DOC_RELATES_CONCEPTS', 'FEATURE_INTELLIGENCE'));
  assert.doesNotThrow(() => assertRelationTypeNamespace('mentions_arbitrary_nlp_predicate', 'FEATURE_INTELLIGENCE'));
});

test('REL-OWNER-07: an unknown relationship authority is rejected by schema validation', () => {
  assert.throws(() => buildRelationshipKernel({
    relationshipId: 'rel:bad-authority',
    authority: 'SOMETHING_ELSE',
    relationType: 'DOC_RELATES_CONCEPTS',
    participants: [{ canonicalId: 'a', role: 'x', ordinal: 0, entityType: null, entityRevision: null, sourceRef: null }],
    producerRevision: 'producer-r1',
  }));
});

test('REL-OWNER-07: the guard fires through buildRelationshipKernel itself, not just the assert helper', () => {
  assert.throws(
    () => buildRelationshipKernel({
      relationshipId: 'rel:bad',
      authority: 'FEATURE_INTELLIGENCE',
      relationType: 'ENTITY_CLASSIFIED_AS',
      participants: [{ canonicalId: 'a', role: 'x', ordinal: 0, entityType: null, entityRevision: null, sourceRef: null }],
      producerRevision: 'producer-r1',
    }),
    /RELATIONSHIP_KERNEL_RELATION_TYPE_COLLISION/,
  );
});
