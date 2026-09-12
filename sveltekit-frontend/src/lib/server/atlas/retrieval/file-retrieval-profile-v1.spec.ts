import { describe, expect, it } from 'vitest';
import { createChunkRetrievalProfileV2, type ChunkRetrievalProfileV2 } from './chunk-retrieval-profile-v2.js';
import {
  aggregateFileRetrievalProfileV1,
  verifyFileRetrievalProfileV1Checksum,
} from './file-retrieval-profile-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;

function chunk(overrides: Partial<ChunkRetrievalProfileV2> & { canonicalChunkId: string; chunkRowId: string }): ChunkRetrievalProfileV2 {
  return createChunkRetrievalProfileV2({
    schemaVersion: 'atlas.chunk-retrieval-profile.v2',
    canonicalChunkId: overrides.canonicalChunkId,
    chunkRowId: overrides.chunkRowId,
    packetKey: overrides.packetKey ?? 'packet:file:one',
    repositoryId: overrides.repositoryId ?? 'repo:root',
    repositoryRelativePath: overrides.repositoryRelativePath ?? 'src/lib/file.ts',
    sourceIdentityKey: overrides.sourceIdentityKey ?? 'repo:root:src/lib/file.ts',
    sourceRef: overrides.sourceRef ?? 'src/lib/file.ts',
    workspaceRevision: overrides.workspaceRevision ?? SHA_A,
    sourceRevision: overrides.sourceRevision ?? SHA_B,
    lexicalStructural: overrides.lexicalStructural ?? {
      language: 'typescript',
      symbolKind: 'function',
      symbolName: overrides.canonicalChunkId,
      keywords: ['retrieval', 'file'],
      identifiers: [overrides.canonicalChunkId],
      imports: ['SearchRuntime'],
      exports: [],
    },
    semantic: overrides.semantic ?? {
      summary: `summary ${overrides.canonicalChunkId}`,
      semanticTags: ['search', 'retrieval'],
      embeddingRepresentation: 'semantic_768',
      representationRevision: 'semantic_768:r1',
      modelRevision: 'embeddinggemma:r1',
    },
    domainTopic: overrides.domainTopic ?? {
      primaryDomain: 'retrieval',
      domainConfidence: 0.9,
      topicIds: ['search'],
    },
    topology: overrides.topology ?? {
      kmeansCluster: 12,
      somX: 7,
      somY: 14,
      somCell: 287,
      communityId: 31,
      pageRank: 0.2,
    },
    ontology: overrides.ontology ?? {
      conceptIds: ['concept:retrieval'],
      entityIds: ['entity:SearchRuntime'],
      ontologyTupleIds: ['tuple:one'],
    },
    revisions: overrides.revisions ?? {
      featureRevision: 'features:r1',
      classifierRevision: 'classifier:r1',
      topologyRevision: 'topology:r1',
      graphRevision: 'graph:r1',
      ontologyRevision: 'ontology:r1',
    },
    evidenceRefs: overrides.evidenceRefs ?? [`evidence:${overrides.canonicalChunkId}`],
  });
}

describe('FileRetrievalProfileV1', () => {
  it('aggregates chunks deterministically independent of input order', () => {
    const a = chunk({ canonicalChunkId: 'card:src/lib/file.ts:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const b = chunk({
      canonicalChunkId: 'card:src/lib/file.ts:b',
      chunkRowId: '22222222-2222-4222-8222-222222222222',
      lexicalStructural: {
        language: 'typescript',
        symbolKind: 'class',
        symbolName: 'B',
        keywords: ['ranking', 'retrieval'],
        identifiers: ['B'],
      },
      domainTopic: { primaryDomain: 'retrieval', domainConfidence: 0.8, topicIds: ['ranking'] },
      topology: { kmeansCluster: 13, somX: 8, somY: 14, somCell: 288, communityId: 32, pageRank: 0.4 },
      ontology: { conceptIds: ['concept:ranking'], entityIds: ['entity:B'], ontologyTupleIds: ['tuple:two'] },
      evidenceRefs: ['evidence:b'],
    });

    const first = aggregateFileRetrievalProfileV1([a, b]);
    const second = aggregateFileRetrievalProfileV1([b, a]);

    expect(second.checksum).toBe(first.checksum);
    expect(second.chunkMembershipChecksum).toBe(first.chunkMembershipChecksum);
    expect(first.chunkCount).toBe(2);
    expect(first.canonicalChunkIds).toEqual(['card:src/lib/file.ts:a', 'card:src/lib/file.ts:b']);
    expect(first.kmeansClusters).toEqual([12, 13]);
    expect(first.somCells).toEqual([287, 288]);
    expect(first.communityIds).toEqual([31, 32]);
    expect(first.primaryDomainCounts).toEqual([{ key: 'retrieval', count: 2 }]);
    expect(first.pageRankMean).toBeCloseTo(0.3);
    expect(first.pageRankMax).toBe(0.4);
    expect(verifyFileRetrievalProfileV1Checksum(first)).toBe(true);
  });

  it('rejects mixed source revisions instead of merging stale/current chunks', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const b = chunk({
      canonicalChunkId: 'card:b',
      chunkRowId: '22222222-2222-4222-8222-222222222222',
      sourceRevision: `sha256:${'c'.repeat(64)}`,
    });
    expect(() => aggregateFileRetrievalProfileV1([a, b])).toThrow(/SOURCE_REVISION/);
  });

  it('rejects mixed packet/file identity', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const b = chunk({
      canonicalChunkId: 'card:b',
      chunkRowId: '22222222-2222-4222-8222-222222222222',
      packetKey: 'packet:file:two',
    });
    expect(() => aggregateFileRetrievalProfileV1([a, b])).toThrow(/PACKETKEY/);
  });

  it('rejects duplicate canonical chunk identity even with a different physical row id', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const b = chunk({ canonicalChunkId: 'card:a', chunkRowId: '22222222-2222-4222-8222-222222222222' });
    expect(() => aggregateFileRetrievalProfileV1([a, b])).toThrow(/DUPLICATE_CANONICAL_CHUNK_ID/);
  });

  it('rejects duplicate physical chunk row identity', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const b = chunk({ canonicalChunkId: 'card:b', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    expect(() => aggregateFileRetrievalProfileV1([a, b])).toThrow(/DUPLICATE_CHUNK_ROW_ID/);
  });

  it('rejects a member with a tampered chunk profile checksum', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const tampered = { ...a, checksum: '0'.repeat(64) };
    expect(() => aggregateFileRetrievalProfileV1([tampered])).toThrow(/INVALID_CHUNK_PROFILE_CHECKSUM/);
  });

  it('changes the file checksum when member feature evidence changes', () => {
    const a = chunk({ canonicalChunkId: 'card:a', chunkRowId: '11111111-1111-4111-8111-111111111111' });
    const first = aggregateFileRetrievalProfileV1([a]);
    const changed = chunk({
      canonicalChunkId: 'card:a',
      chunkRowId: '11111111-1111-4111-8111-111111111111',
      semantic: {
        summary: 'changed summary',
        semanticTags: ['search'],
        embeddingRepresentation: 'semantic_768',
        representationRevision: 'semantic_768:r1',
        modelRevision: 'embeddinggemma:r1',
      },
    });
    const second = aggregateFileRetrievalProfileV1([changed]);
    expect(second.chunkMembershipChecksum).not.toBe(first.chunkMembershipChecksum);
    expect(second.checksum).not.toBe(first.checksum);
  });
});
