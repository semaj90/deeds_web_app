import { describe, expect, it } from 'vitest';
import { adaptProfilesToCandidateFeatureMatrixV1 } from './candidate-feature-matrix-adapter-v1.js';
import type { ChunkRetrievalProfileV1 } from './chunk-retrieval-profile-v1.js';

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
    calls: ['search'],
    imports: ['zod'],
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

describe('candidate feature matrix adapter v1', () => {
  it('wraps the existing matrix with identity, revision, and executor provenance', () => {
    const result = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), profile('b')],
      expectedSourceRevision: 'sha256:source-a',
      executorProvenance: [
        { executor: 'qdrant', executorRevision: 'qdrant:v1', representationId: 'semantic_768' },
        { executor: 'cuvs-exact', executorRevision: 'cuvs:v1', representationId: 'semantic_768' },
      ],
    });

    expect(result.matrix.candidate_count).toBe(2);
    expect(result.matrix.feature_count).toBe(25);
    expect(result.matrix.presence_mask[21]).toBe(1);
    expect(result.identities.map((row) => row.packetKey)).toEqual(['a', 'b']);
    expect(result.executorProvenance.map((row) => row.executor)).toEqual(['cuvs-exact', 'qdrant']);
    expect(result.featureRevision).toBe('features:v1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.rankingPromotion).toBe(false);
  });

  it('preserves missingness instead of zero-filling unavailable evidence', () => {
    const result = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a')],
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    });

    expect(result.matrix.presence_mask[0]).toBe(0);
    expect(result.matrix.presence_mask[21]).toBe(1);
    expect(result.matrix.presence_mask[22]).toBe(1);
  });

  it('rejects mixed revisions and duplicate canonical packet keys', () => {
    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), { ...profile('b'), workspaceRevision: 'sha256:workspace-b' }],
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_WORKSPACE_REVISION_MISMATCH');

    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), profile('a')],
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_DUPLICATE_PACKET_KEY');
  });
});
