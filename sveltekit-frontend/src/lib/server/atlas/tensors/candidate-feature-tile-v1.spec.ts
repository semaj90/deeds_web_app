import { describe, expect, it } from 'vitest';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import { buildCandidateFeatureTileV1 } from './candidate-feature-tile-v1.js';
import { adaptProfilesToCandidateFeatureMatrixV1 } from '../../retrieval/candidate-feature-matrix-adapter-v1.js';
import type { ChunkRetrievalProfileV1 } from '../../retrieval/chunk-retrieval-profile-v1.js';

function profile(packetKey: string, sourceRevision = 'sha256:source-a'): ChunkRetrievalProfileV1 {
  return {
    canonicalChunkId: `chunk:${packetKey}`,
    packetKey,
    repositoryId: 'repo:root',
    repositoryRelativePath: `src/${packetKey}.ts`,
    sourceRef: `src/${packetKey}.ts`,
    workspaceRevision: 'sha256:workspace-a',
    sourceRevision,
    keywords: ['retrieval'],
    identifiers: ['run'],
    nouns: [],
    astPath: [],
    calls: [],
    imports: [],
    exports: [],
    semanticTags: ['code'],
    embeddingRepresentation: 'semantic_768',
    primaryDomain: 'retrieval',
    domainConfidence: 0.9,
    topicIds: [],
    conceptIds: [],
    entityIds: [],
    ontologyTupleIds: [],
    featureRevision: 'features:v1',
  };
}

function adapter() {
  return adaptProfilesToCandidateFeatureMatrixV1({
    profiles: [profile('a'), profile('b'), profile('c')],
    executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
  });
}

const featureNames = CANDIDATE_FEATURE_NAMES.slice(0, 16);

describe('CandidateFeatureTileV1', () => {
  it('projects explicitly ordered rows and columns from the canonical matrix', () => {
    const source = adapter();
    const tile = buildCandidateFeatureTileV1({ adapter: source, candidateOrdinals: [0, 2], featureNames });

    expect(tile.shape).toEqual([2, 16]);
    expect(tile.identities.map((identity) => identity.packetKey)).toEqual(['a', 'c']);
    expect(tile.candidateOrdinals).toEqual([0, 2]);
    expect(tile.featureNames).toEqual(featureNames);
    expect(tile.canonicalAuthority).toBe(false);
    expect(tile.writesPerformed).toBe(false);
    expect(tile.rankingPromotion).toBe(false);
    expect(tile.tileChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('preserves missingness through the source presence mask', () => {
    const tile = buildCandidateFeatureTileV1({ adapter: adapter(), candidateOrdinals: [0], featureNames });
    expect(tile.featureValues[0]).toBe(0);
    expect(tile.presenceMask[0]).toBe(0);
  });

  it('replays deterministically and rejects unstable mappings', () => {
    const source = adapter();
    const input = { adapter: source, candidateOrdinals: [0, 1], featureNames };
    expect(buildCandidateFeatureTileV1(input).tileChecksum).toBe(buildCandidateFeatureTileV1(input).tileChecksum);
    expect(() => buildCandidateFeatureTileV1({ ...input, candidateOrdinals: [1, 0] })).toThrow('ORDINALS_MUST_BE_VALID_ASCENDING');
    const reordered = buildCandidateFeatureTileV1({
      ...input,
      featureNames: [...featureNames.slice(1), featureNames[0]!],
    });
    expect(reordered.featureCrosswalkChecksum).not.toBe(buildCandidateFeatureTileV1(input).featureCrosswalkChecksum);
    expect(() => buildCandidateFeatureTileV1({ ...input, featureNames: [...featureNames.slice(0, 15), 'not_a_feature'] })).toThrow('UNKNOWN_FEATURE');
    expect(() => buildCandidateFeatureTileV1({ ...input, featureNames: [...featureNames.slice(0, 15), featureNames[0]!] })).toThrow('DUPLICATE_FEATURE');
  });
});
