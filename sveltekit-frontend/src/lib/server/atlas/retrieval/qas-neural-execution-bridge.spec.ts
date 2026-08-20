import { describe, expect, it } from 'vitest';
import { buildQasNeuralExecutionBridge } from './qas-neural-execution-bridge.js';

const graph = {
  schema: 'atlas.s-graph.v1' as const,
  workspaceRevision: 'ws-42',
  sourceRevision: 'src-9',
  graphRevision: 'graph-17',
  nodes: [
    { id: 'n-a', canonicalId: 'sym:A', kind: 'symbol' as const },
    { id: 'n-b', canonicalId: 'sym:B', kind: 'symbol' as const },
    { id: 'n-c', canonicalId: 'sym:C', kind: 'symbol' as const },
  ],
  edges: [
    { source: 'n-a', target: 'n-b', kind: 'CALLS' as const },
    { source: 'n-b', target: 'n-c', kind: 'CALLS' as const },
  ],
};

const candidates = [
  {
    packetKey: 'p-b',
    sourceRef: 'src/b.ts',
    stableSymbolId: 'sym:B',
    symbolVersionId: 'sv-b',
    workspaceRevision: 'ws-42',
    sourceRevision: 'src-b-2',
    representationRevision: 'repr-5',
    score: 0.74,
    fusionScore: 0.77,
    rankBefore: 1,
  },
  {
    packetKey: 'p-c',
    sourceRef: 'src/c.ts',
    stableSymbolId: 'sym:C',
    symbolVersionId: 'sv-c',
    workspaceRevision: 'ws-42',
    sourceRevision: 'src-c-2',
    representationRevision: 'repr-5',
    score: 0.69,
    fusionScore: 0.72,
    rankBefore: 2,
  },
];

const baseProjections = [
  {
    packet_key: 'p-b',
    semantic_similarity_768: 0.9,
    lexical_score: 0.8,
    exact_symbol_match: 0.5,
    ast_signal: 0.7,
    authority_norm: 0.01,
    community_fit: 0.6,
    domain_fit_query: 0.7,
    concept_fit: 0.6,
    nary_relation_fit: 0.5,
    kmeans_centroid_similarity: 0.5,
    kmeans_cluster_rank: 1,
    som_distance: 0.2,
    som_neighbor_radius: 1,
    hilbert_locality: 0.5,
    summary_quality: 0.8,
    summary_provenance: 1,
    recency: 0.9,
    retrieval_frequency: 0.6,
    execution_utility: 0.7,
    graph_distance: 1,
    process_fit: 0.8,
    dependency_fanout: 0,
    feature_label_confidence: 0.9,
    source_revision_match: 1,
    representation_revision_match: 1,
  },
  {
    packet_key: 'p-c',
    semantic_similarity_768: 0.82,
    lexical_score: 0.61,
    exact_symbol_match: 0.2,
    ast_signal: 0.65,
    authority_norm: 0.01,
    community_fit: 0.5,
    domain_fit_query: 0.6,
    concept_fit: 0.5,
    nary_relation_fit: 0.4,
    kmeans_centroid_similarity: 0.4,
    kmeans_cluster_rank: 2,
    som_distance: 0.3,
    som_neighbor_radius: 1,
    hilbert_locality: 0.4,
    summary_quality: 0.7,
    summary_provenance: 1,
    recency: 0.8,
    retrieval_frequency: 0.5,
    execution_utility: 0.6,
    graph_distance: 1,
    process_fit: 0.75,
    dependency_fanout: 0,
    feature_label_confidence: 0.9,
    source_revision_match: 1,
    representation_revision_match: 1,
  },
];

const spectralRows = [
  {
    canonicalId: 'sym:B',
    packetKey: 'p-b',
    sourceRef: 'src/b.ts',
    ordinal: 1,
    generation: 1,
    pagerank: 0.5,
    eigenvectorCentrality: 0.3,
    latent128: null,
    latent64: null,
    topology4: null,
  },
  {
    canonicalId: 'sym:C',
    packetKey: 'p-c',
    sourceRef: 'src/c.ts',
    ordinal: 2,
    generation: 2,
    pagerank: 1,
    eigenvectorCentrality: 0.6,
    latent128: null,
    latent64: null,
    topology4: null,
  },
];

