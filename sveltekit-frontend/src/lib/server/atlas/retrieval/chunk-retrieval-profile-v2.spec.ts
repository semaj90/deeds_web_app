import { describe, expect, it } from 'vitest';
import {
  CHUNK_RETRIEVAL_PROFILE_V2,
  ChunkRetrievalProfileDraftV2Schema,
  createChunkRetrievalProfileV2,
  verifyChunkRetrievalProfileV2Checksum,
  type ChunkRetrievalProfileDraftV2,
} from './chunk-retrieval-profile-v2.js';
import {
  CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2,
  hydrateChunkRetrievalProfileV2,
} from './chunk-retrieval-profile-adapter-v2.js';

const W = `sha256:${'a'.repeat(64)}`;
const S = `sha256:${'b'.repeat(64)}`;

function draft(): ChunkRetrievalProfileDraftV2 {
  return {
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_V2,
    canonicalChunkId: 'card:src/lib/server/retrieval/search-runtime.ts:abc123',
    chunkRowId: '11111111-1111-4111-8111-111111111111',
    packetKey: 'packet:src/lib/server/retrieval/search-runtime.ts',
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/lib/server/retrieval/search-runtime.ts',
    sourceIdentityKey: 'repo:root:src/lib/server/retrieval/search-runtime.ts',
    sourceRef: 'src/lib/server/retrieval/search-runtime.ts',
    workspaceRevision: W,
    sourceRevision: S,
    lexicalStructural: {
      language: 'typescript',
      keywords: ['retrieval', 'fusion', 'retrieval'],
      astPath: ['program', 'class_declaration'],
      imports: ['SearchFilter'],
      exports: ['SearchRuntime'],
    },
    semantic: {
      semanticTags: ['search', 'retrieval', 'search'],
      embeddingRepresentation: 'semantic_768',
      representationRevision: 'semantic_768:r1',
    },
    topology: { somX: 7, somY: 14, somCell: 287, kmeansCluster: 12 },
    revisions: { featureRevision: 'features:r1', topologyRevision: 'topology:r1' },
    evidenceRefs: ['evidence:lineage:1', 'evidence:features:1'],
  };
}

describe('ChunkRetrievalProfileV2', () => {
  it('accepts text canonical chunk identity while preserving UUID physical row identity', () => {
    const profile = createChunkRetrievalProfileV2(draft());
    expect(profile.canonicalChunkId).toMatch(/^card:/);
    expect(profile.chunkRowId).toBe('11111111-1111-4111-8111-111111111111');
    expect(verifyChunkRetrievalProfileV2Checksum(profile)).toBe(true);
  });

  it('rejects non-UUID physical chunk row identity', () => {
    const invalid = draft();
    invalid.chunkRowId = 'card:not-a-row-id';
    expect(() => ChunkRetrievalProfileDraftV2Schema.parse(invalid)).toThrow();
  });

  it('keeps canonical chunk id and physical row id independently checksum-significant', () => {
    const base = createChunkRetrievalProfileV2(draft());
    const changedCanonical = draft();
    changedCanonical.canonicalChunkId = 'card:src/lib/server/retrieval/search-runtime.ts:def456';
    const changedRow = draft();
    changedRow.chunkRowId = '22222222-2222-4222-8222-222222222222';
    expect(createChunkRetrievalProfileV2(changedCanonical).checksum).not.toBe(base.checksum);
    expect(createChunkRetrievalProfileV2(changedRow).checksum).not.toBe(base.checksum);
  });

  it('hydrates v2 without fabricating absent feature groups', () => {
    const result = hydrateChunkRetrievalProfileV2({
      schemaVersion: CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2,
      identity: {
        canonicalChunkId: 'card:src/a.ts:abc',
        chunkRowId: '33333333-3333-4333-8333-333333333333',
        packetKey: 'packet:src/a.ts', repositoryId: 'repo:root', repositoryRelativePath: 'src/a.ts',
        sourceRef: 'src/a.ts', workspaceRevision: W, sourceRevision: S,
      },
      featureRevision: 'features:r1',
      lexicalStructural: { language: 'typescript', keywords: ['a'] },
      evidenceRefs: ['lineage:1'],
    });
    expect(result.presence.lexicalStructural).toBe(true);
    expect(result.presence.semantic).toBe(false);
    expect(result.missingGroups).toContain('semantic');
    expect(result.profile.semantic).toBeUndefined();
    expect(result.writesPerformed).toBe(false);
  });
});
