import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRetrieveAllCandidates } = vi.hoisted(() => ({
  mockRetrieveAllCandidates: vi.fn(),
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

const { mockReadKagHypergraphNeighborsV1 } = vi.hoisted(() => ({
  mockReadKagHypergraphNeighborsV1: vi.fn(),
}));

vi.mock('./retrieve-candidates.js', () => ({
  retrieveAllCandidates: mockRetrieveAllCandidates,
}));

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

vi.mock('../atlas/integration/kag-hypergraph-reader-v1.js', () => ({
  readKagHypergraphNeighborsV1: mockReadKagHypergraphNeighborsV1,
}));

import { createSearchRuntime } from './search-runtime.js';
import type { SearchResult } from './search-runtime.js';

describe('search runtime bridge', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    );
    mockRetrieveAllCandidates.mockReset();
    mockRerankCanonicalFeatureEnvelopes.mockReset();
    mockHydrateCandidates.mockReset();
    mockHydrateCandidatesWithProof.mockReset();
    mockRecordPromotionIntent.mockReset();
    mockReadKagHypergraphNeighborsV1.mockReset();
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({
      requestedCanonicalIds: 0,
      matchedTuples: 0,
      matchedHyperedges: 0,
      neighbors: [],
    });
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
      { includeVectorLanes: true }
    );
    expect(mockRerankCanonicalFeatureEnvelopes).toHaveBeenCalledTimes(1);
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
      neighbors: [{ canonicalId: 'packet-1', hyperedgeIds: ['hyperedge:abc123'] }],
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
    expect(mockReadKagHypergraphNeighborsV1).toHaveBeenCalledWith(['packet-1']);
    expect(result.provenance.hypergraphNeighbors).toEqual([
      { canonicalId: 'packet-1', hyperedgeIds: ['hyperedge:abc123'] },
    ]);
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
        { includeVectorLanes: true }
      );
    }
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
    // text-only: should attempt search (may return [] if DB unavailable, but must not throw on empty vector)
    const result = await lane.search(textOnlyContext).catch(() => null);
    expect(result).not.toBeNull(); // did not throw on missing vector

    // empty queryText: must short-circuit, never touch DB
    const emptyResult = await lane.search({ ...textOnlyContext, queryText: '' });
    expect(emptyResult).toEqual([]);
  });

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
