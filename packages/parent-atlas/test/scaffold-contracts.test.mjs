import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeatureRelationship } from '../dist/core/feature-intelligence.js';
import { buildCagraBuildPlan, buildIncidenceOrdinalPlan, buildQdrantRelationshipPointPlan } from '../dist/core/executor-plans.js';
import { materializeFeatureMatrixRows } from '../dist/core/feature-matrix-materializer.js';
import { exactWeightedViewRerank } from '../dist/core/multiview-rerank.js';
import { buildRetrievalActionReceipt } from '../dist/core/retrieval-action-receipt.js';
import { validateQloraTrainingExample } from '../dist/core/qlora-dataset-export.js';

function relationship() {
  return buildFeatureRelationship({
    relationship_id: 'rel:scaffold-auth',
    relationship_type: 'authorized_resource_mutation',
    participants: [
      { role: 'route', entity_type: 'route', entity_id: 'route:patch-case' },
      { role: 'policy', entity_type: 'database_policy', entity_id: 'policy:owner' },
      { role: 'resource', entity_type: 'table', entity_id: 'table:cases' },
    ],
    cardinality: [],
    source_ref: 'src/routes/api/case/[id]/+server.ts',
    source_revision: 'src-r1',
    relationship_revision: 'rel-r1',
    producer_revision: 'producer-r1',
    evidence_refs: ['evidence:ast', 'evidence:schema'],
    confidence: 0.95,
    metadata: {},
  });
}

test('executor plans keep canonical relationship identity separate from projection ids and ordinals', () => {
  const rel = relationship();
  const qdrant = buildQdrantRelationshipPointPlan({
    relationship: rel,
    projection_point_id: '11111111-1111-7111-8111-111111111111',
    projection_revision: 'qdrant-r1',
    embedding_model_revision: 'embed-r1',
  });
  assert.equal(qdrant.canonical_relationship_id, rel.relationship_id);
  assert.notEqual(qdrant.projection_point_id, rel.relationship_id);
  assert.equal(qdrant.payload.relationship_id, rel.relationship_id);

  const incidence = buildIncidenceOrdinalPlan({
    source_snapshot_revision: 'snapshot-r1',
    relationships: [rel],
  });
  assert.equal(incidence.relationship_node_ids.length, 1);
  assert.equal(incidence.entity_node_ids.length, 3);
  assert.equal(incidence.edges.length, 3);
  assert.deepEqual([...new Set(Object.values(incidence.ordinals))].sort((a, b) => a - b), [0, 1, 2, 3]);

  const cagra = buildCagraBuildPlan({
    source_snapshot_revision: 'snapshot-r1',
    projection_revision: 'cagra-r1',
    vector_count: 42,
    source_checksum: 'sha256:fixture',
  });
  assert.equal(cagra.graph_degree, 64);
  assert.equal(cagra.intermediate_graph_degree, 128);
  assert.equal(cagra.exact_oracle_required, true);
});

test('feature matrix materializer retains pinned snapshot identity', () => {
  const rows = materializeFeatureMatrixRows({
    snapshot_revision: 'matrix-r1',
    rows: [{
      feature_ordinal: 0,
      feature_id: 'feature:case-edit',
      feature_revision: 'feature-r1',
      semantic_768_ref: 'arrow://semantic/0',
      lexical_count: 3,
      ast_symbol_count: 2,
      route_count: 1,
      requirement_coverage: 1,
      schema_coverage: 0.8,
      test_coverage: 0.7,
      runtime_coverage: 0.6,
      graph_degree: 5,
      in_degree: 2,
      out_degree: 3,
      fanout: 3,
      pagerank: 0.01,
      ppr: 0.12,
      completion: 75,
      confidence: 80,
      uncertainty: 0.2,
      staleness: 0,
      domain_bits: [1],
      evidence_bits: [2],
      relationship_bits: [3],
    }],
  });
  assert.equal(rows[0].snapshot_revision, 'matrix-r1');
  assert.equal(rows[0].feature_id, 'feature:case-edit');
});

test('exact multi-view rerank can overturn FDE nomination order using original view scores', () => {
  const receipt = exactWeightedViewRerank({
    query_id: 'query:mv',
    candidate_projection_revision: 'fde-r1',
    original_view_revision: 'views-r1',
    candidates: [
      { canonical_id: 'A', fde_score: 0.99, view_scores: { semantic: 0.2, relationship: 0.2 } },
      { canonical_id: 'B', fde_score: 0.80, view_scores: { semantic: 0.9, relationship: 0.8 } },
    ],
    view_weights: { semantic: 0.5, relationship: 0.5 },
    producer_revision: 'producer-r1',
  });
  assert.equal(receipt.results[0].canonical_id, 'B');
});

test('retrieval action receipt preserves NEED -> evidence -> ENOUGH transition lineage', () => {
  const receipt = buildRetrievalActionReceipt({
    receipt_id: 'receipt:1',
    query_id: 'query:1',
    sequence: 1,
    before_state: 'NEED_TEST',
    action: 'retrieve_tests',
    requested_evidence_kinds: ['test_pass'],
    candidate_ids: ['test:case-edit'],
    retrieved_evidence_refs: ['evidence:test-pass'],
    relationship_ids: ['rel:validates'],
    source_snapshot_revision_before: 'snapshot-r1',
    source_snapshot_revision_after: 'snapshot-r2',
    after_state: 'ENOUGH_EVIDENCE',
    sufficient_after: true,
    executor_refs: ['postgres:test-evidence'],
    started_at: '2026-08-18T19:00:00.000Z',
    finished_at: '2026-08-18T19:00:01.000Z',
    producer_revision: 'producer-r1',
  });
  assert.equal(receipt.sufficient_after, true);
});

test('QLoRA example requires verified evidence refs and marks target source explicitly', () => {
  const example = validateQloraTrainingExample({
    example_id: 'qlora:1',
    feature_id: 'feature:case-edit',
    feature_revision: 'feature-r1',
    evidence_snapshot_revision: 'evidence-r1',
    matrix_snapshot_revision: 'matrix-r1',
    prompt: 'Which policy guards case editing?',
    target: 'CaseOwnerPolicy',
    evidence_refs: ['evidence:policy-schema'],
    relationship_ids: ['rel:auth'],
    quality: 0.95,
    split: 'train',
    derived_sampling_signals: { ppr: 0.4, turbovec: 0.7 },
  });
  assert.equal(example.canonical_label_source, 'verified_evidence');
  assert.equal(example.evidence_refs.length, 1);
  assert.throws(() => validateQloraTrainingExample({ ...example, evidence_refs: [] }));
});
