import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoundedReasoningChain,
  evaluateSufficientContext,
  projectRelationshipToIncidence,
  projectRelationshipToPairwise,
  reconstructParticipantsFromPairwise,
} from '../dist/core/hypergraph-retrieval.js';
import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';

function relationship(overrides = {}) {
  return buildFeatureRelationship({
    relationship_id: '11111111-1111-7111-8111-111111111111',
    relationship_type: 'authorized_resource_mutation',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'feature:case-edit' },
      { role: 'route', entity_type: 'route', entity_id: 'route:patch-case' },
      { role: 'policy', entity_type: 'database_policy', entity_id: 'policy:case-owner' },
      { role: 'resource', entity_type: 'table', entity_id: 'table:cases' },
      { role: 'ownership_key', entity_type: 'column', entity_id: 'column:cases.owner_id' },
    ],
    cardinality: [],
    source_ref: 'src/routes/api/case/[id]/+server.ts',
    source_revision: 'src-r1',
    relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1',
    evidence_refs: [],
    confidence: 0.9,
    metadata: {},
    ...overrides,
  });
}

test('incidence projection preserves one relationship node and all typed participants', () => {
  const rel = relationship();
  const projection = projectRelationshipToIncidence(rel);

  assert.equal(projection.nodes.filter((node) => node.node_kind === 'relationship').length, 1);
  assert.equal(projection.nodes.filter((node) => node.node_kind === 'entity').length, 5);
  assert.equal(projection.edges.length, 5);
  assert.deepEqual(
    new Set(projection.edges.map((edge) => edge.relationship_id)),
    new Set([rel.relationship_id]),
  );
  assert.deepEqual(
    new Set(projection.edges.map((edge) => edge.role)),
    new Set(['feature', 'route', 'policy', 'resource', 'ownership_key']),
  );
});

test('pairwise projection is reversible and normalizes relationship mass', () => {
  const rel = relationship();
  const edges = projectRelationshipToPairwise(rel);

  assert.equal(edges.length, 10); // 5 choose 2
  assert.ok(Math.abs(edges.reduce((sum, edge) => sum + edge.projection_weight, 0) - 1) < 1e-12);
  assert.ok(edges.every((edge) => edge.relationship_id === rel.relationship_id));

  const reconstructed = reconstructParticipantsFromPairwise(edges);
  assert.equal(reconstructed.length, 5);
  assert.deepEqual(
    new Set(reconstructed.map((participant) => `${participant.entity_type}:${participant.entity_id}:${participant.role}`)),
    new Set(rel.participants.map((participant) => `${participant.entity_type}:${participant.entity_id}:${participant.role}`)),
  );
});

test('bounded reasoning chain traverses entity -> n-ary relationship -> entities without exceeding hop budget', () => {
  const rel1 = relationship();
  const rel2 = buildFeatureRelationship({
    relationship_id: '22222222-2222-7222-8222-222222222222',
    relationship_type: 'validates',
    participants: [
      { role: 'feature', entity_type: 'feature', entity_id: 'feature:case-edit' },
      { role: 'test', entity_type: 'test', entity_id: 'test:case-owner' },
    ],
    cardinality: [],
    source_ref: 'tests/case-owner.spec.ts',
    source_revision: 'src-r1',
    relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1',
    evidence_refs: [],
    confidence: 0.95,
    metadata: {},
  });

  const chain = buildBoundedReasoningChain({
    query_id: 'query-1',
    source_snapshot_revision: 'snapshot-r1',
    seed_entity_ids: ['route:patch-case'],
    relationships: [rel1, rel2],
    maximum_hop_count: 2,
    fanout_limit: 20,
    semantic_scores: { [rel1.relationship_id]: 0.9 },
    ppr_scores: { [rel1.relationship_id]: 0.8 },
  });

  assert.ok(chain.steps.length >= 4);
  assert.ok(chain.steps.every((step) => step.hop <= 2));
  assert.ok(chain.relationship_ids.includes(rel1.relationship_id));
  assert.ok(chain.entity_ids.includes('feature:case-edit'));
  assert.ok(chain.entity_ids.includes('test:case-owner'));
  assert.ok(chain.chain_score > 0);
});

test('sufficient-context gate requests missing schema/test evidence before synthesis', () => {
  const decision = evaluateSufficientContext(
    {
      query_id: 'query-2',
      expected_entity_types: ['route', 'database_policy', 'table', 'column', 'test'],
      expected_relationship_types: ['authorized_resource_mutation', 'validates'],
      required_evidence_kinds: ['source_ast', 'test_pass'],
      minimum_relationships: 2,
      minimum_evidence_refs: 2,
    },
    {
      entity_types: ['route', 'database_policy', 'table'],
      relationship_types: ['authorized_resource_mutation'],
      evidence_kinds: ['source_ast'],
      relationship_count: 1,
      evidence_ref_count: 1,
      contradiction_refs: [],
      stale_refs: [],
    },
  );

  assert.equal(decision.sufficient, false);
  assert.equal(decision.state, 'NEED_RELATIONSHIP');
  assert.equal(decision.next_action, 'retrieve_relationships');
  assert.ok(decision.missing_entity_types.includes('column'));
  assert.ok(decision.missing_entity_types.includes('test'));
  assert.ok(decision.missing_relationship_types.includes('validates'));
});

test('sufficient-context gate permits synthesis only after typed relationships and evidence are present', () => {
  const decision = evaluateSufficientContext(
    {
      query_id: 'query-3',
      expected_entity_types: ['route', 'database_policy', 'table', 'column', 'test'],
      expected_relationship_types: ['authorized_resource_mutation', 'validates'],
      required_evidence_kinds: ['source_ast', 'test_pass'],
      minimum_relationships: 2,
      minimum_evidence_refs: 2,
    },
    {
      entity_types: ['route', 'database_policy', 'table', 'column', 'test'],
      relationship_types: ['authorized_resource_mutation', 'validates'],
      evidence_kinds: ['source_ast', 'test_pass'],
      relationship_count: 2,
      evidence_ref_count: 4,
      contradiction_refs: [],
      stale_refs: [],
    },
  );

  assert.equal(decision.sufficient, true);
  assert.equal(decision.state, 'ENOUGH_EVIDENCE');
  assert.equal(decision.next_action, 'synthesize');
});
