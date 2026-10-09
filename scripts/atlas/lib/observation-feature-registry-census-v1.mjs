import { createHash } from 'node:crypto';

export const OBSERVATION_FEATURE_SOURCE_MAP_V1 = Object.freeze([
  { family: 'AST_BINARY', prefix: 'ast.', valueKind: 'BINARY', producerField: 'ast_observation_kinds', source: 'observation_kind', dynamic: true },
  { family: 'ONTOLOGY_BINARY', prefix: 'ontology.', valueKind: 'BINARY', producerField: 'ontology_classes', source: 'ontologyClass', dynamic: true },
  { family: 'LANGEXTRACT_BINARY', prefix: 'langextract.', valueKind: 'BINARY', producerField: 'langextract_classes', source: 'extraction_class', dynamic: true },
  { family: 'GRAPH_CONTINUOUS', prefix: 'graph.pagerank', valueKind: 'CONTINUOUS', producerField: 'pagerank', source: 'graph.pagerank', dynamic: false },
  { family: 'GRAPH_CONTINUOUS', prefix: 'graph.ppr', valueKind: 'CONTINUOUS', producerField: 'personalized_pagerank', source: 'graph.ppr', dynamic: false },
  { family: 'GRAPH_CONTINUOUS', prefix: 'graph.degree', valueKind: 'CONTINUOUS', producerField: null, source: 'graph.degree', dynamic: false },
  { family: 'CLUSTER_CATEGORICAL', prefix: 'cluster.kmeans', valueKind: 'CATEGORICAL', producerField: 'kmeans_cluster_id', source: 'cluster.kmeansCluster', dynamic: false },
  { family: 'CLUSTER_CATEGORICAL', prefix: 'cluster.som', valueKind: 'CATEGORICAL', producerField: 'som_row,som_col', source: 'cluster.somCell', dynamic: false },
  { family: 'CLUSTER_CATEGORICAL', prefix: 'cluster.community', valueKind: 'CATEGORICAL', producerField: 'community_id', source: 'cluster.communityId', dynamic: false },
  { family: 'CONTEXT_CONTINUOUS', prefix: 'context.authority', valueKind: 'CONTINUOUS', producerField: null, source: 'context.authorityWeight', dynamic: false },
  { family: 'CONTEXT_CONTINUOUS', prefix: 'context.recency', valueKind: 'CONTINUOUS', producerField: null, source: 'context.recency', dynamic: false },
  { family: 'CONTEXT_CONTINUOUS', prefix: 'context.validation_passed', valueKind: 'BINARY', producerField: null, source: 'context.validationPassed', dynamic: false },
]);

export function normalizeObservedFeatureToken(value) {
  return String(value).normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildObservationFeatureRegistryCensusV1({ observedValues = [], schemaColumns = [] } = {}) {
  const columnSet = new Set(schemaColumns);
  const observations = observedValues.map((entry) => {
    const mapping = OBSERVATION_FEATURE_SOURCE_MAP_V1.find((candidate) => candidate.producerField === entry.producerField);
    const featureId = mapping ? (mapping.dynamic ? `${mapping.prefix}${normalizeObservedFeatureToken(entry.value)}` : mapping.prefix) : null;
    return {
      producer_field: entry.producerField,
      observed_value: entry.value,
      observed_count: Number(entry.count),
      candidate_feature_id: featureId,
      family: mapping?.family ?? null,
      value_kind: mapping?.valueKind ?? null,
      lineage_qualified: false,
      approval_state: 'REVIEW_REQUIRED',
    };
  });
  return {
    schema: 'atlas.observation-feature-registry-census.v1',
    status: 'DIAGNOSTIC_ONLY_NOT_APPROVED',
    source_map: OBSERVATION_FEATURE_SOURCE_MAP_V1.map((entry) => ({
      ...entry,
      persisted_column_present: entry.producerField ? entry.producerField.split(',').every((column) => columnSet.has(column)) : null,
    })),
    observations,
    registry_artifact_created: false,
    canonical_authority: false,
    persistent_store_writes_performed: false,
    scratch_artifact_written: true,
    checksum: createHash('sha256').update(JSON.stringify({
      source_map: OBSERVATION_FEATURE_SOURCE_MAP_V1,
      observations,
      schema_columns: [...columnSet].sort(),
    })).digest('hex'),
  };
}
