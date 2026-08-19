import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultAtlasMcpSurface,
  buildObservationFeatureRegistry,
  buildRouterFeatureTensor,
  compileObservationFeatures,
  atlasMcpToolDescriptorSchema,
} from '../dist/index.js';

const H = (c) => c.repeat(64);

function registry() {
  return buildObservationFeatureRegistry({
    registryRevision: 'registry-r1',
    definitions: [
      { feature_id: 'ast.ast_function', family: 'AST_BINARY', value_kind: 'BINARY', description: 'function declaration observed' },
      { feature_id: 'langextract.algorithm', family: 'LANGEXTRACT_BINARY', value_kind: 'BINARY', description: 'grounded algorithm extraction observed' },
      { feature_id: 'ontology.api', family: 'ONTOLOGY_BINARY', value_kind: 'BINARY', description: 'API ontology class' },
      { feature_id: 'graph.pagerank', family: 'GRAPH_CONTINUOUS', value_kind: 'CONTINUOUS', description: 'PageRank prior' },
      { feature_id: 'cluster.kmeans', family: 'CLUSTER_CATEGORICAL', value_kind: 'CATEGORICAL', description: 'KMeans assignment' },
      { feature_id: 'context.validation_passed', family: 'CONTEXT_CONTINUOUS', value_kind: 'BINARY', description: 'validator passed' },
    ],
  });
}

const ast = {
  schema: 'atlas.ast-grep-observation.v1',
  observation_id: 'ast-1',
  rule_id: 'ast-grep:function-declaration',
  source_ref: 'src/a.ts',
  source_revision: 'src-r1',
  byte_start: 0,
  byte_end: 10,
  matched_text_hash: H('a'),
  captures: { name: 'foo' },
  observation_kind: 'ast_function',
  confidence: 1,
  extractor_revision: 'ast-r1',
  canonical_authority: false,
};

const lang = {
  schema: 'atlas.grounded-langextract-observation.v1',
  extraction_id: 'lx-1',
  source_ref: 'src/a.ts',
  source_revision: 'src-r1',
  extraction_class: 'algorithm',
  extraction_text: 'BM25',
  char_interval: { start_pos: 0, end_pos: 4 },
  alignment_status: 'match_exact',
  alignment_exact: true,
  attributes: {},
  confidence: 0.9,
  extractor_revision: 'lx-r1',
  canonical_authority: false,
};

test('observation compiler preserves exact structural/grounded features outside the semantic latent', () => {
  const row = compileObservationFeatures({
    candidateId: 'candidate-1',
    rowOrdinal: 0,
    sourceRef: 'src/a.ts',
    sourceRevision: 'src-r1',
    workspaceRevision: 'workspace-r1',
    rowIdentityChecksum: H('1'),
    registry: registry(),
    astObservations: [ast],
    langExtractObservations: [lang],
    ontologyClasses: ['API'],
    graph: { pagerank: 0.25 },
    cluster: { kmeansCluster: 7 },
    context: { validationPassed: true },
  });

  assert.equal(row.ast_features.length, 1);
  assert.equal(row.ontology_features.length, 1);
  assert.equal(row.langextract_features.length, 1);
  assert.equal(row.langextract_features[0].family, 'LANGEXTRACT_BINARY');
  assert.ok(row.qdrant_tags.includes('ast=ast_function'));
  assert.ok(row.qdrant_tags.includes('langextract=algorithm'));
  assert.ok(row.qdrant_tags.includes('ontology=api'));

  const tensor = buildRouterFeatureTensor({ row, semanticLatent: new Array(64).fill(0.125) });
  assert.equal(tensor.semantic_latent_dimension, 64);
  assert.equal(tensor.semantic_latent.length, 64);
  assert.ok(tensor.exact_binary_feature_ordinals.length >= 3);
  assert.equal(tensor.exact_semantic_promotion_required, true);
  assert.equal(tensor.exact_source_promotion_required, true);
});

test('ontology-only feature rows remain evidence-grounded', () => {
  const row = compileObservationFeatures({
    candidateId: 'candidate-ontology',
    rowOrdinal: 1,
    sourceRef: 'docs/api.md',
    sourceRevision: 'src-r1',
    workspaceRevision: 'workspace-r1',
    rowIdentityChecksum: H('2'),
    registry: registry(),
    ontologyClasses: ['API'],
  });
  assert.deepEqual(row.observation_refs, ['ontology-class:api']);
  assert.equal(row.ontology_features.length, 1);
});

test('observation compiler rejects cross-revision observation mixing', () => {
  assert.throws(() => compileObservationFeatures({
    candidateId: 'candidate-1',
    rowOrdinal: 0,
    sourceRef: 'src/a.ts',
    sourceRevision: 'src-r2',
    workspaceRevision: 'workspace-r1',
    rowIdentityChecksum: H('1'),
    registry: registry(),
    astObservations: [ast],
  }), /SOURCE_REVISION_MISMATCH/);
});

test('default MCP surface keeps .okf as resources and mutations explicitly authorized', () => {
  const surface = buildDefaultAtlasMcpSurface('mcp-r1');
  assert.equal(surface.transport_binding, 'PROTOCOL_NEUTRAL');
  assert.equal(surface.current_server_migration_required, true);
  assert.ok(surface.resources.some((resource) => resource.uri === 'atlas://okf/domains/retrieval'));
  const apply = surface.tools.find((tool) => tool.name === 'atlas.patch.apply');
  assert.equal(apply.behavior, 'MUTATION');
  assert.equal(apply.validation_receipt_required, true);
  assert.equal(apply.mutation_authorization_required, true);
});

test('MCP mutation tool cannot omit validation or explicit authorization', () => {
  assert.throws(() => atlasMcpToolDescriptorSchema.parse({
    name: 'atlas.patch.apply',
    behavior: 'MUTATION',
    description: 'bad',
    input_schema_ref: 'in',
    output_schema_ref: 'out',
    validation_receipt_required: false,
    mutation_authorization_required: false,
    canonical_authority: false,
  }));
});
