import { describe, expect, it } from 'vitest';

import { resolveCanonicalIdentity, resolveCanonicalIdentityV2 } from '../identity-resolution.js';

describe('resolveCanonicalIdentity', () => {
  it('prefers symbol_version_id over everything else', () => {
    expect(
      resolveCanonicalIdentity({
        symbolVersionId: 'sym:v2',
        packetKey: 'pkt:1',
        sourceRef: 'src/foo.ts',
        fallbackId: 'qdrant-point-abc',
      })
    ).toEqual({ canonicalId: 'sym:v2', source: 'symbol_version_id', status: 'canonical' });
  });

  it('falls back to packet_key when symbol_version_id is absent', () => {
    expect(
      resolveCanonicalIdentity({
        packetKey: 'pkt:1',
        sourceRef: 'src/foo.ts',
        fallbackId: 'qdrant-point-abc',
      })
    ).toEqual({ canonicalId: 'pkt:1', source: 'packet_key', status: 'canonical' });
  });

  it('falls back to source_ref when symbol_version_id and packet_key are absent', () => {
    expect(
      resolveCanonicalIdentity({ sourceRef: 'src/foo.ts', fallbackId: 'qdrant-point-abc' })
    ).toEqual({ canonicalId: 'src/foo.ts', source: 'source_ref', status: 'source_group' });
  });

  it('prefers content_hash over source_ref — closes the multi-chunk-per-file over-merge risk', () => {
    // Live-data-confirmed regression: 23 distinct Qdrant chunks of one file shared a single
    // source_ref. content_hash is chunk-unique where source_ref is not, so it must win.
    expect(
      resolveCanonicalIdentity({
        contentHash: 'chash:abc123',
        sourceRef: 'src/foo.ts', // shared by many other chunks of the same file
        fallbackId: 'qdrant-point-abc',
      })
    ).toEqual({ canonicalId: 'chash:abc123', source: 'content_hash', status: 'projection_exact' });
  });

  it('content_hash sits below packet_key (weaker guarantee: changes when content changes)', () => {
    expect(
      resolveCanonicalIdentity({
        packetKey: 'pkt:1',
        contentHash: 'chash:abc123',
        fallbackId: 'qdrant-point-abc',
      })
    ).toEqual({ canonicalId: 'pkt:1', source: 'packet_key', status: 'canonical' });
  });

  it('falls back to the lane-local id, marked degraded, when no canonical field exists', () => {
    expect(resolveCanonicalIdentity({ fallbackId: 'qdrant-point-abc' })).toEqual({
      canonicalId: 'qdrant-point-abc',
      source: 'lane_id_fallback',
      status: 'degraded',
    });
  });

  it('treats blank-string fields as absent, not present', () => {
    expect(
      resolveCanonicalIdentity({
        symbolVersionId: '   ',
        packetKey: '',
        sourceRef: undefined,
        fallbackId: 'qdrant-point-abc',
      })
    ).toEqual({ canonicalId: 'qdrant-point-abc', source: 'lane_id_fallback', status: 'degraded' });
  });

  it('never returns the fallback id as canonical when a real identity field exists', () => {
    // Negative assertion: a projection id must never masquerade as canonical.
    const resolved = resolveCanonicalIdentity({
      packetKey: 'pkt:1',
      fallbackId: 'qdrant-point-abc',
    });
    expect(resolved.status).toBe('canonical');
    expect(resolved.canonicalId).not.toBe('qdrant-point-abc');
  });
});

const QUALIFIED_HASH_CONTRACT = {
  hashAlgorithm: 'sha256',
  hashDomain: 'source-chunk-bytes',
  producerRevision: 'graphify-chunker:v3',
};

