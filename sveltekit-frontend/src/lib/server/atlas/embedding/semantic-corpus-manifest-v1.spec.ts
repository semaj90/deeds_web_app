// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { buildSemanticCorpusManifestV1, verifySemanticCorpusManifestV1 } from './semantic-corpus-manifest-v1.js';
import { bindSemanticCorpusToOrdinalMapV1 } from './semantic-bound-ordinal-map-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceA = `sha256:${'b'.repeat(64)}`;
const sourceB = `sha256:${'c'.repeat(64)}`;

function map() {
  return materializeCandidateOrdinalMap({
    workspaceRevision,
    candidateSnapshotRevision: 'fixture:chunks:v1',
    producerRevision: 'fixture:ordinal:v1',
    candidates: [
      {
        canonicalId: 'chunk:a', packetKey: 'packet:a', sourceRef: 'src/a.ts',
        treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: sourceA,
        graphRevision: null, semanticRevision: null, degradedIdentity: false,
        evidenceRefs: ['fixture:a'], representationBindings: [],
      },
      {
        canonicalId: 'chunk:b', packetKey: 'packet:b', sourceRef: 'src/b.ts',
        treeNodeId: null, symbolVersionId: null, workspaceRevision, sourceRevision: sourceB,
        graphRevision: null, semanticRevision: null, degradedIdentity: false,
        evidenceRefs: ['fixture:b'], representationBindings: [],
      },
    ],
  });
}

function member(candidateOrdinal: number, canonicalId: string, packetKey: string, sourceRef: string, sourceRevision: string, rowId: string) {
  return {
    schema: 'atlas.semantic-corpus-member.v1' as const,
    candidateOrdinal,
    canonicalId,
    packetKey,
    sourceRef,
    sourceRevision,
    chunkRowId: rowId,
    inputDigestAlgorithm: 'sha256_16' as const,
    inputDigest: 'd'.repeat(16),
    vectorChecksum: 'e'.repeat(64),
    observedEmbeddingModel: 'embeddinggemma:latest:eg-task-prefix-v1',
    observedEmbeddingVersion: 'writer:v1',
    evidenceRefs: [`postgres:codebase_chunk_index:${rowId}`],
  };
}

describe('SemanticCorpusManifestV1', () => {
  it('builds a deterministic representation-only corpus manifest without QRELS', () => {
    const ordinalMap = map();
    const members = [member(0, 'chunk:a', 'packet:a', 'src/a.ts', sourceA, '11111111-1111-4111-8111-111111111111')];
    const manifest = buildSemanticCorpusManifestV1({ ordinalMap, members });

    expect(manifest.representationRevision).toMatch(/^semantic_768:sha256:[a-f0-9]{64}$/);
    expect(manifest.qualityJudgmentsRequired).toBe(false);
    expect(manifest.qualityPromotionEligible).toBe(false);
    expect(manifest.canonicalAuthority).toBe(false);
    expect(() => verifySemanticCorpusManifestV1({ ordinalMap, members, manifest })).not.toThrow();
  });

  it('binds semantic revision only to admitted member ordinals while preserving ordinal identity', () => {
    const ordinalMap = map();
    const members = [member(1, 'chunk:b', 'packet:b', 'src/b.ts', sourceB, '22222222-2222-4222-8222-222222222222')];
    const manifest = buildSemanticCorpusManifestV1({ ordinalMap, members });
    const bound = bindSemanticCorpusToOrdinalMapV1({
      ordinalMap,
      members,
      manifest,
      producerRevision: 'fixture:semantic-bound-map:v1',
    });

    expect(bound.candidates.map((candidate) => candidate.canonicalId)).toEqual(
      ordinalMap.candidates.map((candidate) => candidate.canonicalId),
    );
    expect(bound.candidates.map((candidate) => candidate.candidateOrdinal)).toEqual([0, 1]);
    expect(bound.candidates[0]?.semanticRevision).toBeNull();
    expect(bound.candidates[1]?.semanticRevision).toBe(manifest.representationRevision);
    expect(bound.ordinalMapChecksum).not.toBe(ordinalMap.ordinalMapChecksum);
  });

  it('rejects a corpus member that does not match the source ordinal identity', () => {
    const ordinalMap = map();
    const members = [member(0, 'wrong', 'packet:a', 'src/a.ts', sourceA, '33333333-3333-4333-8333-333333333333')];
    expect(() => buildSemanticCorpusManifestV1({ ordinalMap, members })).toThrow(/IDENTITY_MISMATCH/);
  });
});
