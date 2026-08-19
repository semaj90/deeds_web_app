import { describe, expect, it } from 'vitest';
import type { RepairSemanticTournamentReceiptV1 } from '../retrieval/repair-semantic-corpus.js';
import {
  RepairEvidenceCandidateV1Schema,
  type RepairEvidenceCandidateV1,
} from './agentic-repair-evidence-gate.js';
import {
  applySemanticPromotionReceipt,
  buildSemanticPromotionReceipt,
} from './semantic-promotion-feedback.js';

function candidate(overrides: Partial<RepairEvidenceCandidateV1> = {}): RepairEvidenceCandidateV1 {
  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: 'packet:p1',
    packetKey: 'p1',
    sourceRef: 'src/lib/a.ts',
    sourceRevision: 'git:abc123',
    ordinal: 0,
    tokenCount: 100,
    semanticScore: 0.2,
    lexicalScore: 0.1,
    graphAuthority: 0.3,
    centroidAffinity: 0.4,
    cacheHotness: 0.2,
    demandUtility: 0.2,
    executionUtility: 0.2,
    recency: 0.5,
    normalizedCost: 0.1,
    hopDistance: 1,
    pathCost: 1,
    communityId: 'c1',
    communityOverlap: 0.2,
    pprAffinity: 0.2,
    exactEvidence: false,
    contentRef: 'source:src/lib/a.ts',
    lanes: ['semantic'],
    executors: ['qdrant'],
    evidenceRefs: ['qdrant:p1'],
    ...overrides,
  });
}

function tournament(): RepairSemanticTournamentReceiptV1 {
  return {
    schema: 'atlas.repair-semantic-tournament-receipt.v1',
    requestId: 'repair-1',
    status: 'EXECUTED',
    reason: 'POSTGRES_CORPUS_CAGRA_EXACT_PROMOTION',
    queryVectorValidated: true,
    corpus: {
      schema: 'atlas.repair-semantic-corpus-receipt.v1',
      requestId: 'repair-1',
      logicalLane: 'semantic',
      representationId: 'semantic_768',
      representationRevision: 'semantic_768:r2:embeddinggemma:latest',
      requestedCandidates: 2,
      boundedCandidates: 2,
      corpusRows: 2,
      exclusions: [],
      revisionResolutions: [],
      corpus: [],
      invariants: {
        boundedToLocalizedCandidates: true,
        postgresOwnsSourceRevision: true,
        mirrorOwnsVectorBytesOnly: true,
        mirrorRevisionMayOverrideCanonical: false,
        oneSemanticLaneVote: true,
        exactPromotionRequired: true,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'test',
    },
    challenger: {
      schema: 'atlas.cuvs-semantic-challenger-receipt.v1',
      requestId: 'repair-1',
      logicalLane: 'semantic',
      representationId: 'semantic_768',
      representationRevision: 'semantic_768:r2:embeddinggemma:latest',
      dimension: 768,
      corpusRows: 2,
      requestedTopK: 2,
      cagraShortlistK: 2,
      promoted: [
        {
          rank: 1,
          packetKey: 'p1',
          sourceRevision: 'git:abc123',
          exactDistance: 0.125,
          cagraRank: 2,
          cagraDistance: 0.15,
        },
        {
          rank: 2,
          packetKey: 'p2',
          sourceRevision: 'git:def456',
          exactDistance: 0.5,
          cagraRank: 1,
          cagraDistance: 0.45,
        },
      ],
      cagra: {
        backend: 'cuvs.cagra',
        durationMs: 1,
        truncated: false,
        resultCount: 2,
      },
      exactPromotion: {
        backend: 'cuvs.brute_force',
        durationMs: 1,
        shortlistRows: 2,
        resultCount: 2,
      },
      oracle: {
        ran: false,
        reason: 'FULL_ORACLE_DISABLED',
        recallAtK: null,
        durationMs: null,
        resultCount: 0,
      },
      invariants: {
        laneVoteCount: 1,
        cagraIndependentLaneVote: false,
        exactIndependentLaneVote: false,
        exactPromotionRequired: true,
        canonicalIdentityRequired: true,
        approximateResultsMayBypassPromotion: false,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'test',
    },
    promotedPacketKeys: ['p1', 'p2'],
    invariants: {
      localizerRunsBeforeSemanticTournament: true,
      cagraIsExecutorNotLane: true,
      exactIsExecutorNotLane: true,
      oneSemanticLaneVote: true,
      approximateMayBypassExactPromotion: false,
      canonicalWritesAllowed: false,
    },
    producerRevision: 'test',
  };
}

describe('semantic promotion feedback', () => {
  it('uses bounded exact rank as a heuristic score floor without converting distance into similarity', () => {
    const receipt = buildSemanticPromotionReceipt({
      requestId: 'repair-1',
      candidates: [candidate(), candidate({
        candidateId: 'packet:p2',
        packetKey: 'p2',
        sourceRef: 'src/lib/b.ts',
        sourceRevision: 'git:def456',
        semanticScore: 0.8,
      })],
      tournament: tournament(),
      producerRevision: 'test',
    });

    expect(receipt.status).toBe('APPLIED');
    expect(receipt.distanceConvertedToSimilarity).toBe(false);
    expect(receipt.exactDistanceUsedAsObservedEvidenceOnly).toBe(true);
    expect(receipt.deltas[0].rawExactDistance).toBe(0.125);
    expect(receipt.deltas[0].rankPercentileScore).toBe(1);
    expect(receipt.deltas[0].semanticScoreAfter).toBe(1);
    expect(receipt.deltas[1].rankPercentileScore).toBe(0.5);
    expect(receipt.deltas[1].semanticScoreAfter).toBe(0.8);
  });

  it('does not manufacture source-exact evidence or an additional semantic lane vote', () => {
    const before = [candidate()];
    const receipt = buildSemanticPromotionReceipt({
      requestId: 'repair-1',
      candidates: before,
      tournament: tournament(),
      producerRevision: 'test',
    });
    const after = applySemanticPromotionReceipt(before, receipt);

    expect(after[0].semanticScore).toBe(1);
    expect(after[0].exactEvidence).toBe(false);
    expect(after[0].lanes.filter((lane) => lane === 'semantic')).toHaveLength(1);
    expect(after[0].executors).toContain('cuvs.brute_force:exact-promotion');
    expect(receipt.invariants.oneSemanticLaneVote).toBe(true);
    expect(receipt.invariants.exactPromotionDoesNotCreateSourceEvidence).toBe(true);
    expect(receipt.invariants.exactPromotionDoesNotAuthorizeMutation).toBe(true);
  });

  it('fails closed when exact promotion revision does not match the localized candidate revision', () => {
    const receipt = buildSemanticPromotionReceipt({
      requestId: 'repair-1',
      candidates: [candidate({ sourceRevision: 'git:other' })],
      tournament: tournament(),
      producerRevision: 'test',
    });

    expect(receipt.deltas).toHaveLength(0);
    expect(receipt.status).toBe('SKIPPED');
    expect(receipt.exclusions.some((row) => row.reason === 'SOURCE_REVISION_MISMATCH')).toBe(true);
  });
});
