import { describe, expect, it } from 'vitest';
import {
  CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1,
  hydrateChunkRetrievalProfileV1,
  type ChunkRetrievalProfileHydrationInputV1,
} from './chunk-retrieval-profile-adapter-v1.js';
import { verifyChunkRetrievalProfileChecksum } from './chunk-retrieval-profile-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

function baseInput(): ChunkRetrievalProfileHydrationInputV1 {
  return {
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_ADAPTER_V1,
    identity: {
      canonicalChunkId: '11111111-1111-4111-8111-111111111111',
      packetKey: 'packet:one',
      repositoryId: 'repo:root',
      repositoryRelativePath: 'src/lib/server/retrieval/search-runtime.ts',
      sourceRef: 'src/lib/server/retrieval/search-runtime.ts',
      workspaceRevision: SHA_A,
      sourceRevision: SHA_B,
    },
    featureRevision: 'features:r1',
    lexicalStructural: {
      language: 'typescript',
      keywords: ['retrieval', 'search'],
      astPath: ['program', 'class_declaration'],
      imports: ['SearchFilter'],
    },
    semantic: {
      summary: 'Search runtime owner.',
      semanticTags: ['retrieval', 'search'],
      representationRevision: 'semantic_768:r1',
      modelRevision: 'embeddinggemma:r1',
    },
    domainTopic: {
      primaryDomain: 'retrieval',
      domainConfidence: 0.9,
      topicIds: ['search', 'rrf'],
      classifierRevision: 'classifier:r1',
    },
    topology: {
      kmeansCluster: 12,
      somX: 7,
      somY: 14,
      somCell: 287,
      communityId: 31,
      topologyRevision: 'topology:r1',
      graphRevision: 'graph:r1',
    },
    ontology: {
      conceptIds: ['concept:rrf'],
      entityIds: ['entity:SearchRuntime'],
      ontologyTupleIds: ['tuple:owner'],
      ontologyRevision: 'ontology:r1',
    },
    evidenceRefs: ['evidence:semantic:1', 'evidence:ast:1'],
  };
}

describe('hydrateChunkRetrievalProfileV1', () => {
  it('hydrates all supplied groups without changing canonical authority', () => {
    const result = hydrateChunkRetrievalProfileV1(baseInput());

    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthorityChanged).toBe(false);
    expect(result.missingGroups).toEqual([]);
    expect(result.presence).toEqual({
      lexicalStructural: true,
      semantic: true,
      domainTopic: true,
      topology: true,
      ontology: true,
    });
    expect(result.profile.sourceIdentityKey).toBe('repo:root:src/lib/server/retrieval/search-runtime.ts');
    expect(result.profile.semantic?.embeddingRepresentation).toBe('semantic_768');
    expect(result.profile.revisions).toEqual({
      featureRevision: 'features:r1',
      classifierRevision: 'classifier:r1',
      topologyRevision: 'topology:r1',
      graphRevision: 'graph:r1',
      ontologyRevision: 'ontology:r1',
    });
    expect(verifyChunkRetrievalProfileChecksum(result.profile)).toBe(true);
  });

  it('keeps absent feature groups absent instead of synthesizing defaults', () => {
    const input = baseInput();
    delete input.domainTopic;
    delete input.topology;
    delete input.ontology;

    const result = hydrateChunkRetrievalProfileV1(input);

    expect(result.profile.domainTopic).toBeUndefined();
    expect(result.profile.topology).toBeUndefined();
    expect(result.profile.ontology).toBeUndefined();
    expect(result.profile.revisions.classifierRevision).toBeUndefined();
    expect(result.profile.revisions.topologyRevision).toBeUndefined();
    expect(result.profile.revisions.graphRevision).toBeUndefined();
    expect(result.profile.revisions.ontologyRevision).toBeUndefined();
    expect(result.missingGroups).toEqual(['domainTopic', 'topology', 'ontology']);
  });

  it('converts nullable source columns to absence rather than fake empty values', () => {
    const input = baseInput();
    input.lexicalStructural = {
      language: 'typescript',
      symbolKind: null,
      symbolName: null,
      keywords: null,
      identifiers: null,
      nouns: null,
      astNodeType: null,
      astPath: null,
      calls: null,
      imports: null,
      exports: null,
    };
    input.semantic = {
      summary: null,
      semanticTags: null,
      representationRevision: 'semantic_768:r1',
      modelRevision: null,
    };

    const result = hydrateChunkRetrievalProfileV1(input);
    expect(result.profile.lexicalStructural).toEqual({ language: 'typescript' });
    expect(result.profile.semantic).toEqual({
      embeddingRepresentation: 'semantic_768',
      representationRevision: 'semantic_768:r1',
    });
  });

  it('normalizes Windows path separators into repository-qualified source identity', () => {
    const input = baseInput();
    input.identity.repositoryRelativePath = 'src\\lib\\server\\retrieval\\search-runtime.ts';

    const result = hydrateChunkRetrievalProfileV1(input);
    expect(result.profile.repositoryRelativePath).toBe('src/lib/server/retrieval/search-runtime.ts');
    expect(result.profile.sourceIdentityKey).toBe('repo:root:src/lib/server/retrieval/search-runtime.ts');
  });

  it('produces the same profile checksum when provider set ordering changes', () => {
    const first = hydrateChunkRetrievalProfileV1(baseInput());
    const reordered = baseInput();
    reordered.lexicalStructural = {
      ...reordered.lexicalStructural!,
      keywords: ['search', 'retrieval'],
      imports: ['SearchFilter'],
    };
    reordered.semantic = { ...reordered.semantic!, semanticTags: ['search', 'retrieval'] };
    reordered.domainTopic = { ...reordered.domainTopic!, topicIds: ['rrf', 'search'] };
    reordered.evidenceRefs = ['evidence:ast:1', 'evidence:semantic:1'];

    const second = hydrateChunkRetrievalProfileV1(reordered);
    expect(second.profile.checksum).toBe(first.profile.checksum);
  });

  it('fails closed when topology coordinates contradict their cell id', () => {
    const input = baseInput();
    input.topology = { ...input.topology!, somCell: 288 };
    expect(() => hydrateChunkRetrievalProfileV1(input)).toThrow(/somCell/);
  });
});
