import { describe, expect, it } from 'vitest';
import {
  AlgorithmExecutionManifestV1Schema,
  bindAlgorithmManifestToAction,
} from './algorithm-execution-manifest.js';
import { detectModelTopology } from './model-topology-identity.js';
import { auditRepresentationDimensions } from './representation-dimension-audit.js';

function baseManifest() {
  return {
    schema: 'atlas.algorithm-execution-manifest.v1' as const,
    manifestId: 'm-1',
    executionId: 'e-1',
    requestId: 'r-1',
    workflowId: 'w-1',
    workflowRevision: 1,
    dagNodeId: 'n-1',
    actionId: 'a-1',
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
    logicalLane: 'semantic' as const,
    representations: [{
      representationId: 'semantic_768',
      representationRevision: 'sem-7',
      dimensions: 768,
      canonical: true,
      derivedFromRepresentationId: null,
    }],
    geometry: {
      kind: 'EUCLIDEAN_SEMANTIC' as const,
      role: 'SEARCH_SPACE' as const,
      dimensions: 768,
      metric: 'COSINE' as const,
      relationshipDegree: null,
      notes: [],
    },
    algorithm: {
      algorithmId: 'CAGRA_KNN' as const,
      family: 'VECTOR_SEARCH' as const,
      exactness: 'APPROXIMATE' as const,
      metric: 'COSINE' as const,
      topK: 32,
      maxHops: null,
      parameterRevision: 'cagra-1',
      parameterChecksumSha256: null,
    },
    backend: {
      backend: 'CUVS' as const,
      implementationId: 'parent_atlas_tensor.cagra_adapter',
      implementationRevision: 'rev-1',
      libraryVersion: null,
      device: 'CUDA' as const,
      computeCapability: [8, 6] as [number, number],
      compiled: true,
      deterministicClaim: 'BEST_EFFORT' as const,
    },
    transport: {
      kind: 'GRPC' as const,
      endpointClass: 'cuvs-grpc',
      serialization: 'PROTOBUF' as const,
      parserBackend: 'PROTOBUF_RUNTIME' as const,
    },
    model: {
      modelId: null,
      modelRevision: null,
      routerKind: 'NONE' as const,
      expertCount: null,
      expertsPerToken: null,
      compiledBackend: 'NONE' as const,
    },
    evidenceRefs: [],
    canonicalWrites: false,
    exactPromotionRequired: true,
    producerRevision: 'test',
  };
}

describe('AlgorithmExecutionManifestV1', () => {
  it('records representation, algorithm, executor, transport, and geometry independently', () => {
    const parsed = AlgorithmExecutionManifestV1Schema.parse(baseManifest());
    expect(parsed.representations[0].representationId).toBe('semantic_768');
    expect(parsed.algorithm.algorithmId).toBe('CAGRA_KNN');
    expect(parsed.backend.backend).toBe('CUVS');
    expect(parsed.transport.kind).toBe('GRPC');
    expect(parsed.geometry.kind).toBe('EUCLIDEAN_SEMANTIC');
  });

  it('does not permit Hilbert locality ordering to masquerade as a semantic search geometry', () => {
    const value: any = baseManifest();
    value.geometry = {
      kind: 'HILBERT_2D_LOCALITY_ORDER',
      role: 'SEARCH_SPACE',
      dimensions: 2,
      metric: 'NONE',
      relationshipDegree: null,
      notes: [],
    };
    value.algorithm.algorithmId = 'HILBERT_2D_SORT';
    value.algorithm.family = 'LOCALITY_ORDER';
    expect(() => AlgorithmExecutionManifestV1Schema.parse(value)).toThrow(/locality ordering/);
  });

  it('requires explicit model MoE topology for MODEL_MOE_ROUTING', () => {
    const value: any = baseManifest();
    value.algorithm.algorithmId = 'MODEL_MOE_ROUTING';
    value.algorithm.family = 'MODEL_ROUTING';
    value.model.routerKind = 'EXTERNAL_SOFTMAX';
    expect(() => AlgorithmExecutionManifestV1Schema.parse(value)).toThrow(/model-declared MoE topology/);
  });

  it('binds execution identity to the workflow action', () => {
    const manifest = AlgorithmExecutionManifestV1Schema.parse(baseManifest());
    const envelope = bindAlgorithmManifestToAction({ workflowId: 'w-1', dagNodeId: 'n-1', actionId: 'a-1', manifest });
    expect(envelope.manifest.executionId).toBe('e-1');
  });
});

describe('strict MoE topology detection', () => {
  it('recognizes explicit expert topology', () => {
    const result = detectModelTopology({
      modelId: 'model-x',
      modelRevision: 'rev-x',
      config: { num_local_experts: 8, num_experts_per_tok: 2 },
      producerRevision: 'test',
    });
    expect(result.topology).toBe('MOE');
    expect(result.groupedGemmEligible).toBe(true);
    expect(result.expertCount).toBe(8);
    expect(result.expertsPerToken).toBe(2);
  });

  it('keeps names and incomplete topology unknown', () => {
    const result = detectModelTopology({
      modelId: 'definitely-moe-sounding-model',
      modelRevision: 'rev-x',
      config: { model_type: 'mystery', num_experts: 8 },
      producerRevision: 'test',
    });
    expect(result.topology).toBe('UNKNOWN');
    expect(result.groupedGemmEligible).toBe(false);
  });
});

describe('representation dimension audit', () => {
  it('surfaces 384/768 canonical conflicts without choosing a winner', () => {
    const audit = auditRepresentationDimensions({
      representationFamily: 'semantic',
      declarations: [
        { sourceId: 'models/model-manifest.json', representationId: 'semantic', dimension: 384, canonicalClaim: true, revision: 'manifest-v3', notes: [] },
        { sourceId: 'embedding-contract-768.ts', representationId: 'semantic_768', dimension: 768, canonicalClaim: true, revision: 'semantic-768-v1', notes: [] },
      ],
      producerRevision: 'test',
    });
    expect(audit.conflict).toBe(true);
    expect(audit.status).toBe('CONFLICT_REQUIRES_EXPLICIT_EXECUTION_IDENTITY');
    expect(audit.observedDimensions).toEqual([384, 768]);
  });
});
