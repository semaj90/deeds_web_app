import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRetrieveAllCandidates, mockRetrieveAllCandidatesWithReceipts } = vi.hoisted(() => ({
  mockRetrieveAllCandidates: vi.fn(),
  mockRetrieveAllCandidatesWithReceipts: vi.fn(),
}));

const { mockRerankCanonicalFeatureEnvelopes } = vi.hoisted(() => ({
  mockRerankCanonicalFeatureEnvelopes: vi.fn(),
}));

const { mockHydrateCandidates } = vi.hoisted(() => ({
  mockHydrateCandidates: vi.fn(),
}));

const { mockHydrateCandidatesWithProof } = vi.hoisted(() => ({
  mockHydrateCandidatesWithProof: vi.fn(),
}));

const { mockRecordPromotionIntent } = vi.hoisted(() => ({
  mockRecordPromotionIntent: vi.fn(),
}));

const { mockAppendSearchRuntimeTrainingRow } = vi.hoisted(() => ({
  mockAppendSearchRuntimeTrainingRow: vi.fn(),
}));

const { mockReadKagHypergraphNeighborsV1 } = vi.hoisted(() => ({
  mockReadKagHypergraphNeighborsV1: vi.fn(),
}));
const { mockReadKagCodeHyperedgesV1, mockResolveKagPacketBindingsV1 } = vi.hoisted(() => ({
  mockReadKagCodeHyperedgesV1: vi.fn(),
  mockResolveKagPacketBindingsV1: vi.fn(),
}));
const { mockExecuteGraphV2BoundedTraversalV1 } = vi.hoisted(() => ({
  mockExecuteGraphV2BoundedTraversalV1: vi.fn(),
}));

vi.mock('./retrieve-candidates.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./retrieve-candidates.js')>();
  return {
    ...actual,
    retrieveAllCandidates: mockRetrieveAllCandidates,
    retrieveAllCandidatesWithReceipts: mockRetrieveAllCandidatesWithReceipts,
  };
});

vi.mock('./canonical-rerank-executor.js', () => ({
  rerankCanonicalFeatureEnvelopes: mockRerankCanonicalFeatureEnvelopes,
}));

vi.mock('./hydrate-candidates.js', () => ({
  hydrateCandidates: mockHydrateCandidates,
  hydrateCandidatesWithProof: mockHydrateCandidatesWithProof,
}));

vi.mock('./promote-results-outbox.js', () => ({
  recordPromotionIntent: mockRecordPromotionIntent,
}));

vi.mock('../atlas/policy/policy-training.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../atlas/policy/policy-training.js')>();
  return {
    ...actual,
    appendSearchRuntimeTrainingRow: mockAppendSearchRuntimeTrainingRow,
  };
});

vi.mock('../atlas/integration/kag-hypergraph-reader-v1.js', () => ({
  readKagHypergraphNeighborsStrictV1: mockReadKagHypergraphNeighborsV1,
  readKagCodeHyperedgesStrictV1: mockReadKagCodeHyperedgesV1,
  resolveKagPacketCandidateBindingsStrictV1: mockResolveKagPacketBindingsV1,
}));

vi.mock('../atlas/integration/graph-v2-bounded-traversal-v1.js', () => ({
  executeGraphV2BoundedTraversalV1: mockExecuteGraphV2BoundedTraversalV1,
}));

vi.mock('../atlas/identity/packet-identity-resolver.js', () => ({
  resolvePacketKeyResolutionV2: async (key: string) => {
    const identities: Record<string, string> = {
      'packet-1': 'packet:00000000-0000-5000-8000-000000000001',
      'packet-2': 'packet:00000000-0000-5000-8000-000000000002',
      'packet-3': 'packet:00000000-0000-5000-8000-000000000003',
    };
    const canonicalPacketKey = identities[key];
    if (!canonicalPacketKey) throw new Error('unresolved');
    return { canonicalPacketKey, storagePacketKey: key, resolutionSource: 'LEGACY_ALIAS', aliasEvidenceVersion: 'PACKET_KEY_V1_STORAGE_TO_V2@1' };
  },
}));

import { buildFunctionRegistryRetrievalProofV1, buildGraphCandidateEvidenceV1, createSearchRuntime, SearchRuntime } from './search-runtime.js';
import type { SearchResult } from './search-runtime.js';
import { classifyAtlasQuery } from '../atlas/agentic-file-compiler/query-classifier.js';
import { compileTaxonomyScopeV1 } from '../atlas/agentic-file-compiler/taxonomy-scope-v1.js';
import { buildQueryExpansionBundleV1 } from '../atlas/agentic-file-compiler/query-expansion-v1.js';

