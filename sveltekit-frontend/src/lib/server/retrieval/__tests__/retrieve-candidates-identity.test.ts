import { describe, expect, it } from 'vitest';

import { deriveIdentity } from '../retrieve-candidates.js';

describe('deriveIdentity', () => {
  it('promotes content_hash over source_ref and preserves raw identity metadata', () => {
    const resolved = deriveIdentity({
      symbolVersionId: '   ',
      packetKey: '',
      contentHash: 'hash:abc123',
      sourceRef: 'src/foo.ts',
      fallbackId: 'qdrant-point-abc',
    });

    expect(resolved).toEqual({
      packetKey: 'hash:abc123',
      symbolVersionId: 'hash:abc123',
      symbol_version_id: null,
      packet_key: null,
      source_ref: 'src/foo.ts',
      content_hash: 'hash:abc123',
      fallback_id: 'qdrant-point-abc',
      identityStatus: 'canonical',
      identitySource: 'content_hash',
    });
  });

  it('marks the lane-local fallback as degraded when no canonical identity exists', () => {
    const resolved = deriveIdentity({
      fallbackId: 'qdrant-point-abc',
    });

    expect(resolved).toEqual({
      packetKey: 'qdrant-point-abc',
      symbolVersionId: 'qdrant-point-abc',
      symbol_version_id: null,
      packet_key: null,
      source_ref: null,
      content_hash: null,
      fallback_id: 'qdrant-point-abc',
      identityStatus: 'degraded',
      identitySource: 'lane_id_fallback',
    });
  });
});
