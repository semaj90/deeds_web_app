import { createHash } from 'node:crypto';
import {
  AlgorithmExecutionManifestV1Schema,
  type AlgorithmExecutionManifestV1,
  type ExecutionBackend,
  type TransportKind,
} from './algorithm-execution-manifest.js';

export type KnownExecutionContext = {
  manifestId: string;
  executionId: string;
  requestId: string;
  workflowId: string;
  workflowRevision: number;
  dagNodeId: string;
  actionId?: string | null;
  workspaceRevision: string;
  graphRevision?: string | null;
  producerRevision: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function base(input: KnownExecutionContext) {
  return {
    schema: 'atlas.algorithm-execution-manifest.v1' as const,
    manifestId: input.manifestId,
    executionId: input.executionId,
    requestId: input.requestId,
    workflowId: input.workflowId,
    workflowRevision: input.workflowRevision,
    dagNodeId: input.dagNodeId,
    actionId: input.actionId ?? null,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision ?? null,
    producerRevision: input.producerRevision,
  };
}

function cudaBackend(input: {
  backend: ExecutionBackend;
  implementationId: string;
  implementationRevision: string;
  libraryVersion?: string | null;
  computeCapability: [number, number];
  deterministicClaim: 'PROVEN' | 'BEST_EFFORT' | 'NONE';
}) {
  return {
    backend: input.backend,
    implementationId: input.implementationId,
    implementationRevision: input.implementationRevision,
    libraryVersion: input.libraryVersion ?? null,
    device: 'CUDA' as const,
    computeCapability: input.computeCapability,
    compiled: true,
    deterministicClaim: input.deterministicClaim,
  };
}

function serviceBackend(input: { backend: ExecutionBackend; implementationId: string; implementationRevision: string; libraryVersion?: string | null }) {
  return {
    backend: input.backend,
    implementationId: input.implementationId,
    implementationRevision: input.implementationRevision,
    libraryVersion: input.libraryVersion ?? null,
    device: 'SERVICE' as const,
    computeCapability: null,
    compiled: false,
    deterministicClaim: 'BEST_EFFORT' as const,
  };
}

function transport(
  kind: TransportKind,
  endpointClass: string | null,
  serialization: 'JSON' | 'MSGPACK' | 'PROTOBUF' | 'ARROW' | 'RAW_BYTES' | 'NONE',
  parserBackend: 'NATIVE_JSON' | 'SIMDJSON' | 'PROTOBUF_RUNTIME' | 'ARROW_RUNTIME' | 'NONE',
) {
  return { kind, endpointClass, serialization, parserBackend };
}

const noModel = {
  modelId: null,
  modelRevision: null,
  routerKind: 'NONE' as const,
  expertCount: null,
  expertsPerToken: null,
  compiledBackend: 'NONE' as const,
};

export function qdrantSemantic768Execution(input: KnownExecutionContext & {
  representationRevision: string;
  topK: number;
  implementationRevision: string;
  evidenceRefs?: string[];
}): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'semantic_768', representationRevision: input.representationRevision, dimensions: 768, canonical: true, derivedFromRepresentationId: null }],
    geometry: { kind: 'EUCLIDEAN_SEMANTIC', role: 'SEARCH_SPACE', dimensions: 768, metric: 'COSINE', relationshipDegree: null, notes: [] },
    algorithm: {
      algorithmId: 'VECTOR_KNN', family: 'VECTOR_SEARCH', exactness: 'APPROXIMATE', metric: 'COSINE', topK: input.topK, maxHops: null,
      parameterRevision: input.implementationRevision,
      parameterChecksumSha256: checksum({ topK: input.topK, representationRevision: input.representationRevision }),
    },
    backend: serviceBackend({ backend: 'QDRANT', implementationId: 'server/vector/qdrant-manager', implementationRevision: input.implementationRevision }),
    transport: transport('HTTP_JSON', 'qdrant-query-api', 'JSON', 'NATIVE_JSON'),
    model: noModel,
    evidenceRefs: input.evidenceRefs ?? [],
    canonicalWrites: false,
    exactPromotionRequired: true,
  });
}

/** Existing atlas-rapids-knn-client.ts path: HTTP/JSON to the :8098 RAPIDS sidecar. */
export function rapidsCuvsExactHttpExecution(input: KnownExecutionContext & {
  representationRevision: string;
  topK: number;
  implementationRevision: string;
  libraryVersion?: string | null;
  computeCapability: [number, number];
  evidenceRefs?: string[];
}): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'semantic_768', representationRevision: input.representationRevision, dimensions: 768, canonical: true, derivedFromRepresentationId: null }],
    geometry: { kind: 'EUCLIDEAN_SEMANTIC', role: 'SEARCH_SPACE', dimensions: 768, metric: 'COSINE', relationshipDegree: null, notes: [] },
    algorithm: {
      algorithmId: 'BRUTE_FORCE_KNN', family: 'VECTOR_SEARCH', exactness: 'EXACT', metric: 'COSINE', topK: input.topK, maxHops: null,
      parameterRevision: input.implementationRevision,
      parameterChecksumSha256: checksum({ algorithm: 'brute-force', metric: 'cosine', topK: input.topK }),
    },
    backend: cudaBackend({
      backend: 'CUVS', implementationId: 'parent_atlas_tensor.cuvs_exact', implementationRevision: input.implementationRevision,
      libraryVersion: input.libraryVersion, computeCapability: input.computeCapability, deterministicClaim: 'BEST_EFFORT',
    }),
    transport: transport('HTTP_JSON', 'atlas-rapids-sidecar:/v1/knn/exact', 'JSON', 'NATIVE_JSON'),
    model: noModel,
    evidenceRefs: input.evidenceRefs ?? [],
    canonicalWrites: false,
    exactPromotionRequired: true,
  });
}

