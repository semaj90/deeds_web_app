import { describe, expect, it } from 'vitest';
import { deriveAtlasChunkPacketIdentityLinkV1 } from './atlas-chunk-packet-identity-link-v1.js';

const base = {
  qdrantCollection: 'codebase_chunks_512',
  qdrantPointId: 'qdrant-point-1',
  chunkIndexId: 'chunk-index-1',
  sourceRef: 'src/example.ts',
  sourceRevision: 'source-1',
};

describe('AtlasChunkPacketIdentityLinkV1', () => {
  it('admits an exact canonical relationship without minting a packet', () => {
    const link = deriveAtlasChunkPacketIdentityLinkV1({
      ...base,
      evidence: { exactCanonicalPacketKey: 'pkt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', evidenceRefs: ['join:canonical-id'] },
    });
    expect(link.matchMethod).toBe('EXACT_CANONICAL_ID');
    expect(link.admission).toBe('ADMITTED');
    expect(link.canonicalPacketKey).toBe('pkt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(link.canonicalPacketMinted).toBe(false);
    expect(link.canonicalWritesAllowed).toBe(false);
  });

  it('admits only a unique source-span derivation', () => {
    const link = deriveAtlasChunkPacketIdentityLinkV1({
      ...base,
      evidence: { sourceSpanCandidatePacketKeys: ['pkt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'] },
    });
    expect(link.matchMethod).toBe('EXACT_SOURCE_SPAN');
    expect(link.confidence).toBe('UNIQUE_DERIVATION');
    expect(link.admission).toBe('ADMITTED');
  });

  it('quarantines ambiguous and unresolved candidates', () => {
    const ambiguous = deriveAtlasChunkPacketIdentityLinkV1({
      ...base,
      evidence: {
        contentHashCandidatePacketKeys: [
          'pkt_cccccccccccccccccccccccccccccccc',
          'pkt_dddddddddddddddddddddddddddddddd',
        ],
      },
    });
    const unresolved = deriveAtlasChunkPacketIdentityLinkV1({ ...base, evidence: {} });
    expect(ambiguous.matchMethod).toBe('AMBIGUOUS');
    expect(ambiguous.admission).toBe('QUARANTINED');
    expect(unresolved.matchMethod).toBe('UNRESOLVED');
    expect(unresolved.canonicalPacketKey).toBeNull();
    expect(unresolved.admission).toBe('QUARANTINED');
  });
});
