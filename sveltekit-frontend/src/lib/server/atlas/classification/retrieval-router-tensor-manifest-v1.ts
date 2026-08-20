export const RETRIEVAL_ROUTER_TENSOR_REVISION_V1 = 'atlas.retrieval-router-tensor.v1' as const;

export const RETRIEVAL_ROUTER_SECTIONS_V1 = [
  { name: 'classification_mrl_128', width: 128 },
  { name: 'ontology_mask', width: 32 },
  { name: 'query_shape', width: 16 },
  { name: 'operation_flags', width: 16 },
  { name: 'runtime_resource', width: 16 },
  { name: 'graph_tool_structure', width: 16 },
] as const;

export const RETRIEVAL_ROUTER_TENSOR_WIDTH_V1 = 224 as const;

export interface RetrievalRouterTensorManifestV1 {
  schema: 'atlas.retrieval-router-tensor-manifest.v1';
  revision: typeof RETRIEVAL_ROUTER_TENSOR_REVISION_V1;
  width: typeof RETRIEVAL_ROUTER_TENSOR_WIDTH_V1;
  sections: ReadonlyArray<{
    name: string;
    offset: number;
    width: number;
  }>;
  semanticInput: {
    modelId: 'google/embeddinggemma-300m';
    mode: 'classification';
    nativeDimension: 768;
    projectedDimension: 128;
    projectionMethod: 'mrl-prefix-l2-renorm';
    persistenceRequired: false;
  };
  classifierRole: 'CONTROL_PLANE_ROUTER';
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
}

export const RETRIEVAL_ROUTER_TENSOR_MANIFEST_V1: RetrievalRouterTensorManifestV1 = {
  schema: 'atlas.retrieval-router-tensor-manifest.v1',
  revision: RETRIEVAL_ROUTER_TENSOR_REVISION_V1,
  width: RETRIEVAL_ROUTER_TENSOR_WIDTH_V1,
  sections: (() => {
    let offset = 0;
    return RETRIEVAL_ROUTER_SECTIONS_V1.map((section) => {
      const row = { name: section.name, offset, width: section.width };
      offset += section.width;
      return row;
    });
  })(),
  semanticInput: {
    modelId: 'google/embeddinggemma-300m',
    mode: 'classification',
    nativeDimension: 768,
    projectedDimension: 128,
    projectionMethod: 'mrl-prefix-l2-renorm',
    persistenceRequired: false,
  },
  classifierRole: 'CONTROL_PLANE_ROUTER',
  canonicalWritesAllowed: false,
  retrievalVoteAdded: false,
};

if (RETRIEVAL_ROUTER_TENSOR_MANIFEST_V1.sections.reduce((sum, row) => sum + row.width, 0) !== RETRIEVAL_ROUTER_TENSOR_WIDTH_V1) {
  throw new Error('RETRIEVAL_ROUTER_TENSOR_WIDTH_MISMATCH');
}
