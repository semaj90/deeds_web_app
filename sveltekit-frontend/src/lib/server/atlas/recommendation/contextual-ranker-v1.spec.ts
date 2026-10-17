import { describe, expect, it } from 'vitest';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import {
  rankContextualCandidatesV1,
  type ContextualScoredCandidateV1,
} from './contextual-ranker-v1.js';

describe('Contextual AI Recommendation Engine (REC-01, REC-02)', () => {
  const makeRow = (id: string, ordinal: number, semantic: number, graph: number, validRev = true): CandidateFeatureRowV1 => ({
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: ordinal,
    canonicalId: `pkt_${id.padStart(32, '0')}`,
    packetKey: `packet_${id}`,
    sourceRef: `src/${id}.ts`,
    treeNodeId: null,
    symbolVersionId: `sym_${id}`,
    workspaceRevision: 'ws_rev_01',
    sourceRevision: validRev ? ('sha256:' + id.repeat(64).slice(0, 64)) : 'invalid_rev',
    graphRevision: 'graph_01',
    semanticRevision: 'semantic_768_v1',
    featureRevision: 'feat_01',
    representationBindings: [],
    semanticRelevance: semantic,
    lexicalRelevance: null,
    astAffinity: null,
    graphAuthority: graph,
    personalizedPageRank: graph,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: 0.8,
    memoryUtility: 0.7,
    laneMask: ['semantic'],
    degradedIdentity: false,
    evidenceRefs: [`evidence:${id}`],
  });

  const candidates: ContextualScoredCandidateV1[] = [
    {
      candidate: makeRow('1', 0, 0.9, 0.8),
      kind: 'helper',
      action: 'use_ast_edge_lookup',
      rationale: 'High semantic similarity and structural graph centrality',
      lowRankScore: 0.85,
    },
    {
      candidate: makeRow('2', 1, 0.7, 0.9),
      kind: 'tool',
      action: 'use_context_manifest_builder',
      rationale: 'High personalized PageRank score across dependency graph',
      lowRankScore: 0.75,
    },
    {
      candidate: makeRow('3', 2, 0.85, 0.6),
      kind: 'module',
      action: 'use_cuvs_topk_helper',
      rationale: 'Strong ANN neighborhood density',
      lowRankScore: 0.90,
    },
    {
      candidate: makeRow('4', 3, 0.4, 0.3),
      kind: 'next_step',
      action: 'inspect_source_span',
      rationale: 'Low relevance fallback',
      lowRankScore: 0.30,
    },
  ];

  it('ranks candidates using the hybrid contextual scoring equation and bounds output to 4', () => {
    const batch = rankContextualCandidatesV1({
      requestId: 'req_001',
      queryIntent: 'legal_clause_retrieval',
      candidates,
      contextManifestChecksum: 'a'.repeat(64),
    });

    expect(batch.schema).toBe('atlas.recommendation.batch.v1');
    expect(batch.proposals.length).toBeLessThanOrEqual(4);
    expect(batch.proposals.length).toBeGreaterThan(0);
    expect(batch.canonicalAuthority).toBe(false);
    expect(batch.writesPerformed).toBe(false);

    // Verify ordering is descending by final score
    for (let i = 0; i < batch.proposals.length - 1; i++) {
      expect(batch.proposals[i].scores.final).toBeGreaterThanOrEqual(batch.proposals[i + 1].scores.final);
    }

    // Verify top proposal details
    const top = batch.proposals[0];
    expect(top.qualification).toBe('ADVISORY');
    expect(top.proposalChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(top.candidate.sourceRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fails closed on invalid or stale source revisions', () => {
    const invalidCandidate: ContextualScoredCandidateV1 = {
      candidate: makeRow('9', 9, 0.95, 0.95, false), // invalid sourceRevision
      kind: 'helper',
      action: 'dangerous_action',
      rationale: 'Should be rejected',
    };

    const batch = rankContextualCandidatesV1({
      requestId: 'req_002',
      queryIntent: 'invalid_lineage_test',
      candidates: [invalidCandidate],
      contextManifestChecksum: 'b'.repeat(64),
    });

    expect(batch.proposals).toHaveLength(0);
    expect(batch.abstentionReason).toBe('NO_QUALIFIED_CANDIDATES');
  });

  it('fails closed on degraded identity candidates', () => {
    const degradedRow = {
      ...makeRow('8', 8, 0.99, 0.99),
      degradedIdentity: true,
    };
    const degradedCandidate: ContextualScoredCandidateV1 = {
      candidate: degradedRow,
      kind: 'helper',
      action: 'degraded_action',
      rationale: 'Should be rejected due to degraded identity',
    };

    const batch = rankContextualCandidatesV1({
      requestId: 'req_003',
      queryIntent: 'degraded_test',
      candidates: [degradedCandidate],
      contextManifestChecksum: 'c'.repeat(64),
    });

    expect(batch.proposals).toHaveLength(0);
    expect(batch.abstentionReason).toBe('NO_QUALIFIED_CANDIDATES');
  });

  it('enforces deterministic tie-breaking by canonicalId when scores are identical', () => {
    const rowA = makeRow('a', 0, 0.8, 0.8);
    const rowB = makeRow('b', 1, 0.8, 0.8);

    const tiedCandidates: ContextualScoredCandidateV1[] = [
      { candidate: rowB, kind: 'helper', action: 'action_b', rationale: 'b' },
      { candidate: rowA, kind: 'helper', action: 'action_a', rationale: 'a' },
    ];

    const batch = rankContextualCandidatesV1({
      requestId: 'req_004',
      queryIntent: 'tie_break_test',
      candidates: tiedCandidates,
      contextManifestChecksum: 'd'.repeat(64),
    });

    expect(batch.proposals).toHaveLength(2);
    // canonicalId of rowA ('pkt_0000...a') is lexicographically before rowB ('pkt_0000...b')
    expect(batch.proposals[0].candidate.canonicalId).toBe(rowA.canonicalId);
    expect(batch.proposals[1].candidate.canonicalId).toBe(rowB.canonicalId);
  });
});
