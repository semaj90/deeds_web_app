import { describe, expect, it } from 'vitest';
import { PacketRepresentationManifestV1Schema } from './packet-representation-manifest-v1.js';

const manifest = {
  schema: 'atlas.packet-representation.v1' as const,
  packetKey: 'packet:650e8400-e29b-51d4-a716-446655440000',
  titleId: 'title:1234abcd',
  packetRevisionId: '0199b410-7c00-7000-8000-000000000001',
  sourceRef: 'src/example.ts',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
  representationId: 'semantic_768',
  representationRevision: 'embeddinggemma:sha256:abc',
  artifactManifestId: 'artifact-manifest-1',
  artifactManifestChecksum: `sha256:${'c'.repeat(64)}`,
  codec: 'raw-f32-le' as const,
  byteOrder: 'little-endian' as const,
  dtype: 'float32' as const,
  shape: [768],
  stridesBytes: [4],
  byteLength: 3072,
  contentDigest: `sha256:${'d'.repeat(64)}`,
  storage: { kind: 'immutable-artifact-ref' as const, ref: 'artifact://semantic/packet-1' },
  executorAllowlist: ['cpu-simd', 'pytorch'] as const,
  canonicalAuthority: false as const,
};

describe('PacketRepresentationManifestV1Schema', () => {
  it('accepts a packet-bound semantic_768 raw FP32 representation reference', () => {
    expect(PacketRepresentationManifestV1Schema.parse(manifest).byteLength).toBe(3072);
  });

  it('rejects a wrong semantic dimension, revision ID version, or raw byte extent', () => {
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, shape: [767], byteLength: 3068 }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, packetRevisionId: '0199b410-7c00-5000-8000-000000000001' }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, byteLength: 3071 }).success).toBe(false);
  });

  it('rejects inconsistent codec, byte order, and stride rank', () => {
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, dtype: 'float16' }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, byteOrder: 'big-endian' }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, stridesBytes: [4, 4] }).success).toBe(false);
  });

  it('rejects mutable storage and canonical-authority claims', () => {
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, storage: { kind: 'redis', ref: 'cache:key' } }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, canonicalAuthority: true }).success).toBe(false);
  });

  it('requires explicit calibration metadata for raw INT8 and rejects it on FP32', () => {
    const int8Manifest = {
      ...manifest,
      representationId: 'latent_64_int8',
      codec: 'raw-i8' as const,
      byteOrder: 'not-applicable' as const,
      dtype: 'int8' as const,
      shape: [768],
      stridesBytes: [1],
      byteLength: 768,
      quantization: {
        scheme: 'symmetric-per-tensor-int8' as const,
        scale: 0.0125,
        zeroPoint: 0 as const,
        inputDtype: 'float32' as const,
        calibrationChecksum: `sha256:${'e'.repeat(64)}`,
      },
    };

    expect(PacketRepresentationManifestV1Schema.safeParse(int8Manifest).success).toBe(true);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...int8Manifest, quantization: undefined }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({
      ...int8Manifest,
      quantization: { ...int8Manifest.quantization, scale: 0 },
    }).success).toBe(false);
    expect(PacketRepresentationManifestV1Schema.safeParse({ ...manifest, quantization: int8Manifest.quantization }).success).toBe(false);
  });
});