describe('resolveCanonicalIdentityV2 (RF-IDENTITY-SEMANTICS-02)', () => {
  it('resolves symbol_version_id as CANONICAL', () => {
    expect(
      resolveCanonicalIdentityV2({ symbolVersionId: 'sym:v2', laneId: 'qdrant-point-abc' }),
    ).toEqual({
      key: 'sym:v2',
      resolutionStatus: 'CANONICAL',
      identitySource: 'symbol_version_id',
      canonicalEntityId: 'sym:v2',
    });
  });

  it('resolves packet_key as CANONICAL when symbol_version_id is absent', () => {
    expect(
      resolveCanonicalIdentityV2({ packetKey: 'pkt:1', laneId: 'qdrant-point-abc' }),
    ).toEqual({
      key: 'pkt:1',
      resolutionStatus: 'CANONICAL',
      identitySource: 'packet_key',
      packetKey: 'pkt:1',
    });
  });

  it('consumes a hydrated canonical_chunk_id as CANONICAL when present', () => {
    expect(
      resolveCanonicalIdentityV2({
        canonicalChunkId: 'card:src/foo.ts:abc123',
        sourceRef: 'src/foo.ts',
        laneId: 'qdrant-point-abc',
      }),
    ).toEqual({
      key: 'card:src/foo.ts:abc123',
      resolutionStatus: 'CANONICAL',
      identitySource: 'canonical_chunk_id',
      canonicalChunkId: 'card:src/foo.ts:abc123',
    });
  });

  it('never reconstructs canonical_chunk_id from content_hash/source_ref/laneId — absent means absent', () => {
    // Negative assertion: the resolver must not synthesize a canonical_chunk_id from any other
    // field. With no canonicalChunkId supplied, a qualified content_hash still only reaches
    // PROJECTION_EXACT, never CANONICAL, and canonicalChunkId is never populated on the result.
    const resolved = resolveCanonicalIdentityV2({
      contentHash: 'chash:abc123',
      hashContract: QUALIFIED_HASH_CONTRACT,
      sourceRef: 'src/foo.ts',
      laneId: 'qdrant-point-abc',
    });
    expect(resolved.resolutionStatus).toBe('PROJECTION_EXACT');
    expect(resolved.canonicalChunkId).toBeUndefined();
  });

  it('resolves a qualified content_hash as PROJECTION_EXACT, not CANONICAL', () => {
    expect(
      resolveCanonicalIdentityV2({
        contentHash: 'chash:abc123',
        hashContract: QUALIFIED_HASH_CONTRACT,
        laneId: 'qdrant-point-abc',
      }),
    ).toEqual({
      key: 'chash:abc123',
      resolutionStatus: 'PROJECTION_EXACT',
      identitySource: 'content_hash',
    });
  });

  it('does NOT trust an unqualified content_hash as PROJECTION_EXACT (HASH_EVIDENCE_UNQUALIFIED falls through)', () => {
    // This is the safeguard against conflating hash domains -- a bare hash with no
    // hashAlgorithm/hashDomain/producerRevision proof must not be treated as exact-projection
    // evidence. It falls through to source_ref (SOURCE_GROUP) here since one is present.
    expect(
      resolveCanonicalIdentityV2({
        contentHash: 'chash:abc123',
        sourceRef: 'src/foo.ts',
        laneId: 'qdrant-point-abc',
      }),
    ).toEqual({
      key: 'src/foo.ts',
      resolutionStatus: 'SOURCE_GROUP',
      identitySource: 'source_ref',
    });
  });

  it('does NOT trust a partially-qualified hash contract (missing producerRevision)', () => {
    expect(
      resolveCanonicalIdentityV2({
        contentHash: 'chash:abc123',
        hashContract: { hashAlgorithm: 'sha256', hashDomain: 'source-chunk-bytes', producerRevision: '' },
        laneId: 'qdrant-point-abc',
      }).resolutionStatus,
    ).toBe('DEGRADED');
  });

  it('resolves a bare source_ref as SOURCE_GROUP, never CANONICAL', () => {
    expect(
      resolveCanonicalIdentityV2({ sourceRef: 'src/foo.ts', laneId: 'qdrant-point-abc' }),
    ).toEqual({
      key: 'src/foo.ts',
      resolutionStatus: 'SOURCE_GROUP',
      identitySource: 'source_ref',
    });
  });

  it('falls back to the lane id, marked DEGRADED, when nothing else resolves', () => {
    expect(resolveCanonicalIdentityV2({ laneId: 'qdrant-point-abc' })).toEqual({
      key: 'qdrant-point-abc',
      resolutionStatus: 'DEGRADED',
      identitySource: 'lane_id',
    });
  });

  it('carries evidenceRefs through when supplied', () => {
    const resolved = resolveCanonicalIdentityV2({
      packetKey: 'pkt:1',
      laneId: 'qdrant-point-abc',
      evidenceRefs: ['docs/reports/example.json'],
    });
    expect(resolved.evidenceRefs).toEqual(['docs/reports/example.json']);
  });
});
