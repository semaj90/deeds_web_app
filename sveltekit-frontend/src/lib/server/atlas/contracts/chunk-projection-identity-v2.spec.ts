import { describe, expect, it } from 'vitest';
import { createChunkProjectionIdentityV2, verifyChunkProjectionIdentityV2 } from './chunk-projection-identity-v2.js';

const input = {
  schema: 'atlas.chunk-projection-identity.v2' as const,
  packetKey: 'packet:1', chunkId: 'chunk:1', chunkOrdinal: 2,
  canonicalSourceRef: 'src/example.ts', sourceRevision: 'sha256:' + 'a'.repeat(64),
  workspaceRevision: 'sha256:' + 'b'.repeat(64), startByte: 10, endByte: 40,
  chunkContentHash: 'c'.repeat(64), treeNodeId: 'tree:1', symbolVersionId: null,
  representationId: 'semantic_768', representationRevision: 'semantic:r1', projectionRevision: 'projection:r1',
};

describe('ChunkProjectionIdentityV2', () => {
  it('derives and verifies a chunk identity checksum', () => {
    const value = createChunkProjectionIdentityV2(input);
    expect(verifyChunkProjectionIdentityV2(value)).toBe(true);
  });

  it('detects identity mutation', () => {
    const value = createChunkProjectionIdentityV2(input);
    expect(verifyChunkProjectionIdentityV2({ ...value, chunkOrdinal: 3 })).toBe(false);
  });

  it('rejects reversed byte ranges', () => {
    expect(() => createChunkProjectionIdentityV2({ ...input, startByte: 40, endByte: 10 })).toThrow();
  });
});
