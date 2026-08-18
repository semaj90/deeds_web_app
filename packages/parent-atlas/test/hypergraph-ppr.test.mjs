import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import { runHypergraphPersonalizedPageRank } from '../dist/core/hypergraph-ppr.js';

function relationship(id, type, participants) {
  return buildFeatureRelationship({
    relationship_id: id,
    relationship_type: type,
    participants,
    cardinality: [],
    source_ref: `fixture:${id}`,
    source_revision: 'src-r1',
    relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1',
    evidence_refs: [`evidence:${id}`],
    confidence: 0.9,
    metadata: {},
  });
}

test('incidence PPR is deterministic and favors relationships reachable from the query seed', () => {
  const auth = relationship('rel:auth', 'authorized_resource_mutation', [
    { role: 'route', entity_type: 'route', entity_id: 'route:patch-case' },
    { role: 'feature', entity_type: 'feature', entity_id: 'feature:case-edit' },
    { role: 'policy', entity_type: 'database_policy', entity_id: 'policy:owner' },
  ]);
  const validation = relationship('rel:test', 'validates', [
    { role: 'feature', entity_type: 'feature', entity_id: 'feature:case-edit' },
    { role: 'test', entity_type: 'test', entity_id: 'test:case-edit' },
  ]);
  const unrelated = relationship('rel:unrelated', 'depends_on', [
    { role: 'feature', entity_type: 'feature', entity_id: 'feature:other' },
    { role: 'table', entity_type: 'table', entity_id: 'table:other' },
  ]);

  const input = {
    query_id: 'query:ppr',
    source_snapshot_revision: 'snapshot-r1',
    seed_entity_ids: ['route:patch-case'],
    relationships: [auth, validation, unrelated],
    config: { alpha: 0.85, maximum_iterations: 200, tolerance: 1e-12 },
  };

  const first = runHypergraphPersonalizedPageRank(input);
  const second = runHypergraphPersonalizedPageRank(input);

  assert.deepEqual(first, second);
  assert.equal(first.schema, 'atlas.hypergraph-ppr-receipt.v1');
  assert.equal(first.alpha, 0.85);
  assert.ok(Math.abs(first.teleport_probability - 0.15) < 1e-12);
  assert.ok(first.iterations > 0);
  assert.ok(first.relationship_scores['rel:auth'] > first.relationship_scores['rel:unrelated']);
  assert.ok(first.relationship_scores['rel:test'] > first.relationship_scores['rel:unrelated']);
  assert.ok(first.entity_scores['route:patch-case'] > 0);
  assert.equal(first.incidence_edge_count, 7);
});
