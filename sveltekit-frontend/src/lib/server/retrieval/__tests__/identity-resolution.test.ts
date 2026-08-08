import { describe, expect, it } from 'vitest';

import { resolveCanonicalIdentity } from '../identity-resolution.js';

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
    ).toEqual({ canonicalId: 'src/foo.ts', source: 'source_ref', status: 'canonical' });
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
    ).toEqual({ canonicalId: 'chash:abc123', source: 'content_hash', status: 'canonical' });
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
