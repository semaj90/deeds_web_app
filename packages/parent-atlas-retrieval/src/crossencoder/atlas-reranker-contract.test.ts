import { describe, expect, it } from 'vitest';
import {
  AtlasRerankerFeatureRowV1Schema,
  AtlasPairJudgmentV1Schema,
  hasPromotableEvidence,
  onlineFeatureRowFromJudgment,
  toAtlasRerankerFeatureVector
} from './atlas-reranker-contract.js';

const row = AtlasRerankerFeatureRowV1Schema.parse({
  schema: 'atlas.reranker-feature-row.v1',
  candidateOrdinal: 7,
  packetKey: 'packet:7',
  sourceRef: 'src/example.ts',
  sourceRevision: 'rev-1',
  candidateSnapshotRevision: 'snap-1',
  featureRevision: 'features-1',
  graphRevision: 'graph-1',
  ontologyRevision: 'ontology-1',
  representationRevision: 'semantic-768-1',
  semanticScore: 0.8,
  lexicalScore: null,
  sparseScore: 0.2,
  astMatch: 1,
  exactSymbolMatch: 1,
  relationMatch: 0.5,
  pageRank: 0.1,
  personalizedPageRank: null,
  communityAffinity: 0.7,
  hopDistance: 1,
  domainAffinity: 0.9,
  domainConfidence: 0.95,
  somAffinity: null,
  centroidAffinity: 0.4,
  identityQuality: 1,
  evidenceFreshness: 1,
  evidenceKinds: ['SOURCE'],
  ontologyTupleCount: 1,
  ontologySummary: [2, 4, 9]
});

describe('AtlasRerankerV1 contract', () => {
  it('emits a stable finite feature vector with nulls zero-filled', () => {
    const vector = toAtlasRerankerFeatureVector(row);
    expect(vector).toHaveLength(16);
    expect(vector[0]).toBe(0.8);
    expect(vector[1]).toBe(0);
    expect(vector.every(Number.isFinite)).toBe(true);
  });

  it('keeps outcome labels outside online features', () => {
    const judgment = AtlasPairJudgmentV1Schema.parse({
      schema: 'atlas.pair-judgment.v1',
      queryId: 'q-1',
      queryRevision: 'q-rev-1',
      candidate: row,
      queryText: 'where is the function?',
      candidateText: 'function example() {}',
      retrievalRank: 2,
      humanRelevanceGrade: 3,
      teacherScore: 0.9,
      exactPromotionOutcome: true,
      repairSuccess: false,
      testSuccess: true,
      labelRevision: 'labels-1',
      isHardNegative: false
    });
    const online = onlineFeatureRowFromJudgment(judgment);
    expect(online).toEqual(row);
    expect('repairSuccess' in online).toBe(false);
  });

  it('does not admit synthesis-only evidence', () => {
    expect(hasPromotableEvidence(row)).toBe(true);
    expect(hasPromotableEvidence({ ...row, evidenceKinds: ['DERIVED_SYNTHESIS'] })).toBe(false);
  });
});

