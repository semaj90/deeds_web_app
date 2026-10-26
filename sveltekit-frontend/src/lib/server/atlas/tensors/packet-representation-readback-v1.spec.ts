import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPacketRepresentationReadbackV1 } from './packet-representation-readback-v1.js';

const bytes = new Uint8Array([1, 2, 3, 4]);
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const manifest = {
  schema: 'atlas.packet-representation.v1',
  packetKey: 'packet:123e4567-e89b-52d3-a456-426614174000',
  titleId: 'title:sample',
  packetRevisionId: '123e4567-e89b-72d3-a456-426614174000',
  sourceRef: 'src:sample',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
  representationId: 'sample-bytes',
  representationRevision: 'representation:rev-1',
  artifactManifestId: 'artifact-manifest:sample',
  artifactManifestChecksum: `sha256:${'c'.repeat(64)}`,
  codec: 'raw-i8',
  byteOrder: 'not-applicable',
  dtype: 'int8',
  shape: [4],
  stridesBytes: [1],
  byteLength: bytes.byteLength,
  contentDigest: digest,
  quantization: {
    scheme: 'symmetric-per-tensor-int8',
    scale: 0.01,
    zeroPoint: 0,
    inputDtype: 'float32',
    calibrationChecksum: `sha256:${'e'.repeat(64)}`,
  },
  storage: { kind: 'immutable-artifact-ref', ref: 'artifact://sample' },
  executorAllowlist: ['cpu-simd'],
  canonicalAuthority: false,
} as const;
const expected = {
  packetKey: manifest.packetKey,
  packetRevisionId: manifest.packetRevisionId,
  sourceRevision: manifest.sourceRevision,
  workspaceRevision: manifest.workspaceRevision,
  representationRevision: manifest.representationRevision,
};

describe('packet representation readback verification', () => {
  it('verifies exact identity, revision, byte length, and checksum', () => {
    const result = verifyPacketRepresentationReadbackV1({ manifest, expected, bytes, maximumBytes: 64 });
    expect(result.status).toBe('VERIFIED');
    if (result.status === 'VERIFIED') {
      expect(result.receipt.contentDigest).toBe(digest);
      expect(result.receipt.canonicalAuthority).toBe(false);
    }
  });

  it('rejects stale packet or representation revisions before admitting bytes', () => {
    const result = verifyPacketRepresentationReadbackV1({
      manifest,
      expected: { ...expected, representationRevision: 'representation:stale' },
      bytes,
      maximumBytes: 64,
    });
    expect(result.status).toBe('STALE_REVISION');
  });

  it('rejects missing artifacts, oversized artifacts, and length mismatches', () => {
    expect(verifyPacketRepresentationReadbackV1({ manifest, expected, bytes: null, maximumBytes: 64 }).status).toBe('NOT_FOUND');
    expect(verifyPacketRepresentationReadbackV1({ manifest, expected, bytes, maximumBytes: 3 }).status).toBe('BYTE_BUDGET_EXCEEDED');
    expect(verifyPacketRepresentationReadbackV1({ manifest, expected, bytes: new Uint8Array([1]), maximumBytes: 64 }).status).toBe('BYTE_LENGTH_MISMATCH');
  });

  it('rejects altered content and unsupported encodings', () => {
    expect(verifyPacketRepresentationReadbackV1({ manifest, expected, bytes: new Uint8Array([4, 3, 2, 1]), maximumBytes: 64 }).status).toBe('DIGEST_MISMATCH');
    expect(verifyPacketRepresentationReadbackV1({ manifest: { ...manifest, codec: 'svg-utf8' }, expected, bytes, maximumBytes: 64 }).status).toBe('UNSUPPORTED_CODEC');
  });
});
