import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultSpectralClusteringPlan,
  spectralAssignmentsChecksum,
  spectralClusteringPlanSchema,
  spectralGraphEdgeRecipeSchema,
  spectralGraphProjectionPlanSchema,
  extractInducedSubgraph,
  subgraphSynthesisRequestSchema,
} from '../dist/index.js';

const h = (c) => c.repeat(64);

test('semantic KNN edges are always derived similarities', () => {
  assert.throws(() => spectralGraphEdgeRecipeSchema.parse({
    edge_family: 'SEMANTIC_KNN',
    weight: 1,
    canonical_fact: true,
    derived_similarity: false,
    source_receipt_ids: ['semantic-r1'],
  }));

  const edge = spectralGraphEdgeRecipeSchema.parse({
    edge_family: 'SEMANTIC_KNN',
    weight: 0.25,
    canonical_fact: false,
    derived_similarity: true,
    maximum_edges_per_vertex: 32,
    source_receipt_ids: ['semantic-r1'],
  });
  assert.equal(edge.derived_similarity, true);
});

test('spectral graph projection preserves canonical relationships outside derived projection', () => {
  const plan = spectralGraphProjectionPlanSchema.parse({
    plan_id: 'spectral-graph-r1',
    workflow_id: 'workflow-1',
    workflow_revision: 3,
    source_snapshot_revision: 'source-r3',
    graph_revision: 'graph-r3',
    feature_revision: 'feature-r2',
    row_identity_checksum: h('1'),
    vertex_count: 42,
    edge_recipes: [
      {
        edge_family: 'NARY_INCIDENCE',
        weight: 1,
        canonical_fact: true,
        derived_similarity: false,
        source_receipt_ids: ['nary-r1'],
      },
      {
        edge_family: 'SEMANTIC_KNN',
        weight: 0.2,
        canonical_fact: false,
        derived_similarity: true,
        maximum_edges_per_vertex: 16,
        source_receipt_ids: ['semantic-r1'],
      },
    ],
    symmetrization: 'MAX',
    sparse_representation: 'CSR',
    canonical_relationships_remain_external: true,
    canonical_authority: false,
  });
  assert.equal(plan.canonical_relationships_remain_external, true);
  assert.equal(plan.canonical_authority, false);
});

test('default spectral plan is deterministic and keeps source promotion required', () => {
  const plan = defaultSpectralClusteringPlan({
    planId: 'spectral-r1',
    workflowId: 'workflow-1',
    workflowRevision: 2,
    graphProjectionPlanId: 'graph-plan-r1',
    graphRevision: 'graph-r1',
    numClusters: 16,
    randomSeed: 0xA71A5,
  });
  assert.equal(plan.num_clusters, 16);
  assert.equal(plan.num_eigenvectors, 4);
  assert.equal(plan.random_seed, 0xA71A5);
  assert.equal(plan.exact_relationship_promotion_required, true);
  assert.equal(plan.canonical_authority, false);
});

test('eigenvector count cannot exceed cluster count', () => {
  assert.throws(() => spectralClusteringPlanSchema.parse({
    plan_id: 'bad-r1',
    workflow_id: 'workflow-1',
    workflow_revision: 1,
    graph_projection_plan_id: 'graph-r1',
    graph_revision: 'graph-r1',
    method: 'BALANCED_CUT',
    executor: 'CUGRAPH_SINGLE_GPU',
    num_clusters: 4,
    num_eigenvectors: 5,
    eigen_tolerance: 1e-5,
    eigen_max_iterations: 100,
    kmeans_tolerance: 1e-5,
    kmeans_max_iterations: 100,
    random_seed: 7,
    cluster_count_owner: 'FIXED_POLICY',
  }));
});

test('assignment checksum is independent of caller order', () => {
  const a = spectralAssignmentsChecksum([
    { vertex_ordinal: 1, candidate_id: 'b', cluster_id: 2 },
    { vertex_ordinal: 0, candidate_id: 'a', cluster_id: 1 },
  ]);
  const b = spectralAssignmentsChecksum([
    { vertex_ordinal: 0, candidate_id: 'a', cluster_id: 1 },
    { vertex_ordinal: 1, candidate_id: 'b', cluster_id: 2 },
  ]);
  assert.equal(a, b);
});

test('subgraph synthesis is bounded and still requires exact source promotion', () => {
  const request = subgraphSynthesisRequestSchema.parse({
    request_id: 'subgraph-r1',
    workflow_id: 'workflow-1',
    workflow_revision: 9,
    seed_candidate_ids: ['candidate-1'],
    graph_revision: 'graph-r9',
    spectral_cluster_ids: [3],
    maximum_vertices: 5000,
    maximum_edges: 25000,
    include_edge_families: ['AST_CALL', 'NARY_INCIDENCE', 'SEMANTIC_KNN'],
    exact_source_promotion_required: true,
    canonical_authority: false,
  });
  assert.equal(request.maximum_vertices, 5000);
  assert.equal(request.exact_source_promotion_required, true);
});

test('induced subgraph keeps only edges whose two endpoints are selected', () => {
  const result = extractInducedSubgraph({
    graphRevision: 'graph-r2',
    vertexOrdinals: [0, 1, 2, 3],
    selectedVertexOrdinals: [2, 0, 3],
    edges: [
      { source_vertex_ordinal: 0, target_vertex_ordinal: 2, edge_family: 'AST_CALL', weight: 1 },
      { source_vertex_ordinal: 2, target_vertex_ordinal: 1, edge_family: 'AST_CALL', weight: 1 },
      { source_vertex_ordinal: 3, target_vertex_ordinal: 0, edge_family: 'NARY_INCIDENCE', weight: 0.5 },
      { source_vertex_ordinal: 3, target_vertex_ordinal: 3, edge_family: 'AST_CALL', weight: 1 },
    ],
    includeEdgeFamilies: ['AST_CALL', 'NARY_INCIDENCE'],
    maximumVertices: 10,
    maximumEdges: 10,
  });

  assert.deepEqual(result.extracted_vertex_ordinals, [0, 2, 3]);
  assert.equal(result.extracted_edges.length, 2);
  assert.equal(result.canonical_authority, false);
  assert.equal(result.truncated, false);
});