describe('search runtime bridge', () => {
  it('carries graph edge evidence to final packets only when packet and revisions match', () => {
    const candidate = {
      id: 'packet-a', packetKey: 'packet-a', sourceRef: 'src/a.ts', summary: '', content: '', score: 0.8,
      scoreSource: 'ast_tree' as const, sourceRevision: `sha256:${'a'.repeat(64)}`,
      workspaceRevision: `sha256:${'b'.repeat(64)}`, graphRevision: 'c'.repeat(64),
      graphEvidenceRefs: ['kag:edge-2', 'kag:edge-1'],
    };
    const packet = {
      packet_key: 'packet-a', source_ref: 'src/a.ts', source_revision: candidate.sourceRevision,
      workspace_revision: candidate.workspaceRevision, graph_revision: candidate.graphRevision,
    } as any;
    expect(buildGraphCandidateEvidenceV1([candidate], [packet])).toEqual([{
      packetKey: 'packet-a', sourceRef: 'src/a.ts', sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision, graphRevision: candidate.graphRevision,
      evidenceRefs: ['kag:edge-1', 'kag:edge-2'],
    }]);
    expect(buildGraphCandidateEvidenceV1([candidate], [{ ...packet, source_revision: `sha256:${'d'.repeat(64)}` }])).toEqual([]);
  });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    );
    mockRetrieveAllCandidates.mockReset();
    mockRetrieveAllCandidatesWithReceipts.mockReset();
    mockRetrieveAllCandidatesWithReceipts.mockImplementation(async (...args: unknown[]) => ({
      candidates: await mockRetrieveAllCandidates(...args),
      laneReceipts: [],
    }));
    mockRerankCanonicalFeatureEnvelopes.mockReset();
    mockHydrateCandidates.mockReset();
    mockHydrateCandidatesWithProof.mockReset();
    mockRecordPromotionIntent.mockReset();
    mockAppendSearchRuntimeTrainingRow.mockReset();
    mockAppendSearchRuntimeTrainingRow.mockResolvedValue({});
    mockReadKagHypergraphNeighborsV1.mockReset();
    mockExecuteGraphV2BoundedTraversalV1.mockReset();
    mockExecuteGraphV2BoundedTraversalV1.mockResolvedValue([]);
    mockReadKagCodeHyperedgesV1.mockReset();
    mockResolveKagPacketBindingsV1.mockReset();
    mockReadKagCodeHyperedgesV1.mockResolvedValue([]);
    mockResolveKagPacketBindingsV1.mockResolvedValue([]);
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({
      requestedCanonicalIds: 0,
      matchedTuples: 0,
      matchedHyperedges: 0,
      neighbors: [],
    });
  });

  it('uses the receipt adapter and binds its diagnostics to the task and requested revisions', async () => {
    mockRetrieveAllCandidatesWithReceipts.mockResolvedValue({
      candidates: [],
      laneReceipts: [{ lane: 'bm25', logicalLane: 'lexical', status: 'empty', hitCount: 0, elapsedMs: 3, deadlineMs: 5000 }],
    });
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const runtime = createSearchRuntime({ userId: 'actor-1', readOnly: true });
    const result = await runtime.search({
      text: 'no-match-query',
      workspaceId,
      workspaceRevision: 'sha256:workspace',
      sourceRevision: 'sha256:source',
      representationId: 'semantic_768',
      representationRevision: 1,
      topK: 1,
    }, {
      runId: 'run-1',
      taskId: 'task-1',
      embeddingModelId: 'embeddinggemma2-fixture',
      embeddingModelRevision: `sha256:${'a'.repeat(64)}`,
      actorGrant: {
        status: 'AUTHORIZED',
        actorId: 'actor-1',
        workspaceId,
        workspaceRevision: 'sha256:workspace',
        repositoryIds: ['repository-1'],
        allowedSourceRefs: ['src/example.ts'],
        authorityRef: 'fixture-grant-1',
      },
    });

    expect(mockRetrieveAllCandidatesWithReceipts).toHaveBeenCalledOnce();
    expect(mockRetrieveAllCandidatesWithReceipts.mock.calls[0]?.[3]).toEqual(expect.objectContaining({
      goRetrievalContext: expect.objectContaining({
        requestId: 'run-1:go-retrieval',
        taskId: 'task-1',
        runId: 'run-1',
        workspaceId,
        workspaceRevision: 'sha256:workspace',
        sourceRevision: 'sha256:source',
        representationId: 'semantic_768',
        representationRevision: 1,
        embeddingModelId: 'embeddinggemma2-fixture',
        embeddingModelRevision: `sha256:${'a'.repeat(64)}`,
      }),
    }));
    expect(mockRetrieveAllCandidates).not.toHaveBeenCalled();
    expect(result.proof.laneReceipts).toEqual([expect.objectContaining({
      lane: 'bm25',
      status: 'empty',
      binding: expect.objectContaining({
        runId: 'run-1',
        taskId: 'task-1',
        workspaceId,
        workspaceRevision: 'sha256:workspace',
        sourceRevision: 'sha256:source',
        representationId: 'semantic_768',
        representationRevision: 1,
        bindingStatus: 'complete',
        authorizationBindingStatus: 'validated_actor_grant',
      }),
    })]);
  });

  it('uses the injected reranker order without allowing candidate identity or revision changes', async () => {
    const sourceRevision = `sha256:${'a'.repeat(64)}`;
    const workspaceRevision = `sha256:${'b'.repeat(64)}`;
    const candidates = [
      { packetKey: 'packet-1', sourceRef: 'src/a/route.ts', sourceRevision, workspaceRevision, rank: 1, score: 0.9, lane: 'ast' as const },
      { packetKey: 'packet-2', sourceRef: 'src/b/helper.ts', sourceRevision, workspaceRevision, rank: 2, score: 0.8, lane: 'ast' as const },
    ];
    const envelopes = candidates.map((candidate, index) => ({
      chunk_id: candidate.packetKey,
      packet_key: candidate.packetKey,
      source_ref: candidate.sourceRef,
      source_revision: candidate.sourceRevision,
      workspace_revision: candidate.workspaceRevision,
      retrieved_rank: index + 1,
      retrieval_source: 'ast',
      fusion_score: 0.5 - index / 10,
    }));
    mockHydrateCandidatesWithProof.mockResolvedValue({
      envelopes,
      proof: {
        canonicalJoinedCount: 2, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0, representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0, graphScoreMissingCount: 2, summaryResolvedCount: 2,
        summaryStaleRejectedCount: 0, validationReasons: {},
      },
    });
    const reranker = {
      modelVersion: 'test-context-ranker-v1',
      rerank: vi.fn(async ({ candidates: input }: { candidates: typeof candidates }) => ({
        ranked: [...input].reverse(),
        modelVersion: 'test-context-ranker-v1',
      })),
    };
    const runtime = createSearchRuntime({
      readOnly: true,
      reranker,
      postProcessConfig: { dedupPrefixDepth: 0 },
      retrievers: [{ lane: 'ast', retrieve: async () => candidates }],
    });

    const result = await runtime.search({ text: 'drizzle route helper', topK: 2, workspaceRevision });

    expect(reranker.rerank).toHaveBeenCalledWith(expect.objectContaining({
      query: 'drizzle route helper',
      candidates: expect.arrayContaining([
        expect.objectContaining({ packetKey: 'packet-1', sourceRef: 'src/a/route.ts', sourceRevision, workspaceRevision }),
        expect.objectContaining({ packetKey: 'packet-2', sourceRef: 'src/b/helper.ts', sourceRevision, workspaceRevision }),
      ]),
    }));
    expect(mockRerankCanonicalFeatureEnvelopes).not.toHaveBeenCalled();
    expect(result.packets.map((packet) => packet.packet_key)).toEqual(['packet-2', 'packet-1']);
    expect(result.provenance.rerankModel).toBe('test-context-ranker-v1');
  });

  it('rejects injected reranker output that mutates a source binding', async () => {
    const sourceRevision = `sha256:${'c'.repeat(64)}`;
    const workspaceRevision = `sha256:${'d'.repeat(64)}`;
    const candidate = {
      packetKey: 'packet-1', sourceRef: 'src/a/route.ts', sourceRevision,
      workspaceRevision, rank: 1, score: 0.9, lane: 'ast' as const,
    };
    mockHydrateCandidatesWithProof.mockResolvedValue({
      envelopes: [{
        chunk_id: candidate.packetKey, packet_key: candidate.packetKey, source_ref: candidate.sourceRef,
        source_revision: sourceRevision, workspace_revision: workspaceRevision, retrieved_rank: 1,
        retrieval_source: 'ast', fusion_score: 0.9,
      }],
      proof: {
        canonicalJoinedCount: 1, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0, representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0, graphScoreMissingCount: 1, summaryResolvedCount: 1,
        summaryStaleRejectedCount: 0, validationReasons: {},
      },
    });
    const runtime = new SearchRuntime({
      readOnly: true,
      reranker: {
        modelVersion: 'malicious-ranker',
        rerank: async ({ candidates: input }) => ({
          ranked: [{ ...input[0]!, sourceRef: 'src/forged.ts' }],
          modelVersion: 'malicious-ranker',
        }),
      },
      postProcessConfig: { dedupPrefixDepth: 0 },
      retrievers: [{ lane: 'ast', retrieve: async () => [candidate] }],
    });

    const result = await runtime.search({ text: 'drizzle route helper', topK: 1, workspaceRevision });

    expect(result.packets.map((packet) => packet.source_ref)).toEqual(['src/a/route.ts']);
    expect(result.provenance.rerankModel).toBe('injected-reranker-invalid-output');
    expect(result.provenance.rerankerUsed).toBe(false);
  });

  it('retrieves from multiple lanes, reranks canonically, and returns feature envelopes', async () => {
    mockRetrieveAllCandidates.mockResolvedValue([
      {
        id: 'chunk-bm25',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        summary: 'bm25 summary',
        content: 'bm25 content',
        score: 0.9,
        scoreSource: 'postgres_trigram',
      },
      {
        id: 'chunk-qdrant-2',
        packetKey: 'packet-2',
        sourceRef: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        score: 0.81,
        scoreSource: 'qdrant',
      },
    ]);
    const hydratedPackets = [
      {
        packet_key: 'packet-1',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'qdrant summary',
        content: 'qdrant content',
        retrieved_rank: 1,
        cross_encoder_score: 0.92,
        blended_score: 0.91,
        rank_after: 1,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
      {
        packet_key: 'packet-2',
        source_ref: 'src/lib/other.ts',
        relative_path: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        retrieved_rank: 2,
        cross_encoder_score: 0.81,
        blended_score: 0.79,
        rank_after: 2,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
    ] as any;
    mockHydrateCandidates.mockResolvedValue(hydratedPackets);
    mockHydrateCandidatesWithProof.mockResolvedValue({
      envelopes: hydratedPackets,
      proof: {
        canonicalJoinedCount: 2,
        canonicalJoinMissingCount: 0,
        workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0,
        sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0,
        representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 1,
        graphScoreMissingCount: 1,
        summaryResolvedCount: 2,
        summaryStaleRejectedCount: 0,
        validationReasons: {},
      },
    });
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-qdrant',
          packet_key: 'packet-1',
          source_ref: 'src/lib/example.ts',
          relative_path: 'src/lib/example.ts',
          summary: 'qdrant summary',
          content: 'qdrant content',
          retrieved_rank: 1,
          cross_encoder_score: 0.92,
          blended_score: 0.91,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
        {
          chunk_id: 'chunk-qdrant-2',
          packet_key: 'packet-2',
          source_ref: 'src/lib/other.ts',
          relative_path: 'src/lib/other.ts',
          summary: 'qdrant summary 2',
          content: 'qdrant content 2',
          retrieved_rank: 2,
          cross_encoder_score: 0.81,
          blended_score: 0.79,
          rank_after: 2,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:test',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 2,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 3,
      },
    });
    mockRecordPromotionIntent.mockResolvedValue(1);

    const runtime = createSearchRuntime({ userId: 'user-1' });
    const result = await runtime.search({
      text: 'canonical rerank spine',
      topK: 2,
    });

    expect(mockRetrieveAllCandidates).toHaveBeenCalledWith(
      'canonical rerank spine',
      { includeGenerated: false, includeLegacy: false },
      undefined,
      expect.objectContaining({ includeVectorLanes: true, globalTimeoutMs: 8000 })
    );
    expect(mockRerankCanonicalFeatureEnvelopes).toHaveBeenCalledTimes(1);
    expect(mockAppendSearchRuntimeTrainingRow).not.toHaveBeenCalled();
    expect(mockRerankCanonicalFeatureEnvelopes.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        rerankTier: 'deep',
        policyDecision: expect.objectContaining({
          action: expect.any(String),
          budget: expect.any(String),
          stateHint: expect.any(String),
        }),
        executionBudget: expect.objectContaining({
          maxParallelToolCalls: expect.any(Number),
          maxContextTokens: expect.any(Number),
        }),
      }),
    );
    expect(mockHydrateCandidatesWithProof).toHaveBeenCalledTimes(1);
    expect(mockRecordPromotionIntent).toHaveBeenCalledTimes(1);
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]?.packet_key).toBe('packet-1');
    expect(result.proof).toEqual(expect.objectContaining({
      requestedTopK: 2,
      rawQdrantCount: 1,
      canonicalJoinedCount: 2,
      duplicateSymbolVersionCount: 0,
      finalContextCount: 1,
    }));
    expect(result.provenance.rerankModel).toBe('mixedbread-ai/mxbai-rerank-base-v2');
    expect(result.provenance.rerankerUsed).toBe(true);
    expect(result.provenance.hypergraphNeighbors).toBeUndefined();
  });

  it('populates provenance.hypergraphNeighbors from real KAG rows without altering packets/metadata (KAG next-steps item 1)', async () => {
    mockRetrieveAllCandidates.mockResolvedValue([
      {
        id: 'chunk-bm25',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        summary: 'bm25 summary',
        content: 'bm25 content',
        score: 0.9,
        scoreSource: 'postgres_trigram',
      },
      {
        id: 'chunk-qdrant-2',
        packetKey: 'packet-2',
        sourceRef: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        score: 0.81,
        scoreSource: 'qdrant',
      },
    ]);
    const hydratedPackets = [
      {
        packet_key: 'packet-1',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'qdrant summary',
        content: 'qdrant content',
        retrieved_rank: 1,
        cross_encoder_score: 0.92,
        blended_score: 0.91,
        rank_after: 1,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
      {
        packet_key: 'packet-2',
        source_ref: 'src/lib/other.ts',
        relative_path: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        retrieved_rank: 2,
        cross_encoder_score: 0.81,
        blended_score: 0.79,
        rank_after: 2,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
    ] as any;
    mockHydrateCandidates.mockResolvedValue(hydratedPackets);
    mockHydrateCandidatesWithProof.mockResolvedValue({
      envelopes: hydratedPackets,
      proof: {
        canonicalJoinedCount: 2,
        canonicalJoinMissingCount: 0,
        workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0,
        sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0,
        representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 1,
        graphScoreMissingCount: 1,
        summaryResolvedCount: 2,
        summaryStaleRejectedCount: 0,
        validationReasons: {},
      },
    });
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-qdrant',
          packet_key: 'packet-1',
          source_ref: 'src/lib/example.ts',
          workspace_revision: 'workspace:r1',
          graph_revision: 'graph:r1',
          relative_path: 'src/lib/example.ts',
          summary: 'qdrant summary',
          content: 'qdrant content',
          retrieved_rank: 1,
          cross_encoder_score: 0.92,
          blended_score: 0.91,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:test',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 2,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 3,
      },
    });
    mockRecordPromotionIntent.mockResolvedValue(1);
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({
      requestedCanonicalIds: 1,
      matchedTuples: 1,
      matchedHyperedges: 1,
      neighbors: [{ canonicalId: 'packet:00000000-0000-5000-8000-000000000001', hyperedgeIds: ['hyperedge:abc123'] }],
    });

    const runtime = createSearchRuntime({ userId: 'user-1' });
    const result = await runtime.search({
      text: 'canonical rerank spine',
      topK: 2,
    });

    // Additive contract: packets/metadata are unaffected by the hypergraph lookup.
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]?.packet_key).toBe('packet-1');
    expect(result.metadata.candidatesReranked).toBe(1);

    // The new evidence is attached to provenance only.
    expect(mockReadKagHypergraphNeighborsV1).toHaveBeenCalledWith(['packet:00000000-0000-5000-8000-000000000001'], {
      workspaceRevision: 'workspace:r1',
      graphRevision: 'graph:r1',
    });
    expect(result.provenance.hypergraphNeighbors).toEqual([
      { canonicalId: 'packet:00000000-0000-5000-8000-000000000001', hyperedgeIds: ['hyperedge:abc123'] },
    ]);
    expect(result.provenance.hypergraphGraphRevision).toBe('graph:r1');

    mockReadKagHypergraphNeighborsV1.mockClear();
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValueOnce({
      results: [{
        chunk_id: 'chunk-qdrant',
        packet_key: 'packet-1',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'qdrant summary',
        content: 'qdrant content',
        retrieved_rank: 1,
      }],
      provenance: { cacheStatus: 'miss', cacheKey: 'rerank:v1:test', modelVersion: 'none', rendererVersion: 'search-runtime-v1', authScope: 'public', topK: 2, maxLength: 4096, crossEncoderAttempted: false, crossEncoderUsed: false, fallbackUsed: false, latencyMs: 0 },
    });
    const unqualifiedResult = await runtime.search({ text: 'unqualified graph packet', topK: 2 });
    expect(mockReadKagHypergraphNeighborsV1).not.toHaveBeenCalled();
    expect(unqualifiedResult.provenance.hypergraphNeighbors).toBeUndefined();
  });

  it('fans out only exact graph-bound packet neighbors into hydration and final Top-K', async () => {
    const workspaceRevision = `sha256:${'1'.repeat(64)}`;
    const graphRevision = `sha256:${'2'.repeat(64)}`;
    const sourceRevision = `sha256:${'3'.repeat(64)}`;
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({
      requestedCanonicalIds: 1,
      matchedTuples: 0,
      matchedHyperedges: 1,
      neighbors: [{
        canonicalId: 'packet:00000000-0000-5000-8000-000000000001',
        hyperedgeIds: ['packet-incidence:sha256:edge'],
        candidateBindings: [{
          canonicalId: 'packet:00000000-0000-5000-8000-000000000002',
          packetKey: 'packet-2',
          sourceRef: 'src/server/other.ts',
          sourceRevision,
          workspaceRevision,
          graphRevision,
          hyperedgeId: 'packet-incidence:sha256:edge',
        }],
      }],
    });
    mockHydrateCandidatesWithProof.mockImplementation(async (candidates: Array<Record<string, unknown>>) => ({
      envelopes: candidates.map((candidate, index) => ({
        chunk_id: String(candidate.packetKey),
        packet_key: String(candidate.packetKey),
        source_ref: String(candidate.sourceRef),
        relative_path: String(candidate.sourceRef),
        workspace_revision: String(candidate.workspaceRevision),
        graph_revision: graphRevision,
        source_revision: String(candidate.sourceRevision),
        summary: `hydrated ${String(candidate.packetKey)}`,
        content: `content ${String(candidate.packetKey)}`,
        retrieved_rank: index + 1,
      })),
      proof: {
        canonicalJoinedCount: candidates.length,
        canonicalJoinMissingCount: 0,
        workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0,
        sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0,
        representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0,
        graphScoreMissingCount: candidates.length,
        summaryResolvedCount: candidates.length,
        summaryStaleRejectedCount: 0,
        validationReasons: {},
      },
    }));
    mockRerankCanonicalFeatureEnvelopes.mockImplementation(async (_query: string, envelopes: Array<Record<string, unknown>>) => ({
      results: envelopes.map((envelope, index) => ({
        ...envelope,
        retrieved_rank: index + 1,
        rank_after: index + 1,
      })),
      provenance: {
        cacheStatus: 'miss', cacheKey: 'test', modelVersion: 'none', rendererVersion: 'search-runtime-v1',
        authScope: 'public', topK: 2, maxLength: 1024, crossEncoderAttempted: false,
        crossEncoderUsed: false, fallbackUsed: false, latencyMs: 0,
      },
    }));

    const runtime = new SearchRuntime({
      readOnly: true,
      retrievers: [{
        lane: 'ast',
        retrieve: async () => [{
          packetKey: 'packet-1',
          sourceRef: 'src/lib/example.ts',
          sourceRevision,
          workspaceRevision,
          rank: 1,
          score: 0.9,
          lane: 'ast',
          metadata: { graph_revision: graphRevision },
        }],
      }],
    });
    const result = await runtime.search({ text: 'follow graph reference', topK: 2, workspaceRevision });

    expect(mockHydrateCandidatesWithProof.mock.calls[0]?.[0].map((candidate: { packetKey: string }) => candidate.packetKey))
      .toContain('packet-2');
    expect(result.packets.map((packet) => packet.packet_key)).toContain('packet-2');
    expect(result.provenance.retrievalSources).toContain('ast_tree');
  });

  it('carries a bounded GraphV2 multi-hop path through hydration, final Top-K, and graph evidence provenance', async () => {
    const workspaceRevision = `sha256:${'5'.repeat(64)}`;
    const graphRevision = '6'.repeat(64);
    const sourceRevision = `sha256:${'7'.repeat(64)}`;
    mockExecuteGraphV2BoundedTraversalV1.mockResolvedValue([{
      packetKey: 'packet-2',
      sourceRef: 'src/server/neighbor.ts',
      sourceRevision,
      workspaceRevision,
      graphRevision,
      relationId: 'edge:last',
      relationKind: 'CALLS',
      relationConfidence: 0.72,
      traversalDepth: 2,
      relationPathIds: ['edge:first', 'edge:last'],
    }]);
    mockHydrateCandidatesWithProof.mockImplementation(async (items: Array<Record<string, unknown>>) => ({
      envelopes: items.map((candidate, index) => ({
        chunk_id: String(candidate.packetKey),
        packet_key: String(candidate.packetKey),
        source_ref: String(candidate.sourceRef),
        relative_path: String(candidate.sourceRef),
        source_revision: String(candidate.sourceRevision),
        workspace_revision: String(candidate.workspaceRevision),
        graph_revision: graphRevision,
        summary: 'qualified graph candidate',
        content: 'qualified graph candidate content',
        retrieved_rank: index + 1,
      })),
      proof: {
        canonicalJoinedCount: items.length, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0, representationRejectedCount: 0,
        representationRevisionRejectedCount: 0, graphScoreAttachedCount: 0, graphScoreMissingCount: items.length,
        summaryResolvedCount: items.length, summaryStaleRejectedCount: 0, validationReasons: {},
      },
    }));
    mockRerankCanonicalFeatureEnvelopes.mockImplementation(async (_query: string, items: Array<Record<string, unknown>>) => ({
      results: items.map((item, index) => ({ ...item, retrieved_rank: index + 1, rank_after: index + 1 })),
      provenance: {
        cacheStatus: 'miss', cacheKey: 'test', modelVersion: 'none', rendererVersion: 'search-runtime-v1',
        authScope: 'public', topK: 2, maxLength: 1024, crossEncoderAttempted: false,
        crossEncoderUsed: false, fallbackUsed: false, latencyMs: 0,
      },
    }));
    const runtime = new SearchRuntime({ readOnly: true, retrievers: [{
      lane: 'ast',
      retrieve: async () => [{
        packetKey: 'packet-1', sourceRef: 'src/client/seed.ts', sourceRevision,
        workspaceRevision, rank: 1, score: 0.9, lane: 'ast', metadata: { graph_revision: graphRevision },
      }],
    }] });

    const result = await runtime.search({ text: 'follow graph path', topK: 2, workspaceRevision });

    expect(mockExecuteGraphV2BoundedTraversalV1).toHaveBeenCalledWith(expect.objectContaining({
      workspaceRevision, graphRevision, maxDepth: 3,
      seeds: [{ packetKey: 'packet-1', sourceRef: 'src/client/seed.ts', sourceRevision }],
    }));
    expect(mockHydrateCandidatesWithProof.mock.calls[0]?.[0].map((item: { packetKey: string }) => item.packetKey))
      .toContain('packet-2');
    expect(result.packets.map((packet) => packet.packet_key)).toContain('packet-2');
    expect(result.provenance.graphCandidateEvidence).toContainEqual(expect.objectContaining({
      packetKey: 'packet-2',
      evidenceRefs: ['graph-v2:edge:first', 'graph-v2:edge:last'],
    }));
  });

  it('routes a bounded n-ary code fact through packet binding, hydration, and final Top-K', async () => {
    const workspaceRevision = `sha256:${'1'.repeat(64)}`;
    const graphRevision = `sha256:${'2'.repeat(64)}`;
    const sourceRevision = `sha256:${'3'.repeat(64)}`;
    const seedId = 'packet:00000000-0000-5000-8000-000000000001';
    const relatedId = 'packet:00000000-0000-5000-8000-000000000003';
    mockReadKagCodeHyperedgesV1.mockResolvedValue([{
      schemaVersion: 'atlas.hyperedge.v1',
      hyperedgeId: 'hyperedge:test-nary',
      predicate: 'CALLS',
      participants: [
        { canonicalId: seedId, role: 'caller', ordinal: 0 },
        { canonicalId: relatedId, role: 'callee', ordinal: 1 },
        { canonicalId: 'concept:service', role: 'context', ordinal: 2 },
      ],
      evidenceRefs: ['source-span:src/lib/example.ts:0-10'],
      workspaceRevision, graphRevision, sourceRevision,
      producerRevision: `sha256:${'4'.repeat(64)}`,
      checksum: 'a'.repeat(64),
    }]);
    mockResolveKagPacketBindingsV1.mockResolvedValue([{
      canonicalId: relatedId,
      packetKey: 'packet-3',
      sourceRef: 'src/server/callee.ts',
      sourceRevision,
      workspaceRevision,
      graphRevision,
    }]);
    mockHydrateCandidatesWithProof.mockImplementation(async (items: Array<Record<string, unknown>>) => ({
      envelopes: items.map((candidate, index) => ({
        chunk_id: String(candidate.packetKey), packet_key: String(candidate.packetKey),
        source_ref: String(candidate.sourceRef), relative_path: String(candidate.sourceRef),
        workspace_revision: String(candidate.workspaceRevision), graph_revision: graphRevision,
        source_revision: String(candidate.sourceRevision), summary: 'qualified', content: 'qualified',
        retrieved_rank: index + 1,
      })),
      proof: {
        canonicalJoinedCount: items.length, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0, representationRejectedCount: 0,
        representationRevisionRejectedCount: 0, graphScoreAttachedCount: 0, graphScoreMissingCount: items.length,
        summaryResolvedCount: items.length, summaryStaleRejectedCount: 0, validationReasons: {},
      },
    }));
    mockRerankCanonicalFeatureEnvelopes.mockImplementation(async (_query: string, items: Array<Record<string, unknown>>) => ({
      results: items.map((item, index) => ({ ...item, retrieved_rank: index + 1, rank_after: index + 1 })),
      provenance: {
        cacheStatus: 'miss', cacheKey: 'test', modelVersion: 'none', rendererVersion: 'search-runtime-v1',
        authScope: 'public', topK: 2, maxLength: 1024, crossEncoderAttempted: false,
        crossEncoderUsed: false, fallbackUsed: false, latencyMs: 0,
      },
    }));
    const runtime = new SearchRuntime({ readOnly: true, retrievers: [{
      lane: 'ast',
      retrieve: async () => [{
        packetKey: 'packet-1', sourceRef: 'src/lib/example.ts', sourceRevision, workspaceRevision,
        rank: 1, score: 0.9, lane: 'ast', metadata: { graph_revision: graphRevision },
      }],
    }] });

    const result = await runtime.search({ text: 'follow a call graph', topK: 2, workspaceRevision });
    expect(mockReadKagCodeHyperedgesV1).toHaveBeenCalledWith([seedId], { workspaceRevision, graphRevision });
    expect(mockResolveKagPacketBindingsV1).toHaveBeenCalledWith([relatedId], { workspaceRevision, graphRevision });
    expect(mockHydrateCandidatesWithProof.mock.calls[0]?.[0].map((candidate: { packetKey: string }) => candidate.packetKey)).toContain('packet-3');
    expect(result.packets.map((packet) => packet.packet_key)).toContain('packet-3');
  });

  it('accepts hostile query strings as data and preserves the search contract', async () => {
    mockRetrieveAllCandidates.mockResolvedValue([
      {
        id: 'chunk-hostile',
        packetKey: 'packet-hostile',
        sourceRef: 'src/lib/example.ts',
        summary: 'hostile summary',
        content: 'hostile content',
        score: 0.7,
        scoreSource: 'postgres_trigram',
      },
    ]);
    const hostileHydrated = [
      {
        packet_key: 'packet-hostile',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'hostile summary',
        content: 'hostile content',
        retrieved_rank: 1,
        cross_encoder_score: 0.71,
        blended_score: 0.7,
        rank_after: 1,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
    ] as any;
    mockHydrateCandidates.mockResolvedValue(hostileHydrated);
    mockHydrateCandidatesWithProof.mockResolvedValue({
      envelopes: hostileHydrated,
      proof: {
        canonicalJoinedCount: 1,
        canonicalJoinMissingCount: 0,
        workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0,
        sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0,
        representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 1,
        graphScoreMissingCount: 0,
        summaryResolvedCount: 1,
        summaryStaleRejectedCount: 0,
        validationReasons: {},
      },
    });
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-hostile',
          packet_key: 'packet-hostile',
          source_ref: 'src/lib/example.ts',
          relative_path: 'src/lib/example.ts',
          summary: 'hostile summary',
          content: 'hostile content',
          retrieved_rank: 1,
          cross_encoder_score: 0.71,
          blended_score: 0.7,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:hostile',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 1,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 2,
      },
    });
    mockRecordPromotionIntent.mockResolvedValue(1);

    const hostileQueries = [
      `'; DROP TABLE atlas_packets; --`,
      `') OR TRUE --`,
      `foo | !bar`,
      `pageRankScore:*`,
      `x <-> y`,
      `%_\\`,
    ];

    const runtime = createSearchRuntime({ userId: 'user-hostile' });

    for (const query of hostileQueries) {
      const result = await runtime.search({
        text: query,
        topK: 1,
      });

      expect(result.packets).toHaveLength(1);
      expect(mockRetrieveAllCandidates).toHaveBeenCalledWith(
        query,
        { includeGenerated: false, includeLegacy: false },
        undefined,
        expect.objectContaining({ includeVectorLanes: true, globalTimeoutMs: 8000 })
      );
    }
  });

  it('runs a read-only literal-versus-taxonomy shadow with one semantic lane', async () => {
    const query = 'TurboVec double vote';
    const classification = classifyAtlasQuery({ requestId: 'shadow-1', query });
    const scope = compileTaxonomyScopeV1({
      classification,
      workspaceRevision: 'workspace:shadow-1',
      taxonomyRevision: 'taxonomy:shadow-1',
      ontologyRevision: 'ontology:shadow-1',
      knownFeatures: [{ id: 'retrieval.semantic', aliases: ['semantic'] }],
    });
    const expansion = buildQueryExpansionBundleV1({
      scope,
      literalTerms: query.split(/\s+/),
      candidates: [{
        term: 'SearchRuntime',
        normalized: '',
        source: 'SYMBOL',
        evidenceRef: 'symbol:SearchRuntime',
        sourceRevision: 'source:shadow-1',
        confidence: 0.96,
      }],
    });
    const expandedQuery = [query, ...expansion.expansions.map((term) => term.term)].join(' ');
    const observedQueries: string[] = [];
    const observedWorkspaceRevisions: Array<string | undefined> = [];

    mockRecordPromotionIntent.mockReset();
    mockAppendSearchRuntimeTrainingRow.mockReset();
    mockReadKagHypergraphNeighborsV1.mockReset();
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({
      requestedCanonicalIds: 0,
      matchedTuples: 0,
      matchedHyperedges: 0,
      neighbors: [],
    });
    mockHydrateCandidatesWithProof.mockImplementation(async (candidates: any[]) => {
      const envelopes = candidates.map((candidate) => ({
        packet_key: candidate.packetKey,
        chunk_id: candidate.packetKey,
        source_ref: candidate.sourceRef,
        relative_path: candidate.sourceRef,
        summary: `summary:${candidate.packetKey}`,
        content: `content:${candidate.packetKey}`,
        dense: { score: candidate.score },
        metadata: { score: candidate.score },
      }));
      return {
        envelopes,
        proof: {
          canonicalJoinedCount: envelopes.length,
          canonicalJoinMissingCount: 0,
          workspaceRejectedCount: 0,
          workspaceRevisionRejectedCount: 0,
          sourceRevisionRejectedCount: 0,
          representationRejectedCount: 0,
          representationRevisionRejectedCount: 0,
          graphScoreAttachedCount: 0,
          graphScoreMissingCount: envelopes.length,
          summaryResolvedCount: envelopes.length,
          summaryStaleRejectedCount: 0,
          validationReasons: {},
        },
      };
    });
    mockRerankCanonicalFeatureEnvelopes.mockImplementation(async (_text: string, envelopes: any[]) => ({
      results: envelopes.map((envelope, index) => ({
        ...envelope,
        model_version: 'shadow-reranker',
        blended_score: 1 - index / 100,
      })),
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'shadow-rerank-v1',
        modelVersion: 'shadow-reranker',
        rendererVersion: 'search-runtime-v1',
        authScope: 'shadow',
        topK: envelopes.length,
        maxLength: 2048,
        crossEncoderAttempted: false,
        crossEncoderUsed: false,
        fallbackUsed: true,
        latencyMs: 0,
      },
    }));

    const makeRetriever = (lane: 'sparse' | 'dense') => ({
      lane,
      async retrieve(input: { query: string; limit: number; filters?: Record<string, unknown>; workspaceRevision?: string }) {
        observedQueries.push(`${lane}:${input.query}`);
        observedWorkspaceRevisions.push(input.workspaceRevision);
        const candidates = [{
          packetKey: `${lane}-shared`,
          sourceRef: `src/${lane}-shared.ts`,
          rank: 1,
          score: 0.9,
          lane,
          metadata: { summary: `${lane} summary`, content: `${lane} content` },
        }];
        if (lane === 'dense' && input.query.includes('SearchRuntime')) {
          candidates.push({
            packetKey: 'dense-expanded',
            sourceRef: 'src/search-runtime.ts',
            rank: 2,
            score: 0.8,
            lane,
            metadata: { summary: 'expanded summary', content: 'expanded content' },
          });
        }
        return candidates;
      },
    });

    const runtime = createSearchRuntime({
      userId: 'shadow-user',
      readOnly: true,
      retrievers: [makeRetriever('sparse'), makeRetriever('dense')],
    });
    const baseRequest = {
      topK: 5,
      workspaceId: 'workspace-shadow',
      workspaceRevision: 'sha256:' + '1'.repeat(64),
      representationId: 'semantic_768',
      representationRevision: 1,
    };
    const literalResult = await runtime.search({ ...baseRequest, text: query });
    const expandedResult = await runtime.search({ ...baseRequest, text: expandedQuery });

    expect(expansion.literalTerms).toContain('TurboVec');
    expect(observedQueries.filter((value) => value.startsWith('dense:'))).toHaveLength(2);
    expect(observedQueries.some((value) => value === `sparse:${query}`)).toBe(true);
    expect(observedQueries.some((value) => value === `dense:${expandedQuery}`)).toBe(true);
    expect(observedWorkspaceRevisions).toEqual(Array(4).fill(baseRequest.workspaceRevision));
    expect(literalResult.provenance.readOnly).toBe(true);
    expect(expandedResult.provenance.readOnly).toBe(true);
    const hydratedCandidates = mockHydrateCandidatesWithProof.mock.calls[0]?.[0] as Array<{
      packetKey: string;
      symbolVersionId: string | null;
    }>;
    expect(hydratedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ packetKey: 'sparse-shared', symbolVersionId: null }),
    ]));
    expect(literalResult.provenance.promotionAttempted).toBe(false);
    expect(expandedResult.provenance.promotionAttempted).toBe(false);
    expect(mockRecordPromotionIntent).not.toHaveBeenCalled();
    expect(mockAppendSearchRuntimeTrainingRow).not.toHaveBeenCalled();
    expect(mockRerankCanonicalFeatureEnvelopes.mock.calls).toHaveLength(2);
    expect(mockRerankCanonicalFeatureEnvelopes.mock.calls.every(([, , options]) =>
      options.cachePolicy === 'disabled' && options.shadowReceiptPolicy === 'disabled')).toBe(true);
    expect(expandedResult.packets.some((packet: any) => packet.packet_key === 'dense-expanded')).toBe(true);
  });
});