const context = (candidate: (typeof candidates)[number]) => ({
  graphRevision: 'graph-17',
  featureRevision: 'feat-12',
  representationRevision: 'repr-5',
  taskKind: 'repair',
  domainClass: 'code',
  somRevision: null,
  features: {
    semanticAffinity: 0.1,
    lexicalAffinity: 0.1,
    graphAuthority: 0.1,
    astAffinity: 0.1,
    processAffinity: 0.1,
    domainAffinity: 0.1,
    priorExecutionSuccess: 0.1,
    reuseProbability: 0.1,
    recency: 0.1,
  },
  evidenceRefs: [candidate.sourceRef],
});

const idleGpu = {
  schema: 'atlas.runtime-resource-state.v1' as const,
  cudaAvailable: true,
  gpuUtilization: 0.1,
  freeVramBytes: 4 * 1024 * 1024 * 1024,
  reservedVramBytes: 512 * 1024 * 1024,
  cpuUtilization: 0.2,
  freeHostMemoryBytes: 16 * 1024 * 1024 * 1024,
  foregroundQueueDepth: 0,
};

describe('QAS neural execution bridge', () => {
  it('merges graph-owned features into the existing matrix and keeps one graph lane', () => {
    const result = buildQasNeuralExecutionBridge({
      requestId: 'req-1',
      policyRevision: 'policy-3',
      producerRevision: 'bridge-1',
      workspaceRevision: 'ws-42',
      representationRevision: 'repr-5',
      graph,
      spectralRows,
      seedCanonicalIds: ['sym:A'],
      maxGraphHops: 2,
      candidates,
      baseProjections,
      resolveFeatures: context,
      resource: idleGpu,
      workload: 'POINTWISE_RERANK',
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.receipt.logicalLanes).toEqual(['graph']);
    expect(result.receipt.matrixFeatureCount).toBe(25);
    expect(result.receipt.exactPromotionRequired).toBe(true);
    expect(result.graphProjectionReceipt.authoritySource).toBe('PAGERANK');
    expect(result.graphProjectionReceipt.algorithmsUsed).toContain('BOUNDED_K_HOP');
    expect(result.graphProjectionReceipt.executor).toBe('TYPESCRIPT_REFERENCE');

    // The S-graph projection owns these columns and therefore replaces stale values.
    expect(result.projections[0].authority_norm).toBeCloseTo(0.5);
    expect(result.projections[1].authority_norm).toBeCloseTo(1);
    expect(result.projections[0].graph_distance).toBeCloseTo(0.5);
    expect(result.projections[1].graph_distance).toBeCloseTo(1);
    expect(result.projections[0].dependency_fanout).toBeCloseTo(1);
    expect(result.projections[1].dependency_fanout).toBeCloseTo(0);

    // QAS rows consume the existing feature-matrix owner, not the placeholder context values.
    expect(result.rows[0].features.graphAuthority).toBeCloseTo(0.5);
    expect(result.rows[0].features.semanticAffinity).toBeCloseTo(0.9);
    expect(result.rows[0].features.priorExecutionSuccess).toBeCloseTo(0.7);
    expect(result.samplerCandidates).toHaveLength(2);
    expect(result.neuralExecutionPlan.primary.executor).toBe('LIBTORCH_CUDA');
  });

  it('uses the same feature pipeline while selecting a CPU executor without CUDA', () => {
    const result = buildQasNeuralExecutionBridge({
      requestId: 'req-2',
      policyRevision: 'policy-3',
      producerRevision: 'bridge-1',
      workspaceRevision: 'ws-42',
      representationRevision: 'repr-5',
      graph,
      spectralRows,
      seedCanonicalIds: ['sym:A'],
      candidates,
      baseProjections,
      resolveFeatures: context,
      resource: { ...idleGpu, cudaAvailable: false, freeVramBytes: 0 },
      workload: 'POINTWISE_RERANK',
    });

    expect(result.rows).toHaveLength(2);
    expect(result.neuralExecutionPlan.primary.executor).toBe('LIBTORCH_CPU');
    expect(result.receipt.canonicalWrites).toBe(false);
  });
});