export function rapidsCagraHttpExecution(input: KnownExecutionContext & {
  representationRevision: string;
  topK: number;
  implementationRevision: string;
  libraryVersion?: string | null;
  computeCapability: [number, number];
  evidenceRefs?: string[];
}): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'semantic_768', representationRevision: input.representationRevision, dimensions: 768, canonical: true, derivedFromRepresentationId: null }],
    geometry: { kind: 'EUCLIDEAN_SEMANTIC', role: 'SEARCH_SPACE', dimensions: 768, metric: 'COSINE', relationshipDegree: null, notes: [] },
    algorithm: {
      algorithmId: 'CAGRA_KNN', family: 'VECTOR_SEARCH', exactness: 'APPROXIMATE', metric: 'COSINE', topK: input.topK, maxHops: null,
      parameterRevision: input.implementationRevision,
      parameterChecksumSha256: checksum({ algorithm: 'cagra', metric: 'cosine', topK: input.topK }),
    },
    backend: cudaBackend({
      backend: 'CUVS', implementationId: 'parent_atlas_tensor.cagra_adapter', implementationRevision: input.implementationRevision,
      libraryVersion: input.libraryVersion, computeCapability: input.computeCapability, deterministicClaim: 'BEST_EFFORT',
    }),
    transport: transport('HTTP_JSON', 'atlas-rapids-sidecar:/v1/knn/cagra', 'JSON', 'NATIVE_JSON'),
    model: noModel,
    evidenceRefs: input.evidenceRefs ?? [],
    canonicalWrites: false,
    exactPromotionRequired: true,
  });
}

/** Separate owner: docker/cuvs-grpc, not the HTTP runner above. */
export function cuvsGrpcExecution(input: KnownExecutionContext & {
  algorithm: 'exact' | 'cagra';
  representationRevision: string;
  topK: number;
  implementationRevision: string;
  libraryVersion?: string | null;
  computeCapability: [number, number];
}): AlgorithmExecutionManifestV1 {
  const exact = input.algorithm === 'exact';
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'semantic_768', representationRevision: input.representationRevision, dimensions: 768, canonical: true, derivedFromRepresentationId: null }],
    geometry: { kind: 'EUCLIDEAN_SEMANTIC', role: 'SEARCH_SPACE', dimensions: 768, metric: 'COSINE', relationshipDegree: null, notes: [] },
    algorithm: {
      algorithmId: exact ? 'BRUTE_FORCE_KNN' : 'CAGRA_KNN', family: 'VECTOR_SEARCH', exactness: exact ? 'EXACT' : 'APPROXIMATE', metric: 'COSINE', topK: input.topK, maxHops: null,
      parameterRevision: input.implementationRevision,
      parameterChecksumSha256: checksum({ algorithm: input.algorithm, grpc: true, topK: input.topK }),
    },
    backend: cudaBackend({
      backend: 'CUVS', implementationId: 'docker/cuvs-grpc/src/cuvs_grpc_server.py', implementationRevision: input.implementationRevision,
      libraryVersion: input.libraryVersion, computeCapability: input.computeCapability, deterministicClaim: 'BEST_EFFORT',
    }),
    transport: transport('GRPC', 'cuvs-grpc', 'PROTOBUF', 'PROTOBUF_RUNTIME'),
    model: noModel,
    evidenceRefs: [],
    canonicalWrites: false,
    exactPromotionRequired: true,
  });
}

