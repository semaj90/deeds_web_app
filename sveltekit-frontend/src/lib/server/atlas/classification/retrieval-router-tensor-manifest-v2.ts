import { QUERY_FEATURE_ORDER_V1, type QueryFeatureProjectionV1 } from './query-feature-projection-v1.js';

export const RETRIEVAL_ROUTER_TENSOR_REVISION_V2 = 'atlas.retrieval-router-tensor.v2' as const;

export const RETRIEVAL_ROUTER_SECTIONS_V2 = [
  { name: 'classification_mrl_128', width: 128 },
  { name: 'ontology_mask', width: 32 },
  { name: 'query_shape_v1', width: 26 },
  { name: 'operation_flags', width: 16 },
  { name: 'runtime_resource', width: 16 },
  { name: 'graph_tool_structure', width: 16 },
] as const;

export const RETRIEVAL_ROUTER_TENSOR_WIDTH_V2 = 234 as const;

export interface RetrievalRouterTensorManifestV2 {
  schema: 'atlas.retrieval-router-tensor-manifest.v2';
  revision: typeof RETRIEVAL_ROUTER_TENSOR_REVISION_V2;
  width: typeof RETRIEVAL_ROUTER_TENSOR_WIDTH_V2;
  sections: ReadonlyArray<{ name: string; offset: number; width: number }>;
  embedding: {
    modelId: 'google/embeddinggemma-300m';
    mode: 'classification';
    sourceRepresentationId: 'classification_768';
    representationId: 'classification_mrl_128';
    nativeDimension: 768;
    projectedDimension: 128;
    projectionMethod: 'mrl-prefix-l2-renorm';
    persistenceRequired: false;
  };
  queryFeatureRevision: 'atlas.query-feature-projection.v1';
  queryFeatureOrder: readonly string[];
  classifierRole: 'CONTROL_PLANE_ROUTER';
  evidenceAuthority: false;
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
}

export const RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2: RetrievalRouterTensorManifestV2 = {
  schema: 'atlas.retrieval-router-tensor-manifest.v2',
  revision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  width: RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
  sections: (() => {
    let offset = 0;
    return RETRIEVAL_ROUTER_SECTIONS_V2.map((section) => {
      const row = { name: section.name, offset, width: section.width };
      offset += section.width;
      return row;
    });
  })(),
  embedding: {
    modelId: 'google/embeddinggemma-300m',
    mode: 'classification',
    sourceRepresentationId: 'classification_768',
    representationId: 'classification_mrl_128',
    nativeDimension: 768,
    projectedDimension: 128,
    projectionMethod: 'mrl-prefix-l2-renorm',
    persistenceRequired: false,
  },
  queryFeatureRevision: 'atlas.query-feature-projection.v1',
  queryFeatureOrder: [...QUERY_FEATURE_ORDER_V1],
  classifierRole: 'CONTROL_PLANE_ROUTER',
  evidenceAuthority: false,
  canonicalWritesAllowed: false,
  retrievalVoteAdded: false,
};

if (RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.sections.reduce((sum, row) => sum + row.width, 0) !== RETRIEVAL_ROUTER_TENSOR_WIDTH_V2) {
  throw new Error('RETRIEVAL_ROUTER_TENSOR_V2_WIDTH_MISMATCH');
}

function finiteSection(name: string, values: readonly number[], width: number): number[] {
  if (values.length !== width) throw new Error(`ROUTER_TENSOR_SECTION_WIDTH_MISMATCH ${name} expected=${width} got=${values.length}`);
  const output = Array.from(values, Number);
  if (output.some((value) => !Number.isFinite(value))) throw new Error(`ROUTER_TENSOR_SECTION_NONFINITE ${name}`);
  return output;
}

export function flattenQueryFeatureProjectionV1(row: QueryFeatureProjectionV1): number[] {
  return QUERY_FEATURE_ORDER_V1.map((name) => Number(row[name]));
}

export function buildRetrievalRouterTensorV2(input: {
  classificationMrl128: readonly number[];
  ontologyMask32: readonly number[];
  queryFeatures: QueryFeatureProjectionV1 | readonly number[];
  operationFlags16: readonly number[];
  runtimeResource16: readonly number[];
  graphToolStructure16: readonly number[];
}): Float32Array {
  const queryFeatures = Array.isArray(input.queryFeatures)
    ? Array.from(input.queryFeatures, Number)
    : flattenQueryFeatureProjectionV1(input.queryFeatures as QueryFeatureProjectionV1);

  const tensor = [
    ...finiteSection('classification_mrl_128', input.classificationMrl128, 128),
    ...finiteSection('ontology_mask', input.ontologyMask32, 32),
    ...finiteSection('query_shape_v1', queryFeatures, 26),
    ...finiteSection('operation_flags', input.operationFlags16, 16),
    ...finiteSection('runtime_resource', input.runtimeResource16, 16),
    ...finiteSection('graph_tool_structure', input.graphToolStructure16, 16),
  ];
  if (tensor.length !== RETRIEVAL_ROUTER_TENSOR_WIDTH_V2) throw new Error('RETRIEVAL_ROUTER_TENSOR_V2_WIDTH_MISMATCH');
  return Float32Array.from(tensor);
}
