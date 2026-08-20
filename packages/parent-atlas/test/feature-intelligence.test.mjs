import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  buildFeatureRelationship,
  classifyRelationshipDegree,
  deriveRelationshipDegree,
  featureRelationshipSchema,
} = await import('../dist/index.js');

const common = {
  relationship_id: 'rel-1',
  relationship_type: 'AUTHORIZES_ACCESS',
  source_ref: 'src/routes/+page.server.ts#load',
  source_revision: 'repo:abc123',
  relationship_revision: 'relrev:1',
  producer_revision: 'parent-atlas:test',
  evidence_refs: ['evidence-1'],
};

test('relationship degree counts distinct participating entity types, not participant rows', () => {
  const participants = [
    { role: 'parent', entity_type: 'feature', entity_id: 'feature-a' },
    { role: 'child', entity_type: 'feature', entity_id: 'feature-b' },
  ];

  assert.equal(participants.length, 2);
  assert.equal(deriveRelationshipDegree(participants), 1);
  assert.equal(classifyRelationshipDegree(1), 'unary');

  const relationship = buildFeatureRelationship({
    ...common,
    relationship_type: 'DEPENDS_ON',
    participants,
    cardinality: [
      { role: 'parent', min: 1, max: 1 },
      { role: 'child', min: 0, max: 'many' },
    ],
  });

  assert.equal(relationship.participant_count, 2);
  assert.equal(relationship.relationship_degree, 1);
  assert.equal(relationship.relationship_degree_kind, 'unary');
});

test('binary, ternary and n-ary relationships preserve semantic arity', () => {
  const binary = buildFeatureRelationship({
    ...common,
    relationship_id: 'rel-binary',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'auth' },
      { role: 'route', entity_type: 'route', entity_id: '/login' },
    ],
  });
  assert.equal(binary.relationship_degree, 2);
  assert.equal(binary.relationship_degree_kind, 'binary');

  const ternary = buildFeatureRelationship({
    ...common,
    relationship_id: 'rel-ternary',
    participants: [
      { role: 'route', entity_type: 'route', entity_id: '/case/[id]' },
      { role: 'guard', entity_type: 'policy', entity_id: 'require-session' },
      { role: 'table', entity_type: 'table', entity_id: 'cases' },
    ],
  });
  assert.equal(ternary.relationship_degree, 3);
  assert.equal(ternary.relationship_degree_kind, 'ternary');

  const nary = buildFeatureRelationship({
    ...common,
    relationship_id: 'rel-nary',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'case-access' },
      { role: 'route', entity_type: 'route', entity_id: '/case/[id]' },
      { role: 'guard', entity_type: 'policy', entity_id: 'require-session' },
      { role: 'table', entity_type: 'table', entity_id: 'cases' },
      { role: 'owner_column', entity_type: 'column', entity_id: 'cases.user_id' },
    ],
  });
  assert.equal(nary.relationship_degree, 5);
  assert.equal(nary.relationship_degree_kind, 'nary');
});

test('relationship schema rejects stale or projection-derived arity metadata', () => {
  assert.throws(() => featureRelationshipSchema.parse({
    ...common,
    participants: [
      { role: 'route', entity_type: 'route', entity_id: '/case/[id]' },
      { role: 'guard', entity_type: 'policy', entity_id: 'require-session' },
      { role: 'table', entity_type: 'table', entity_id: 'cases' },
    ],
    participant_count: 3,
    relationship_degree: 2,
    relationship_degree_kind: 'binary',
  }));
});

test('cardinality is orthogonal to relationship degree', () => {
  const relationship = buildFeatureRelationship({
    ...common,
    relationship_id: 'rel-cardinality',
    relationship_type: 'FEATURE_USES_ROUTE',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'auth' },
      { role: 'route', entity_type: 'route', entity_id: '/login' },
    ],
    cardinality: [
      { role: 'feature', min: 1, max: 1 },
      { role: 'route', min: 1, max: 'many' },
    ],
  });

  assert.equal(relationship.relationship_degree, 2);
  assert.deepEqual(relationship.cardinality, [
    { role: 'feature', min: 1, max: 1 },
    { role: 'route', min: 1, max: 'many' },
  ]);
});