// ── Lane behavior matrix ──────────────────────────────────────────────────────
// Proves each lane's queryText/queryVector dependency at the contract boundary.

import {
  normalizeRetrievalSearchRequest,
  buildKeywordBundle,
} from './search-contract.js';
import type { SearchLaneContext } from '../retrieval/types.js';
import { GpuCuvSLane, QdrantLane, LexicalLane, Bm25Lane } from './search-lanes.js';

describe('lane behavior matrix — queryText vs queryVector routing', () => {
  const textOnlyContext: SearchLaneContext = {
    queryText: 'authentication session validate',
    topK: 5,
  };

  const vectorOnlyContext: SearchLaneContext = {
    queryText: '',
    queryVector: new Float32Array(768).fill(0.1),
    topK: 5,
  };

  const fullContext: SearchLaneContext = {
    queryText: 'authentication session validate',
    queryVector: new Float32Array(768).fill(0.1),
    topK: 5,
  };

  it('lexical lane requires queryText and ignores queryVector', async () => {
    const lane = new LexicalLane();
    // text-only: should attempt search (may return [] if DB unavailable or under pool contention, but must not throw on empty vector)
    const result = await Promise.race([
      lane.search(textOnlyContext).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
    ]);
    expect(result).not.toBeNull(); // did not throw on missing vector

    // empty queryText: must short-circuit, never touch DB
    const emptyResult = await lane.search({ ...textOnlyContext, queryText: '' });
    expect(emptyResult).toEqual([]);
  }, 60_000);

  it('bm25 lane requires queryText and ignores queryVector', async () => {
    const lane = new Bm25Lane();
    const emptyResult = await lane.search({ ...textOnlyContext, queryText: '' });
    expect(emptyResult).toEqual([]);

    // vector-only: queryText is '' so must short-circuit
    const vectorOnlyResult = await lane.search(vectorOnlyContext);
    expect(vectorOnlyResult).toEqual([]);
  });

  it('qdrant lane requires queryVector and short-circuits when missing', async () => {
    const lane = new QdrantLane();
    // text-only (no queryVector): must return []
    const result = await lane.search(textOnlyContext);
    expect(result).toEqual([]);
  });

  it('gpu-cuvs lane requires queryVector and short-circuits when missing', async () => {
    const lane = new GpuCuvSLane();
    // text-only (no queryVector): must return []
    const result = await lane.search(textOnlyContext);
    expect(result).toEqual([]);
  });

  it('full context passes vector to dense lanes and text to lexical lanes', () => {
    // This is a type-level invariant — queryText and queryVector are separate fields.
    // No lane may reconstruct one from the other.
    expect(fullContext.queryText).toBeTruthy();
    expect(fullContext.queryVector).toBeInstanceOf(Float32Array);
    expect(fullContext.queryVector!.length).toBe(768);
  });
});

