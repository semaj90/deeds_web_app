import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import { aceHypergraphPayloadSchema } from '../dist/core/ace-hypergraph-payload.js';
import { runHypergraphFusionFacade } from '../dist/core/hypergraph-fusion-facade.js';
import { buildQueryConditionedReasoningChain } from '../dist/core/hypergraph-query-policy.js';

function authRelationship(overrides = {}) {
  return buildFeatureRelationship({
    relationship_id: 'rel:authorized-case-mutation',
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
    evidence_refs: ['evidence:route-ast', 'evidence:policy-schema'],
    confidence: 0.94,
    metadata: {},
    ...overrides,
  });
}

function testRelationship() {
  return buildFeatureRelationship({
    relationship_id: 'rel:case-owner-test',
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
    evidence_refs: ['evidence:test-pass'],
    confidence: 0.97,
    metadata: {},
  });
}

test('query-conditioned fanout selects higher-scoring relationship instead of alphabetical id', () => {
  const low = authRelationship({
    relationship_id: 'aaa:low',
    relationship_type: 'depends_on',
    confidence: 0.2,
    evidence_refs: [],
  });
  const high = authRelationship({
    relationship_id: 'zzz:high',
    confidence: 0.95,
    evidence_refs: ['evidence:route-ast'],
  });

  const chain = buildQueryConditionedReasoningChain({
    query_id: 'query:fanout',
    source_snapshot_revision: 'snapshot-r1',
    seed_entity_ids: ['route:patch-case'],
    relationships: [low, high],
    maximum_hop_count: 1,
    fanout_limit: 1,
    signals: {
      semantic_scores: { 'aaa:low': 0.05, 'zzz:high': 0.98 },
      ppr_scores: { 'aaa:low': 0.05, 'zzz:high': 0.9 },
      expected_relationship_types: ['authorized_resource_mutation'],
    },
  });

  assert.deepEqual(chain.relationship_ids, ['zzz:high']);
  assert.ok(chain.steps.length > 0);
  assert.ok(chain.steps.every((step) => step.relationship_id === 'zzz:high'));
});

test('facade constructs an ACE hypergraph payload with canonical N-ary evidence and synthesis gate', async () => {
  const auth = authRelationship();
  const validation = testRelationship();

  const repository = {
    async findRelationshipsForEntities(entityIds) {
      assert.ok(entityIds.includes('route:patch-case'));
      return [auth];
    },
  };

  const result = await runHypergraphFusionFacade({
    query_id: 'query:case-edit-auth',
    source_snapshot_revision: 'snapshot-r1',
    producer_revision: 'parent-atlas-test-r1',
    candidates: [
      {
        canonical_id: 'route:patch-case',
        family: 'entity',
        packet_key: 'packet:route-patch-case',
        source_ref: 'src/routes/api/case/[id]/+server.ts',
        feature_id: 'feature:case-edit',
        score: 0.96,
      },
      {
        canonical_id: 'rel:case-owner-test',
        family: 'relationship',
        packet_key: 'packet:test-case-owner',
        source_ref: 'tests/case-owner.spec.ts',
        feature_id: 'feature:case-edit',
        score: 0.88,
      },
    ],
    repository,
    relationship_resolver: async (ids) => {
      assert.deepEqual(ids, ['rel:case-owner-test']);
      return [validation];
    },
    expectation: {
      schema: 'atlas.query-evidence-expectation.v1',
      query_id: 'query:case-edit-auth',
      expected_entity_types: ['feature', 'route', 'database_policy', 'table', 'column', 'test'],
      expected_relationship_types: ['authorized_resource_mutation', 'validates'],
      required_evidence_kinds: ['source_ast', 'schema_constraint', 'test_pass'],
      minimum_relationships: 2,
      minimum_evidence_refs: 3,
    },
    relationship_types: ['authorized_resource_mutation', 'validates'],
    maximum_hop_count: 2,
    fanout_limit: 20,
    semantic_scores: {
      'rel:authorized-case-mutation': 0.96,
      'rel:case-owner-test': 0.87,
    },
    ppr_scores: {
      'rel:authorized-case-mutation': 0.91,
      'rel:case-owner-test': 0.76,
    },
    extraction_confidence: {
      'rel:authorized-case-mutation': 0.98,
      'rel:case-owner-test': 0.99,
    },
    evidence_inventory: {
      evidence_kinds: ['source_ast', 'schema_constraint', 'test_pass'],
      contradiction_refs: [],
      stale_refs: [],
    },
    semantic_executors: ['qdrant', 'pgvector_hnsw', 'cuvs_cagra'],
  });

  assert.equal(result.relationships.length, 2);
  assert.equal(result.sufficient_context.sufficient, true);
  assert.equal(result.sufficient_context.next_action, 'synthesize');
  assert.ok(result.reasoning_chain.relationship_ids.includes('rel:authorized-case-mutation'));
  assert.ok(result.reasoning_chain.relationship_ids.includes('rel:case-owner-test'));
  assert.equal(result.ace_payloads.length, 2);

  const packet = aceHypergraphPayloadSchema.parse(result.ace_payloads[0]);
  assert.equal(packet.schema, 'atlas.ace-hypergraph-payload.v1');
  assert.equal(packet.query_id, 'query:case-edit-auth');
  assert.equal(packet.feature_id, 'feature:case-edit');
  assert.equal(packet.retrieval.semantic_lane_votes, 1);
  assert.equal(packet.retrieval.relationship_candidate_count, 2);
  assert.equal(packet.retrieval.evidence_candidate_count, 3);
  assert.equal(packet.sufficient_context.sufficient, true);
  assert.deepEqual(
    new Set(packet.relationship_evidence.map((item) => item.relationship_id)),
    new Set(['rel:authorized-case-mutation', 'rel:case-owner-test']),
  );
  assert.ok(packet.relationship_evidence.some((item) => item.participants.some((p) => p.role === 'ownership_key')));
  assert.ok(packet.reasoning_chain.steps.some((step) => step.to_entity.entity_id === 'test:case-owner'));
});