/** TypeScript reference A* on the derived semantic KNN context graph. */
export function knnAStarExecution(input: KnownExecutionContext & {
  representationRevision: string;
  maxHops: number;
  implementationRevision: string;
  provenLowerBound: boolean;
}): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'semantic_768', representationRevision: input.representationRevision, dimensions: 768, canonical: true, derivedFromRepresentationId: null }],
    geometry: { kind: 'GRAPH_TOPOLOGY', role: 'STRUCTURAL_SPACE', dimensions: null, metric: 'WEIGHTED_PATH_COST', relationshipDegree: null, notes: ['Derived KNN context graph; not canonical code relation graph.'] },
    algorithm: {
      algorithmId: 'A_STAR', family: 'GRAPH_SEARCH', exactness: 'EXACT', metric: 'WEIGHTED_PATH_COST', topK: null, maxHops: input.maxHops,
      parameterRevision: input.implementationRevision,
      parameterChecksumSha256: checksum({ lowerBound: input.provenLowerBound ? 'PROVEN' : 'ZERO', maxHops: input.maxHops }),
    },
    backend: {
      backend: 'TYPESCRIPT', implementationId: 'atlas/retrieval/knn-context-graph.searchKnnAStar', implementationRevision: input.implementationRevision,
      libraryVersion: null, device: 'CPU', computeCapability: null, compiled: false, deterministicClaim: 'PROVEN',
    },
    transport: transport('LOCAL_CALL', null, 'NONE', 'NONE'),
    model: noModel,
    evidenceRefs: [],
    canonicalWrites: false,
    exactPromotionRequired: true,
  });
}

export function hilbertLocalityExecution(input: KnownExecutionContext & { implementationRevision: string }): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'none', representations: [],
    geometry: { kind: 'HILBERT_2D_LOCALITY_ORDER', role: 'LOCALITY_ORDER', dimensions: 2, metric: 'NONE', relationshipDegree: null, notes: ['Ordering over an already-justified 2-D routing projection.'] },
    algorithm: { algorithmId: 'HILBERT_2D_SORT', family: 'LOCALITY_ORDER', exactness: 'DERIVED_FEATURE', metric: 'NONE', topK: null, maxHops: null, parameterRevision: input.implementationRevision, parameterChecksumSha256: null },
    backend: { backend: 'TYPESCRIPT', implementationId: 'parent-atlas-gpu-math-bundle/scripts/phase85/hilbert-locality-adapter.mjs', implementationRevision: input.implementationRevision, libraryVersion: null, device: 'CPU', computeCapability: null, compiled: false, deterministicClaim: 'PROVEN' },
    transport: transport('LOCAL_CALL', null, 'NONE', 'NONE'), model: noModel, evidenceRefs: [], canonicalWrites: false, exactPromotionRequired: false,
  });
}

export function quaternionRerankExecution(input: KnownExecutionContext & { representationRevision: string; implementationRevision: string }): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'semantic',
    representations: [{ representationId: 'manifold4', representationRevision: input.representationRevision, dimensions: 4, canonical: false, derivedFromRepresentationId: 'semantic_768' }],
    geometry: { kind: 'QUATERNION_S3', role: 'DERIVED_RERANK_FEATURE', dimensions: 4, metric: 'ANGULAR_ABS_DOT', relationshipDegree: null, notes: [] },
    algorithm: { algorithmId: 'QUATERNION_ABS_DOT', family: 'GEOMETRY_RERANK', exactness: 'DERIVED_FEATURE', metric: 'ANGULAR_ABS_DOT', topK: null, maxHops: null, parameterRevision: input.implementationRevision, parameterChecksumSha256: null },
    backend: { backend: 'TYPESCRIPT', implementationId: 'server/search/quaternion-manifold.quaternionSimilarity', implementationRevision: input.implementationRevision, libraryVersion: null, device: 'CPU', computeCapability: null, compiled: false, deterministicClaim: 'PROVEN' },
    transport: transport('LOCAL_CALL', null, 'NONE', 'NONE'), model: noModel, evidenceRefs: [], canonicalWrites: false, exactPromotionRequired: true,
  });
}

export function jacobianJvpExecution(input: KnownExecutionContext & { representationRevision: string; dimensions: number; implementationRevision: string }): AlgorithmExecutionManifestV1 {
  return AlgorithmExecutionManifestV1Schema.parse({
    ...base(input),
    logicalLane: 'none',
    representations: [{ representationId: 'projection-input', representationRevision: input.representationRevision, dimensions: input.dimensions, canonical: false, derivedFromRepresentationId: null }],
    geometry: { kind: 'JACOBIAN_SENSITIVITY', role: 'DIAGNOSTIC', dimensions: input.dimensions, metric: 'NONE', relationshipDegree: null, notes: ['Directional JVP/VJP diagnostic; full Jacobian is not materialized by default.'] },
    algorithm: { algorithmId: 'JACOBIAN_JVP', family: 'DERIVATIVE_DIAGNOSTIC', exactness: 'DIAGNOSTIC_ONLY', metric: 'NONE', topK: null, maxHops: null, parameterRevision: input.implementationRevision, parameterChecksumSha256: null },
    backend: { backend: 'PYTORCH_EAGER', implementationId: 'parent_atlas_policy.geometry_diagnostics.directional_stretch', implementationRevision: input.implementationRevision, libraryVersion: null, device: 'CPU', computeCapability: null, compiled: false, deterministicClaim: 'BEST_EFFORT' },
    transport: transport('LOCAL_CALL', null, 'NONE', 'NONE'), model: noModel, evidenceRefs: [], canonicalWrites: false, exactPromotionRequired: false,
  });
}