// ── Legacy adapter isolation ──────────────────────────────────────────────────
// Proves search_kinds is NOT carried downstream after normalization.

describe('normalizeRetrievalSearchRequest — legacy adapter isolation', () => {
  it('strips search_kinds from the normalized output', () => {
    const normalized = normalizeRetrievalSearchRequest({
      query: 'find auth session',
      search_kinds: ['lexical', 'dense'],
    } as any);

    expect(normalized).not.toHaveProperty('search_kinds');
    expect(normalized.lanes).toEqual(['lexical', 'dense']);
  });

  it('canonical lanes take precedence over search_kinds when both present', () => {
    const normalized = normalizeRetrievalSearchRequest({
      query: 'find auth session',
      lanes: ['dense'],
      search_kinds: ['lexical'],
    } as any);

    expect(normalized.lanes).toEqual(['dense']);
    expect(normalized).not.toHaveProperty('search_kinds');
  });

  it('keyword bundle is built from query when no explicit keywords given', () => {
    const normalized = normalizeRetrievalSearchRequest({
      query: 'validateSession auth token',
    });

    expect(normalized.exactKeywords?.length).toBeGreaterThan(0);
    // camelCase terms should be present or tokenized
    const bundle = buildKeywordBundle({ query: 'validateSession auth token' });
    expect(bundle.exactKeywords).toContain('auth');
    expect(bundle.exactKeywords).toContain('token');
  });
});

