import { describe, expect, it } from 'vitest';

import {
  ChunkRetrievalProfileV1Schema,
  deriveDirectoryRetrievalProfileV1,
  deriveFileRetrievalProfileV1,
  RETRIEVAL_PROFILE_V1_INVARIANTS,
} from './retrieval-profile-v1.js';

function chunk(overrides: Record<string, unknown> = {}) {
  return ChunkRetrievalProfileV1Schema.parse({
    schema: 'atlas.chunk-retrieval-profile.v1',
    canonicalChunkId: 'chunk-a',
    packetKey: 'packet-a',
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/retrieval/a.ts',
    sourceRef: 'src/retrieval/a.ts',
    workspaceRevision: 'workspace-r1',
    sourceRevision: 'source-a-r1',
    language: 'typescript',
    symbolKind: 'function',
    symbolName: 'search',
    keywords: ['search', 'rrf', 'search'],
    identifiers: ['search'],
    nouns: ['candidate'],
    astNodeType: 'function_declaration',
    astPath: ['program', 'function_declaration'],
    calls: ['combineViaRRF'],
    imports: ['SearchCandidate'],
    exports: ['search'],
    summary: 'Searches canonical candidates.',
    semanticTags: ['retrieval'],
    embeddingRepresentation: 'semantic_768',
    semanticRevision: 'semantic-r1',
    domain: {
      primaryDomain: 'retrieval',
      confidence: 0.9,
      topicIds: ['rrf', 'search'],
      classifierRevision: 'classifier-r1',
    },
    topology: {
      kmeansCluster: 12,
      clusterMargin: 0.4,
      somX: 7,
      somY: 14,
      somCell: 287,
      communityId: 31,
      pageRank: 0.03,
      bridgeScore: 0.2,
      manifold4: [7 / 19, 14 / 19, 0.3, 0.2],
      topologyRevision: 'topology-r1',
    },
    conceptIds: ['concept:rrf'],
    entityIds: ['entity:search'],
    ontologyTupleIds: ['tuple:1'],
    featureRevision: 'feature-r1',
    evidenceRefs: ['evidence:1'],
    canonicalAuthority: false,
    ...overrides,
  });
}

describe('ChunkRetrievalProfileV1', () => {
  it('normalizes reusable retrieval evidence without creating authority', () => {
    const value = chunk();
    expect(value.embeddingRepresentation).toBe('semantic_768');
    expect(value.keywords).toEqual(['rrf', 'search']);
    expect(value.topology.somCell).toBe(287);
    expect(value.canonicalAuthority).toBe(false);
    expect(RETRIEVAL_PROFILE_V1_INVARIANTS.executorCountDoesNotCreateVotes).toBe(true);
  });

  it('rejects an inconsistent SOM cell', () => {
    expect(() => chunk({
      topology: {
        somX: 7,
        somY: 14,
        somCell: 1,
        topologyRevision: 'topology-r1',
      },
    })).toThrow(/SOM_CELL_MUST_EQUAL_Y_TIMES_20_PLUS_X/);
  });

  it('cannot be promoted to canonical authority', () => {
    expect(() => chunk({ canonicalAuthority: true })).toThrow();
  });
});

describe('file and directory retrieval profiles', () => {
  it('derives a file profile from one revision-qualified file cohort', () => {
    const first = chunk();
    const second = chunk({
      canonicalChunkId: 'chunk-b',
      packetKey: 'packet-a',
      keywords: ['fusion'],
      topology: {
        kmeansCluster: 12,
        somX: 8,
        somY: 14,
        somCell: 288,
        communityId: 31,
        pageRank: 0.01,
        topologyRevision: 'topology-r1',
      },
      evidenceRefs: ['evidence:2'],
    });

    const profile = deriveFileRetrievalProfileV1({
      chunks: [first, second],
      featureRevision: 'aggregate-r1',
      summary: 'Retrieval implementation.',
    });

    expect(profile.chunkCount).toBe(2);
    expect(profile.keywords).toEqual(['fusion', 'rrf', 'search']);
    expect(profile.kmeansHistogram).toEqual([{ id: 12, count: 2 }]);
    expect(profile.somCellHistogram).toEqual([{ id: 287, count: 1 }, { id: 288, count: 1 }]);
    expect(profile.canonicalAuthority).toBe(false);
  });

  it('rejects a file profile that mixes source revisions', () => {
    expect(() => deriveFileRetrievalProfileV1({
      chunks: [chunk(), chunk({ canonicalChunkId: 'chunk-b', sourceRevision: 'source-a-r2' })],
      featureRevision: 'aggregate-r1',
    })).toThrow('FILE_PROFILE_IDENTITY_MIXED');
  });

  it('derives a non-canonical directory profile from file and chunk profiles', () => {
    const a = chunk();
    const b = chunk({
      canonicalChunkId: 'chunk-b',
      packetKey: 'packet-b',
      repositoryRelativePath: 'src/retrieval/b.ts',
      sourceRef: 'src/retrieval/b.ts',
      sourceRevision: 'source-b-r1',
    });
    const fileA = deriveFileRetrievalProfileV1({ chunks: [a], featureRevision: 'aggregate-r1' });
    const fileB = deriveFileRetrievalProfileV1({ chunks: [b], featureRevision: 'aggregate-r1' });

    const directory = deriveDirectoryRetrievalProfileV1({
      repositoryId: 'repo:root',
      path: 'src/retrieval',
      files: [fileA, fileB],
      chunks: [a, b],
      featureRevision: 'directory-r1',
      inboundImports: 3,
      outboundImports: 4,
    });

    expect(directory.fileCount).toBe(2);
    expect(directory.chunkCount).toBe(2);
    expect(directory.path).toBe('src/retrieval');
    expect(directory.canonicalAuthority).toBe(false);
    expect(directory.profileKey).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects mixed workspace revisions during directory aggregation', () => {
    const a = chunk();
    const b = chunk({
      canonicalChunkId: 'chunk-b',
      packetKey: 'packet-b',
      repositoryRelativePath: 'src/retrieval/b.ts',
      sourceRef: 'src/retrieval/b.ts',
      sourceRevision: 'source-b-r1',
      workspaceRevision: 'workspace-r2',
    });
    const fileA = deriveFileRetrievalProfileV1({ chunks: [a], featureRevision: 'aggregate-r1' });
    const fileB = deriveFileRetrievalProfileV1({ chunks: [b], featureRevision: 'aggregate-r1' });

    expect(() => deriveDirectoryRetrievalProfileV1({
      repositoryId: 'repo:root',
      path: 'src/retrieval',
      files: [fileA, fileB],
      chunks: [a, b],
      featureRevision: 'directory-r1',
    })).toThrow('DIRECTORY_PROFILE_WORKSPACE_REVISION_MIXED');
  });
});
