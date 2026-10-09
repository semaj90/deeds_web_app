import { describe, expect, it } from 'vitest';
import {
  adaptProfilesToCandidateFeatureMatrixV1,
  retrievalCandidateFeatureMatrixReceiptV1Schema,
} from './candidate-feature-matrix-adapter-v1.js';
import type { ChunkRetrievalProfileV1 } from './chunk-retrieval-profile-v1.js';
import { candidateOrdinalMapChecksum, materializeCandidateOrdinalMap } from '../atlas/features/canonical-candidate-v1.js';

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

function ordinalMap(profiles: readonly ChunkRetrievalProfileV1[]) {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:matrix-adapter-v1',
    workspaceRevision: profiles[0]!.workspaceRevision,
    producerRevision: 'fixture:matrix-adapter-v1',
    candidates: profiles.map((candidate) => ({
      canonicalId: `canonical:${candidate.packetKey}`,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: null,
      semanticRevision: null,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    })),
  });
}

describe('candidate feature matrix adapter v1', () => {
  it('wraps the existing matrix with identity, revision, and executor provenance', () => {
    const map = ordinalMap([profile('a'), profile('b')]);
    const result = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('b'), profile('a')],
      ordinalMap: map,
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
    expect(result.identities.map((row) => row.candidateOrdinal)).toEqual([0, 1]);
    expect(result.identities.map((row) => row.rowOrdinal)).toEqual([0, 1]);
    expect(result.identities.map((row) => row.canonicalId)).toEqual(['canonical:a', 'canonical:b']);
    expect(result.matrix.candidate_packet_keys).toEqual(['a', 'b']);
    expect(result.ordinalMapChecksum).toBe(map.ordinalMapChecksum);
    expect(result.rowBindingChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.receipt.rowCount).toBe(2);
    expect(result.receipt.columnCount).toBe(25);
    expect(result.receipt.availableFeatureCount + result.receipt.unavailableFeatureCount).toBe(50);
    expect(result.receipt.graphRevision).toBeNull();
    expect(result.receipt.graphUnavailableReason).toBe('NO_GRAPH_REVISION_BOUND_TO_MATRIX_ROWS');
    expect(result.receipt.representationRevision).toBeNull();
    expect(result.receipt.representationUnavailableReason).toBe('NO_EXACT_REPRESENTATION_REVISION_BOUND_TO_MATRIX_ROWS');
    expect(result.executorProvenance.map((row) => row.executor)).toEqual(['cuvs-exact', 'qdrant']);
    expect(result.featureRevision).toBe('features:v1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.rankingPromotion).toBe(false);

    const replay = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), profile('b')],
      ordinalMap: map,
      expectedSourceRevision: 'sha256:source-a',
      executorProvenance: [
        { executor: 'cuvs-exact', executorRevision: 'cuvs:v1', representationId: 'semantic_768' },
        { executor: 'qdrant', executorRevision: 'qdrant:v1', representationId: 'semantic_768' },
      ],
    });
    expect(replay.rowBindingChecksum).toBe(result.rowBindingChecksum);
  });

  it('preserves missingness instead of zero-filling unavailable evidence', () => {
    const result = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a')],
      ordinalMap: ordinalMap([profile('a')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    });

    expect(result.matrix.presence_mask[0]).toBe(0);
    expect(result.matrix.presence_mask[21]).toBe(1);
    expect(result.matrix.presence_mask[22]).toBe(1);
  });

  it('rejects mixed revisions and duplicate canonical packet keys', () => {
    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), { ...profile('b'), workspaceRevision: 'sha256:workspace-b' }],
      ordinalMap: ordinalMap([profile('a'), profile('b')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_WORKSPACE_REVISION_MISMATCH');

    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), profile('a')],
      ordinalMap: ordinalMap([profile('a'), profile('b')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_DUPLICATE_PACKET_KEY');

    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a', 'sha256:source-b')],
      ordinalMap: ordinalMap([profile('a')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_PROFILE_IDENTITY_MISMATCH:0');

    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a')],
      ordinalMap: ordinalMap([profile('a'), profile('b')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_ORDINAL_MAP_ROW_COUNT_MISMATCH');
  });

  it('rejects duplicate canonical candidates even when a map checksum is recomputed', () => {
    const validMap = ordinalMap([profile('a'), profile('b')]);
    const candidates = validMap.candidates.map((candidate, index) => index === 1
      ? { ...candidate, canonicalId: validMap.candidates[0]!.canonicalId }
      : candidate);
    const duplicateCanonicalMap = {
      ...validMap,
      candidates,
      ordinalMapChecksum: candidateOrdinalMapChecksum({
        candidateSnapshotRevision: validMap.candidateSnapshotRevision,
        workspaceRevision: validMap.workspaceRevision,
        candidates,
      }),
    };

    expect(() => adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a'), profile('b')],
      ordinalMap: duplicateCanonicalMap,
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    })).toThrow('CANDIDATE_FEATURE_MATRIX_DUPLICATE_CANONICAL_ID:canonical:a');
  });

  it('rejects receipt availability counts that do not cover every matrix cell', () => {
    const result = adaptProfilesToCandidateFeatureMatrixV1({
      profiles: [profile('a')],
      ordinalMap: ordinalMap([profile('a')]),
      executorProvenance: [{ executor: 'fixture', executorRevision: 'fixture:v1' }],
    });

    expect(() => retrievalCandidateFeatureMatrixReceiptV1Schema.parse({
      ...result.receipt,
      unavailableFeatureCount: result.receipt.unavailableFeatureCount - 1,
    })).toThrow('MATRIX_RECEIPT_AVAILABILITY_COUNT_MISMATCH');
  });
});
