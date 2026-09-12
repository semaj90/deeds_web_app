import { describe, expect, it } from 'vitest';
import {
  CHUNK_RETRIEVAL_PROFILE_V1,
  ChunkRetrievalProfileDraftV1Schema,
  ChunkRetrievalProfileV1Schema,
  createChunkRetrievalProfileV1,
  verifyChunkRetrievalProfileChecksum,
  type ChunkRetrievalProfileDraftV1,
} from './chunk-retrieval-profile-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

function baseDraft(): ChunkRetrievalProfileDraftV1 {
  return {
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_V1,
    canonicalChunkId: '11111111-1111-4111-8111-111111111111',
    packetKey: 'packet:src/lib/server/retrieval/search-runtime.ts',
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/lib/server/retrieval/search-runtime.ts',
    sourceIdentityKey: 'repo:root:src/lib/server/retrieval/search-runtime.ts',
    sourceRef: 'src/lib/server/retrieval/search-runtime.ts',
    workspaceRevision: SHA_A,
    sourceRevision: SHA_B,
    lexicalStructural: {
      language: 'typescript',
      symbolKind: 'class',
      symbolName: 'SearchRuntime',
      keywords: ['retrieval', 'fusion', 'retrieval'],
      identifiers: ['SearchRuntime', 'retrieveCandidates'],
      nouns: ['candidate', 'runtime'],
      astNodeType: 'class_declaration',
      astPath: ['program', 'class_declaration'],
      calls: ['retrieveCandidates', 'fuseCandidates'],
      imports: ['SearchFilter', 'CanonicalCandidateV1'],
      exports: ['SearchRuntime'],
    },
    semantic: {
      summary: 'Canonical search runtime that retrieves and fuses revision-qualified candidates.',
      semanticTags: ['search', 'retrieval', 'search'],
      embeddingRepresentation: 'semantic_768',
      representationRevision: 'semantic_768:embeddinggemma:r1',
      modelRevision: 'embeddinggemma:r1',
    },
    domainTopic: {
      primaryDomain: 'retrieval',
      domainConfidence: 0.93,
      topicIds: ['rrf', 'ann', 'search'],
    },
    topology: {
      kmeansCluster: 12,
      clusterMargin: 0.21,
      somX: 7,
      somY: 14,
      somCell: 287,
      communityId: 31,
      pageRank: 0.003,
      bridgeScore: 0.12,
      manifold4: [7 / 19, 14 / 19, 0.4, 0.2],
    },
    ontology: {
      conceptIds: ['concept:rrf', 'concept:qdrant'],
      entityIds: ['entity:SearchRuntime'],
      ontologyTupleIds: ['tuple:search-runtime-owner'],
    },
    revisions: {
      featureRevision: 'features:r1',
      classifierRevision: 'classifier:r1',
      topologyRevision: 'topology:r1',
      graphRevision: 'graph:r1',
      ontologyRevision: 'ontology:r1',
    },
    evidenceRefs: ['evidence:ast:1', 'evidence:semantic:1', 'evidence:ast:1'],
  };
}

describe('ChunkRetrievalProfileV1', () => {
  it('normalizes set-like feature arrays and produces a valid deterministic checksum', () => {
    const profile = createChunkRetrievalProfileV1(baseDraft());

    expect(ChunkRetrievalProfileV1Schema.parse(profile)).toEqual(profile);
    expect(profile.lexicalStructural?.keywords).toEqual(['fusion', 'retrieval']);
    expect(profile.semantic?.semanticTags).toEqual(['retrieval', 'search']);
    expect(profile.evidenceRefs).toEqual(['evidence:ast:1', 'evidence:semantic:1']);
    expect(profile.sourceIdentityKey).toBe('repo:root:src/lib/server/retrieval/search-runtime.ts');
    expect(profile.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyChunkRetrievalProfileChecksum(profile)).toBe(true);
  });

  it('is checksum-invariant to ordering/duplicates in set-like fields but preserves ordered AST path semantics', () => {
    const first = createChunkRetrievalProfileV1(baseDraft());
    const reordered = baseDraft();
    reordered.lexicalStructural = {
      ...reordered.lexicalStructural!,
      keywords: ['retrieval', 'fusion'],
      identifiers: ['retrieveCandidates', 'SearchRuntime'],
      calls: ['fuseCandidates', 'retrieveCandidates'],
      imports: ['CanonicalCandidateV1', 'SearchFilter'],
    };
    reordered.semantic = { ...reordered.semantic!, semanticTags: ['retrieval', 'search'] };
    reordered.domainTopic = { ...reordered.domainTopic!, topicIds: ['search', 'ann', 'rrf'] };
    reordered.evidenceRefs = ['evidence:semantic:1', 'evidence:ast:1'];

    const second = createChunkRetrievalProfileV1(reordered);
    expect(second.checksum).toBe(first.checksum);

    const changedAstPath = baseDraft();
    changedAstPath.lexicalStructural = {
      ...changedAstPath.lexicalStructural!,
      astPath: ['class_declaration', 'program'],
    };
    expect(createChunkRetrievalProfileV1(changedAstPath).checksum).not.toBe(first.checksum);
  });

  it('changes checksum when canonical revision-qualified identity changes', () => {
    const first = createChunkRetrievalProfileV1(baseDraft());
    const changed = baseDraft();
    changed.sourceRevision = `sha256:${'c'.repeat(64)}`;

    expect(createChunkRetrievalProfileV1(changed).checksum).not.toBe(first.checksum);
  });

  it('rejects a source identity key that does not match repository identity plus relative path', () => {
    const invalid = baseDraft();
    invalid.sourceIdentityKey = 'repo:other:src/lib/server/retrieval/search-runtime.ts';
    expect(() => ChunkRetrievalProfileDraftV1Schema.parse(invalid)).toThrow(/sourceIdentityKey/);
  });

  it('rejects traversal-bearing repository-relative paths', () => {
    const invalid = baseDraft();
    invalid.repositoryRelativePath = '../src/search-runtime.ts';
    invalid.sourceIdentityKey = 'repo:root:../src/search-runtime.ts';
    expect(() => ChunkRetrievalProfileDraftV1Schema.parse(invalid)).toThrow(/traversal-free/);
  });

  it('rejects inconsistent SOM cell coordinates', () => {
    const invalid = baseDraft();
    invalid.topology = { ...invalid.topology!, somX: 7, somY: 14, somCell: 288 };
    expect(() => ChunkRetrievalProfileDraftV1Schema.parse(invalid)).toThrow(/somCell/);
  });

  it('requires at least one evidence/feature group instead of fabricating an empty profile', () => {
    const invalid = baseDraft();
    delete invalid.lexicalStructural;
    delete invalid.semantic;
    delete invalid.domainTopic;
    delete invalid.topology;
    delete invalid.ontology;
    expect(() => ChunkRetrievalProfileDraftV1Schema.parse(invalid)).toThrow(/at least one retrieval feature group/);
  });

  it('detects checksum tampering after a valid profile is modified', () => {
    const profile = createChunkRetrievalProfileV1(baseDraft());
    const tampered = {
      ...profile,
      revisions: { ...profile.revisions, featureRevision: 'features:r2' },
    };

    expect(ChunkRetrievalProfileV1Schema.parse(tampered)).toEqual(tampered);
    expect(verifyChunkRetrievalProfileChecksum(tampered)).toBe(false);
  });
});