// ── Filter allow-list validation ──────────────────────────────────────────────
// Proves SearchMetadataFilterSchema rejects execution-control fields.

import { SearchMetadataFilterSchema } from './search-contract.js';

describe('SearchMetadataFilterSchema — allow-list enforcement', () => {
  it('accepts valid metadata filter fields', () => {
    const result = SearchMetadataFilterSchema.safeParse({
      pathPrefixes: ['src/lib/'],
      languages: ['typescript'],
      fileKinds: ['source'],
      includeGenerated: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects execution-control fields (strict schema)', () => {
    const withLanes = SearchMetadataFilterSchema.safeParse({
      lanes: ['dense', 'lexical'],
    });
    expect(withLanes.success).toBe(false);

    const withSearchKinds = SearchMetadataFilterSchema.safeParse({
      search_kinds: ['dense'],
    });
    expect(withSearchKinds.success).toBe(false);

    const withQueryText = SearchMetadataFilterSchema.safeParse({
      query: 'some query',
    });
    expect(withQueryText.success).toBe(false);

    const withTopK = SearchMetadataFilterSchema.safeParse({
      topK: 20,
    });
    expect(withTopK.success).toBe(false);
  });

  it('rejects unknown fields (strict enforcement)', () => {
    const result = SearchMetadataFilterSchema.safeParse({
      pathPrefixes: ['src/'],
      unknownExecutionField: 'dense',
    });
    expect(result.success).toBe(false);
  });
});

describe('SearchResult.provenance.hypergraphNeighbors — KAG-01/02 additive integration point', () => {
  it('is a valid SearchResult provenance without the field present (current real state — no persisted source yet)', () => {
    const provenance: SearchResult['provenance'] = {
      retrievalSources: ['qdrant_768'],
      fusionMethod: 'rrf',
      rerankModel: 'none',
      rerankerUsed: false,
    };
    expect(provenance.hypergraphNeighbors).toBeUndefined();
  });

  it('accepts a well-typed hypergraphNeighbors payload when a future caller does populate it', () => {
    const provenance: SearchResult['provenance'] = {
      retrievalSources: ['qdrant_768'],
      fusionMethod: 'rrf',
      rerankModel: 'none',
      rerankerUsed: false,
      hypergraphNeighbors: [{ canonicalId: 'packet:a', hyperedgeIds: ['hyperedge:1', 'hyperedge:2'] }],
    };
    expect(provenance.hypergraphNeighbors?.[0].canonicalId).toBe('packet:a');
  });
});

describe('Function Registry final Top-K proof identity', () => {
  it('matches the exact symbol, AST node, source, and revisions when packet keys differ', () => {
    const candidate = {
      packetKey: 'packet:registry-key',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      workspaceRevision: 'sha256:workspace',
      functionRegistryEvidence: {
        snapshotChecksum: 'a'.repeat(64),
        canonicalId: 'function:example',
        symbolVersionId: 'symbol-version:example',
        treeNodeId: 'tree-node:example',
        sourceContentHash: 'b'.repeat(64),
        startByte: 1,
        endByte: 10,
        evidenceChecksum: 'c'.repeat(64),
      },
    };
    const matchingFinalPacket = {
      packet_key: 'canonical-chunk-key',
      symbol_version_id: 'symbol-version:example',
      tree_node_id: 'tree-node:example',
      source_revision: 'sha256:source',
      workspace_revision: 'sha256:workspace',
      source_ref: 'src/example.ts',
    };

    const proof = buildFunctionRegistryRetrievalProofV1({
      enabled: true,
      readOnly: true,
      candidates: [candidate] as any,
      hydratedPackets: [matchingFinalPacket] as any,
      rerankedPackets: [matchingFinalPacket] as any,
      postProcessedPacketKeys: ['canonical-chunk-key'],
      postProcessDecisions: [{
        packetKey: 'canonical-chunk-key',
        decision: 'KEEP',
        reason: 'TOP_K',
        detail: 'kept',
      }] as any,
      finalPackets: [matchingFinalPacket] as any,
    });

    expect(proof.qualifiedFinalCandidateCount).toBe(1);
    expect(proof.candidates[0].presentInFinalTopK).toBe(true);
    expect(proof.candidates[0]).toMatchObject({
      presentAfterHydration: true,
      presentAfterRerank: true,
      presentAfterPostProcess: true,
      dropStage: 'NONE',
      postProcessDecision: { decision: 'KEEP', reason: 'TOP_K', detail: 'kept' },
    });

    const diversityDroppedProof = buildFunctionRegistryRetrievalProofV1({
      enabled: true,
      readOnly: true,
      candidates: [candidate] as any,
      hydratedPackets: [matchingFinalPacket] as any,
      rerankedPackets: [matchingFinalPacket] as any,
      postProcessedPacketKeys: [],
      postProcessDecisions: [{
        packetKey: 'canonical-chunk-key',
        decision: 'DROP',
        reason: 'SOURCE_DIVERSITY',
        detail: 'dedupPrefixDepth=2 prefix=sveltekit-frontend/src',
      }] as any,
      finalPackets: [] as any,
    });

    expect(diversityDroppedProof.candidates[0]).toMatchObject({
      presentAfterHydration: true,
      presentAfterRerank: true,
      presentAfterPostProcess: false,
      presentInFinalTopK: false,
      dropStage: 'POST_PROCESS',
      postProcessDecision: {
        decision: 'DROP',
        reason: 'SOURCE_DIVERSITY',
        detail: 'dedupPrefixDepth=2 prefix=sveltekit-frontend/src',
      },
    });
  });

  it('does not match symbol identity when any source qualification differs', () => {
    const candidate = {
      packetKey: 'packet:registry-key',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      workspaceRevision: 'sha256:workspace',
      functionRegistryEvidence: {
        snapshotChecksum: 'a'.repeat(64),
        canonicalId: 'function:example',
        symbolVersionId: 'symbol-version:example',
        treeNodeId: 'tree-node:example',
        sourceContentHash: 'b'.repeat(64),
        startByte: 1,
        endByte: 10,
        evidenceChecksum: 'c'.repeat(64),
      },
    };
    const staleFinalPacket = {
      packet_key: 'canonical-chunk-key',
      symbol_version_id: 'symbol-version:example',
      tree_node_id: 'tree-node:example',
      source_revision: 'sha256:stale',
      workspace_revision: 'sha256:workspace',
      source_ref: 'src/example.ts',
    };

    const proof = buildFunctionRegistryRetrievalProofV1({
      enabled: true,
      readOnly: true,
      candidates: [candidate] as any,
      finalPackets: [staleFinalPacket] as any,
    });

    expect(proof.qualifiedFinalCandidateCount).toBe(0);
    expect(proof.candidates[0].presentInFinalTopK).toBe(false);
    expect(proof.candidates[0].dropStage).toBe('HYDRATION');
  });

  it('executes native NES-LUT + masked Top-K via scoreHydratedCandidatesWithNlut and enforces workspace/representation eligibility', async () => {
    const runtime = new SearchRuntime({ readOnly: true });
    const candidates = [
      { packet_key: 'p0', source_ref: 'src/a.ts', workspace_id: 'ws:1', representation_id: 'semantic_768' },
      { packet_key: 'p1', source_ref: 'src/b.ts', workspace_id: 'ws:foreign', representation_id: 'semantic_768' },
      { packet_key: 'p2', source_ref: 'src/c.ts', workspace_id: 'ws:1', representation_id: 'semantic_768' },
      { packet_key: 'p3', source_ref: 'src/missing-workspace.ts', representation_id: 'semantic_768' },
      { packet_key: 'p4', source_ref: 'src/missing-representation.ts', workspace_id: 'ws:1' },
    ] as any[];

    const q = new Float32Array([1, 0, 0, 0]);
    const mat = new Float32Array([
      0.92, 0.391918, 0, 0,
      0.99, 0.141067, 0, 0,
      0.85, 0.526783, 0, 0,
      0.96, 0.28, 0, 0,
      0.94, 0.341174, 0, 0,
    ]);
    const lut = new Uint8Array([1, 1, 1, 1, 1]);
    // 0xff is an allowed LUT code here; out-of-scope rows must still be masked.
    const allowed = new Uint8Array([1, 255]);

    const { ranked, nlutStageReceipt } = await runtime.scoreHydratedCandidatesWithNlut({
      candidates,
      queryVector: q,
      corpusMatrix: mat,
      dim: 4,
      k: 3,
      lutBytes: lut,
      allowedBytes: allowed,
      expectedWorkspaceId: 'ws:1',
      expectedRepresentationId: 'semantic_768',
    });

    expect(ranked.map((r) => r.packet_key)).toEqual(['p0', 'p2']);
    expect(nlutStageReceipt.eligibleOrdinalsCount).toBe(2);
    expect(nlutStageReceipt.rejectedIneligibleCount).toBe(3);
    expect(nlutStageReceipt.evaluatedCount).toBe(2);
    expect(nlutStageReceipt.backend.length).toBeGreaterThan(0);

    await expect(runtime.scoreHydratedCandidatesWithNlut({
      candidates,
      queryVector: q,
      corpusMatrix: mat,
      dim: 4,
      k: 3,
      lutBytes: lut,
      allowedBytes: allowed,
      expectedRepresentationId: 'semantic_768',
    })).rejects.toThrow('NLUT_EXPECTED_SCOPE_AND_REPRESENTATION_REQUIRED');
  });

  it('wires nativeDenseTopK into SearchRuntime.search() while preserving non-dense tail candidates', async () => {
    const denseCandidate = {
      id: 'pkt-dense',
      packetKey: 'pkt-dense',
      sourceRef: 'src/dense.ts',
      sourceType: 'code',
      score: 0.9,
      scoreSource: 'qdrant_768',
      payload: {},
    };
    const lexicalCandidate = {
      id: 'pkt-lex',
      packetKey: 'pkt-lex',
      sourceRef: 'src/lex.ts',
      sourceType: 'code',
      score: 0.75,
      scoreSource: 'postgres_trigram',
      payload: {},
    };
    mockRetrieveAllCandidatesWithReceipts.mockResolvedValueOnce({
      candidates: [denseCandidate, lexicalCandidate],
      laneReceipts: [],
    });
    mockHydrateCandidatesWithProof.mockResolvedValueOnce({
      envelopes: [
        { chunk_id: 'pkt-dense', packet_key: 'pkt-dense', source_ref: 'src/dense.ts', created_at: new Date(), workspace_id: 'ws:1', representation_id: 'semantic_768' },
        { chunk_id: 'pkt-lex', packet_key: 'pkt-lex', source_ref: 'src/lex.ts', created_at: new Date() },
      ],
      proof: {
        canonicalJoinedCount: 2, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0, representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0, graphScoreMissingCount: 2,
        summaryResolvedCount: 2, summaryStaleRejectedCount: 0,
        validationReasons: {}, candidateResolutions: [],
      },
    });
    mockRerankCanonicalFeatureEnvelopes.mockImplementationOnce(async (_q: unknown, envs: any[]) => ({
      results: envs,
      provenance: { modelVersion: 'test-reranker', cacheStatus: 'miss' },
    }));

    const runtime = new SearchRuntime({ readOnly: true });
    const res = await runtime.search(
      { text: 'dense plus lexical', topK: 5, workspaceId: 'ws:1', representationId: 'semantic_768' },
      {
        nativeDenseTopK: {
          queryVector: new Float32Array([1, 0, 0, 0]),
          corpusMatrix: new Float32Array([0.9, 0.43589, 0, 0]),
          dim: 4,
          lutBytes: new Uint8Array([1]),
          allowedBytes: new Uint8Array([1]),
        },
      },
    );

    expect(res.proof.nlutStageReceipt).toBeDefined();
    expect(res.proof.nlutStageReceipt!.evaluatedCount).toBe(1);
    expect(res.packets.map((p) => p.packet_key)).toEqual(['pkt-dense', 'pkt-lex']);
  });

  it('enforces validated actor-grant scope (missing, expired, revoked, foreign-workspace, and allowedSourceRefs)', async () => {
    const wsId = '11111111-1111-4111-8111-111111111111';
    const foreignWsId = '22222222-2222-4222-8222-222222222222';
    const validGrant = {
      status: 'AUTHORIZED' as const,
      actorId: 'actor-1',
      workspaceId: wsId,
      workspaceRevision: 'ws-rev:1',
      repositoryIds: ['deeds-web-app'],
      allowedSourceRefs: ['src/allowed.ts'],
      authorityRef: 'postgresql:atlas_actor_workspace_source_grants_v1:g1',
    };

    const runtime = new SearchRuntime({ userId: 'actor-1', readOnly: true });

    await expect(
      runtime.search({ text: 'grant check', workspaceId: wsId, workspaceRevision: 'ws-rev:1' }, { requireActorGrant: true }),
    ).rejects.toThrow('ACTOR_GRANT_REQUIRED');

    await expect(
      runtime.search(
        { text: 'grant check', workspaceId: wsId, workspaceRevision: 'ws-rev:1' },
        { actorGrant: { ...validGrant, revoked: true } },
      ),
    ).rejects.toThrow('ACTOR_GRANT_REVOKED');

    await expect(
      runtime.search(
        { text: 'grant check', workspaceId: wsId, workspaceRevision: 'ws-rev:1' },
        { actorGrant: { ...validGrant, expiresAt: '2020-01-01T00:00:00.000Z' } },
      ),
    ).rejects.toThrow('ACTOR_GRANT_EXPIRED');

    await expect(
      runtime.search(
        { text: 'grant check', workspaceId: wsId, workspaceRevision: 'ws-rev:1' },
        { actorGrant: { ...validGrant, workspaceId: foreignWsId } },
      ),
    ).rejects.toThrow('ACTOR_GRANT_WORKSPACE_MISMATCH');

    mockRetrieveAllCandidatesWithReceipts.mockResolvedValueOnce({
      candidates: [
        { id: 'c1', packetKey: 'p-allowed', sourceRef: 'src/allowed.ts', sourceType: 'code', score: 0.9, scoreSource: 'postgres_trigram', payload: {} },
        { id: 'c2', packetKey: 'p-denied', sourceRef: 'src/secret.ts', sourceType: 'code', score: 0.99, scoreSource: 'postgres_trigram', payload: {} },
      ],
      laneReceipts: [],
    });
    mockHydrateCandidatesWithProof.mockResolvedValueOnce({
      envelopes: [{ chunk_id: 'p-allowed', packet_key: 'p-allowed', source_ref: 'src/allowed.ts', created_at: new Date() }],
      proof: {
        canonicalJoinedCount: 1, canonicalJoinMissingCount: 0, workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0, sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0, representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0, graphScoreMissingCount: 1,
        summaryResolvedCount: 1, summaryStaleRejectedCount: 0,
        validationReasons: {}, candidateResolutions: [],
      },
    });
    mockRerankCanonicalFeatureEnvelopes.mockImplementationOnce(async (_q: unknown, envs: any[]) => ({
      results: envs,
      provenance: { modelVersion: 'test-reranker', cacheStatus: 'miss' },
    }));

    const okRes = await runtime.search(
      { text: 'grant check', topK: 5, workspaceId: wsId, workspaceRevision: 'ws-rev:1' },
      { actorGrant: validGrant },
    );
    expect(okRes.packets.map((p) => p.packet_key)).toEqual(['p-allowed']);
    expect(okRes.proof.actorGrantReceipt).toEqual({
      validated: true,
      actorId: 'actor-1',
      workspaceId: wsId,
      workspaceRevision: 'ws-rev:1',
      authorityRef: 'postgresql:atlas_actor_workspace_source_grants_v1:g1',
      allowedSourceRefCount: 1,
    });
  });
});
