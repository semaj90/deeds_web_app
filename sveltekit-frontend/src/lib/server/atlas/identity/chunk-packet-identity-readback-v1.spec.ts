import { describe, expect, it } from 'vitest';
import type { AtlasChunkPacketIdentityLinkV1 } from './chunk-packet-identity-link-v1.js';
import {
  verifyChunkPacketIdentityReadback,
  type ChunkPacketReadbackObservationV1,
} from './chunk-packet-identity-readback-v1.js';

function link(overrides: Partial<AtlasChunkPacketIdentityLinkV1> = {}): AtlasChunkPacketIdentityLinkV1 {
  return {
    schema: 'atlas.chunk-packet-identity-link.v1',
    qdrantCollection: 'codebase_chunks_512',
    qdrantPointId: '42',
    chunkIndexId: '42',
    canonicalPacketKey: 'ace:packet:abc123def456',
    sourceRef: 'src/a.ts',
    sourceRevision: null,
    matchMethod: 'EXACT_CANONICAL_ID',
    candidatePacketKeys: ['ace:packet:abc123def456'],
    confidence: 'EXACT',
    admission: 'ADMITTED',
    reasonCodes: ['EXISTING_CANONICAL_PACKET_EXACTLY_RESOLVED'],
    evidenceRefs: ['codebase_chunk_index:42:metadata.packet_key'],
    canonicalPacketMinted: false,
    canonicalWritesAllowed: false,
    ...overrides,
  };
}

function observation(overrides: Partial<ChunkPacketReadbackObservationV1> = {}): ChunkPacketReadbackObservationV1 {
  return {
    qdrantPointExists: true,
    chunkExists: true,
    packetExists: true,
    qdrantPointId: '42',
    chunkIndexId: '42',
    chunkMetadataPacketKey: 'ace:packet:abc123def456',
    chunkSourceRef: 'src/a.ts',
    chunkSourceRevision: null,
    chunkStartByte: 10,
    chunkEndByte: 20,
    chunkTreeNodeId: 'tree-1',
    packetKey: 'ace:packet:abc123def456',
    packetQdrantPointId: '42',
    packetArtifactId: null,
    packetSourceRef: 'src/a.ts',
    packetSourceRevision: null,
    packetStartByte: 10,
    packetEndByte: 20,
    packetTreeNodeId: 'tree-1',
    ...overrides,
  };
}

describe('verifyChunkPacketIdentityReadback', () => {
  it('verifies exact canonical-id evidence', () => {
    const result = verifyChunkPacketIdentityReadback({ link: link(), observation: observation() });
    expect(result.status).toBe('VERIFIED');
    expect(result.matchReproduced).toBe(true);
    expect(result.canonicalWritesAllowed).toBe(false);
  });

  it('verifies exact Qdrant point linkage', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link({ matchMethod: 'EXACT_QDRANT_POINT_LINK' }),
      observation: observation({ chunkMetadataPacketKey: null }),
    });
    expect(result.status).toBe('VERIFIED');
  });

  it('verifies normalized source-ref and exact byte span', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link({ matchMethod: 'EXACT_SOURCE_SPAN', confidence: 'UNIQUE_DERIVATION' }),
      observation: observation({ chunkSourceRef: '.\\src\\a.ts', packetSourceRef: 'src/a.ts' }),
    });
    expect(result.status).toBe('VERIFIED');
  });

  it('marks a missing packet as drifted', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link(),
      observation: observation({ packetExists: false, packetKey: null }),
    });
    expect(result.status).toBe('DRIFTED');
    expect(result.reasonCodes).toContain('CANONICAL_PACKET_MISSING');
  });

  it('marks missing reproducing fields as unverifiable rather than verified', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link({ matchMethod: 'STRUCTURAL_FINGERPRINT', confidence: 'UNIQUE_DERIVATION' }),
      observation: observation({ chunkTreeNodeId: null, packetTreeNodeId: null }),
    });
    expect(result.status).toBe('UNVERIFIABLE');
    expect(result.matchReproduced).toBe(false);
  });

  it('refuses to grandfather content-hash-only admitted links', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link({ matchMethod: 'CONTENT_HASH_UNIQUE', confidence: 'UNIQUE_DERIVATION' }),
      observation: observation(),
    });
    expect(result.status).toBe('DRIFTED');
    expect(result.reasonCodes).toContain('INVALID_ADMITTED_CONTENT_HASH_ONLY_LINK');
  });

  it('does not verify non-admitted links', () => {
    const result = verifyChunkPacketIdentityReadback({
      link: link({ admission: 'REVIEW', canonicalPacketKey: null, matchMethod: 'AMBIGUOUS', confidence: 'AMBIGUOUS' }),
      observation: observation(),
    });
    expect(result.status).toBe('NOT_ADMITTED');
  });
});
