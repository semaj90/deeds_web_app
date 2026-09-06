import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHydrateCandidatesWithProof, mockRerankCanonicalFeatureEnvelopes, mockRecordPromotionIntent, mockAppendSearchRuntimeTrainingRow, mockReadKagHypergraphNeighborsV1 } = vi.hoisted(() => ({
  mockHydrateCandidatesWithProof: vi.fn(),
  mockRerankCanonicalFeatureEnvelopes: vi.fn(),
  mockRecordPromotionIntent: vi.fn(),
  mockAppendSearchRuntimeTrainingRow: vi.fn(),
  mockReadKagHypergraphNeighborsV1: vi.fn(),
}));

vi.mock('../../retrieval/hydrate-candidates.js', () => ({ hydrateCandidatesWithProof: mockHydrateCandidatesWithProof }));
vi.mock('../../retrieval/canonical-rerank-executor.js', () => ({ rerankCanonicalFeatureEnvelopes: mockRerankCanonicalFeatureEnvelopes }));
vi.mock('../../retrieval/promote-results-outbox.js', () => ({ recordPromotionIntent: mockRecordPromotionIntent }));
vi.mock('../policy/policy-training.js', () => ({ appendSearchRuntimeTrainingRow: mockAppendSearchRuntimeTrainingRow }));
vi.mock('../integration/kag-hypergraph-reader-v1.js', () => ({ readKagHypergraphNeighborsV1: mockReadKagHypergraphNeighborsV1 }));

import { createSearchRuntime } from '../../retrieval/search-runtime.js';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildQueryExpansionBundleV1 } from './query-expansion-v1.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';

describe('taxonomy expansion SearchRuntime shadow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
    mockHydrateCandidatesWithProof.mockReset();
    mockRerankCanonicalFeatureEnvelopes.mockReset();
    mockRecordPromotionIntent.mockReset();
    mockAppendSearchRuntimeTrainingRow.mockReset();
    mockReadKagHypergraphNeighborsV1.mockReset();
    mockReadKagHypergraphNeighborsV1.mockResolvedValue({ requestedCanonicalIds: 0, matchedTuples: 0, matchedHyperedges: 0, neighbors: [] });
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
    mockRerankCanonicalFeatureEnvelopes.mockImplementation(async (_query: string, envelopes: any[]) => ({
      results: envelopes.map((envelope, index) => ({ ...envelope, model_version: 'shadow-reranker', blended_score: 1 - index / 100 })),
      provenance: {
        cacheStatus: 'miss', cacheKey: 'shadow-rerank-v1', modelVersion: 'shadow-reranker',
        rendererVersion: 'search-runtime-v1', authScope: 'shadow', topK: envelopes.length,
        maxLength: 2048, crossEncoderAttempted: false, crossEncoderUsed: false,
        fallbackUsed: true, latencyMs: 0,
      },
    }));
  });

  it('preserves literals, compares the expanded query, and performs no writes', async () => {
    const query = 'TurboVec double vote';
    const classification = classifyAtlasQuery({ requestId: 'shadow-1', query });
    const scope = compileTaxonomyScopeV1({
      classification,
      workspaceRevision: 'workspace:shadow-1',
      taxonomyRevision: 'taxonomy:shadow-1',
      ontologyRevision: 'ontology:shadow-1',
    });
    const expansion = buildQueryExpansionBundleV1({
      scope,
      literalTerms: query.split(/\s+/),
      candidates: [{
        term: 'SearchRuntime', normalized: '', source: 'SYMBOL',
        evidenceRef: 'symbol:SearchRuntime', sourceRevision: 'source:shadow-1', confidence: 0.96,
      }],
    });
    const expandedQuery = [query, ...expansion.expansions.map((term) => term.term)].join(' ');
    const observedQueries: string[] = [];
    const makeRetriever = (lane: 'sparse' | 'dense') => ({
      lane,
      async retrieve(input: { query: string; limit: number; filters?: Record<string, unknown> }) {
        observedQueries.push(`${lane}:${input.query}`);
        const candidates = [{ packetKey: `${lane}-shared`, sourceRef: `src/${lane}-shared.ts`, rank: 1, score: 0.9, lane, metadata: {} }];
        if (lane === 'dense' && input.query.includes('SearchRuntime')) {
          candidates.push({ packetKey: 'dense-expanded', sourceRef: 'src/search-runtime.ts', rank: 2, score: 0.8, lane, metadata: {} });
        }
        return candidates;
      },
    });
    const runtime = createSearchRuntime({
      userId: 'shadow-user', readOnly: true,
      retrievers: [makeRetriever('sparse'), makeRetriever('dense')],
    });
    const request = {
      topK: 5, workspaceId: 'workspace-shadow', workspaceRevision: `sha256:${'1'.repeat(64)}`,
      representationId: 'semantic_768', representationRevision: 1,
    };
    const literalResult = await runtime.search({ ...request, text: query });
    const expandedResult = await runtime.search({ ...request, text: expandedQuery });

    expect(expansion.literalTerms).toContain('TurboVec');
    expect(observedQueries).toContain(`sparse:${query}`);
    expect(observedQueries).toContain(`dense:${expandedQuery}`);
    expect(observedQueries.filter((value) => value.startsWith('dense:'))).toHaveLength(2);
    expect(literalResult.provenance.readOnly).toBe(true);
    expect(expandedResult.provenance.readOnly).toBe(true);
    expect(literalResult.provenance.promotionAttempted).toBe(false);
    expect(expandedResult.provenance.promotionAttempted).toBe(false);
    expect(expandedResult.packets.some((packet: any) => packet.packet_key === 'dense-expanded')).toBe(true);
    expect(mockRecordPromotionIntent).not.toHaveBeenCalled();
    expect(mockAppendSearchRuntimeTrainingRow).not.toHaveBeenCalled();
  });
});
