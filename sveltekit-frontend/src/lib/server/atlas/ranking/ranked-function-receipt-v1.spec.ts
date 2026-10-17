import { describe, expect, it } from 'vitest';
import {
  type RawCandidateFunctionInputV1,
  rankFunctionsWithFm4V1,
} from './ranked-function-receipt-v1.js';
import {
  type FmRank4ModelArtifactV1,
  FUNCTION_RANKING_FEATURES_12,
} from './fm-ranker-v1.js';
import {
  AST_DEFINED,
  SOURCE_PROVEN,
  SEMANTIC_HIT,
} from '../contracts/symbol-evidence-v1.js';

describe('FM-09: 8095 -> SearchRuntime -> Ranked Function Receipt', () => {
  const dummySha = 'sha256:' + 'e'.repeat(64);
  const workspaceRevision = 'sha256:' + 'c'.repeat(64);

  const mockModel: FmRank4ModelArtifactV1 = {
    schema: 'atlas.fm-rank4-model.v1',
    modelId: 'fm_rank4_prod_v1',
    modelRevision: dummySha,
    numFeatures: 12,
    rank: 4,
    totalParameters: 61,
    w0: 0.1,
    w: [0.5, 0.2, 0.4, 0.3, 0.25, 0.15, 0.35, 0.45, 0.1, 0.3, 0.3, 0.2],
    V: new Array(12).fill(0).map(() => [0.05, 0.05, 0.05, 0.05]),
    featureNames: [...FUNCTION_RANKING_FEATURES_12],
    metrics: { ndcgAt5: 0.95, mrr: 1.0, trainLoss: 0.02 },
    trainingProvenance: {
      datasetDigest: 'dataset_001',
      trainingRowsCount: 100,
      trainedAt: '2026-10-17T00:00:00.000Z',
      optimizer: 'sgd_rendle_l2',
      epochs: 50,
    },
  };

  const fullyEligibleMask = AST_DEFINED | SOURCE_PROVEN | SEMANTIC_HIT;

  it('filters ineligible candidates before ranking, scores eligible ones, and outputs a deterministic receipt', () => {
    const candidates: RawCandidateFunctionInputV1[] = [
      {
        candidateOrdinal: 0,
        packetKey: 'pkt_001',
        canonicalId: 'symbol:sym_validate_deed',
        symbolName: 'validateDeed',
        sourceRef: 'src/lib/server/deeds/validator.ts',
        sourceRevision: dummySha,
        features: [0.95, 0.8, 1.0, 0.9, 0.85, 0.7, 0.9, 1.0, 0.8, 1.0, 1.0, 0.95],
        eligibilityMask: fullyEligibleMask,
        featureLabels: ['AST_FUNCTION_DEFINED', 'UNIT_TEST_PASS', 'TYPECHECK_PASS'],
      },
      {
        candidateOrdinal: 1,
        packetKey: 'pkt_002',
        canonicalId: 'symbol:sym_unproven_stub',
        symbolName: 'unprovenStub',
        sourceRef: 'src/lib/server/deeds/unproven.ts',
        sourceRevision: dummySha,
        features: [0.99, 0.9, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 0.99],
        eligibilityMask: AST_DEFINED, // MISSING SOURCE_PROVEN! Must be rejected
        featureLabels: ['AST_FUNCTION_DEFINED'],
      },
      {
        candidateOrdinal: 2,
        packetKey: 'pkt_003',
        canonicalId: 'symbol:sym_parse_deed_xml',
        symbolName: 'parseDeedXml',
        sourceRef: 'src/lib/server/deeds/xml-parser.ts',
        sourceRevision: dummySha,
        features: [0.75, 0.7, 0.0, 0.85, 0.6, 0.5, 0.7, 0.8, 0.6, 1.0, 1.0, 0.7],
        eligibilityMask: fullyEligibleMask,
        featureLabels: ['AST_FUNCTION_DEFINED', 'TYPECHECK_PASS'],
      },
    ];

    const receipt = rankFunctionsWithFm4V1({
      queryText: 'validate legal deed packet',
      workspaceRevision,
      graphRevision: null,
      model: mockModel,
      candidates,
      topK: 5,
    });

    expect(receipt.schema).toBe('atlas.ranked-function-receipt.v1');
    expect(receipt.totalCandidatesConsidered).toBe(3);
    expect(receipt.eligibleCandidatesCount).toBe(2); // Only pkt_001 and pkt_003 admitted!

    // Ineligible candidate was excluded
    const candidateIds = receipt.rankedCandidates.map((c) => c.canonicalId);
    expect(candidateIds).toContain('symbol:sym_validate_deed');
    expect(candidateIds).toContain('symbol:sym_parse_deed_xml');
    expect(candidateIds).not.toContain('symbol:sym_unproven_stub');

    // Rank 1 is validateDeed with highest FM score
    expect(receipt.rankedCandidates[0].rank).toBe(1);
    expect(receipt.rankedCandidates[0].symbolName).toBe('validateDeed');
    expect(receipt.rankedCandidates[0].score).toBeGreaterThan(receipt.rankedCandidates[1].score);

    // Architectural safety invariants
    expect(receipt.singleVoteInvariantEnforced).toBe(true);
    expect(receipt.authorityCreated).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);

    // Checksum integrity
    expect(receipt.receiptChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.modelRevision).toBe(mockModel.modelRevision);
  });

  it('preserves stable tie-break ordering by candidateOrdinal ascending when scores are identical', () => {
    const identicalFeatures = [0.5, 0.5, 0.0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const candidates: RawCandidateFunctionInputV1[] = [
      {
        candidateOrdinal: 42,
        packetKey: 'pkt_042',
        canonicalId: 'symbol:sym_b',
        symbolName: 'funcB',
        sourceRef: 'src/b.ts',
        sourceRevision: dummySha,
        features: identicalFeatures,
        eligibilityMask: fullyEligibleMask,
      },
      {
        candidateOrdinal: 10,
        packetKey: 'pkt_010',
        canonicalId: 'symbol:sym_a',
        symbolName: 'funcA',
        sourceRef: 'src/a.ts',
        sourceRevision: dummySha,
        features: identicalFeatures,
        eligibilityMask: fullyEligibleMask,
      },
    ];

    const receipt = rankFunctionsWithFm4V1({
      queryText: 'query',
      workspaceRevision,
      model: mockModel,
      candidates,
      topK: 2,
    });

    // Both have equal score, but ordinal 10 must precede ordinal 42
    expect(receipt.rankedCandidates[0].candidateOrdinal).toBe(10);
    expect(receipt.rankedCandidates[1].candidateOrdinal).toBe(42);
  });
});
