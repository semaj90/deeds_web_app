import { describe, expect, it } from 'vitest';
import { AtlasCustomRpcPacketV1Schema } from './atlas-custom-rpc-packet-v1.js';

const base = {
  schema: 'atlas.rpc.packet.v1' as const,
  registry: {
    packetKey: 'packet:650e8400-e29b-51d4-a716-446655440000',
    titleId: 'title:1234abcd',
    title: 'Source Coordinate Map',
    packetClass: 'AST_COORDINATE_CONVERTER',
    lutEncodingRevision: `sha256:${'a'.repeat(64)}`,
    lutCode: 4,
  },
  lineage: {
    sourceRef: 'src/lib/example.ts',
    sourceRevision: `sha256:${'b'.repeat(64)}`,
    workspaceRevision: `sha256:${'c'.repeat(64)}`,
  },
  callerId: 'atlas-worker-test',
  rpcCallId: '0199b410-7c00-7000-8000-000000000001',
  executionId: '0199b410-7c00-7000-8000-000000000004',
  idempotencyKey: 'call-scope:key-1',
  requestDigest: '1'.repeat(64),
};

describe('AtlasCustomRpcPacketV1Schema', () => {
  it('accepts packet identity and title/LUT as separate fields', () => {
    const packet = AtlasCustomRpcPacketV1Schema.parse({ ...base, operation: 'GET' });
    expect(packet.registry.packetKey).toContain('packet:');
    expect(packet.registry.titleId).toBe('title:1234abcd');
  });

  it('requires a bounded read-only search request', () => {
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, operation: 'SEARCH', search: { query: 'coordinates', limit: 20 } }).success).toBe(true);
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, operation: 'SEARCH', search: { query: 'x', limit: 101 } }).success).toBe(false);
  });

  it('requires UUIDv7 mutation event and expected revision for patch', () => {
    const mutation = { eventId: '0199b410-7c00-7000-8000-000000000002', patchArtifactRef: 'artifact://patch/1', patchDigest: 'd'.repeat(64), schemaRef: 'atlas.packet.patch', schemaRevision: 'v1' };
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, operation: 'PATCH', expectedRevisionId: '0199b410-7c00-7000-8000-000000000003', mutation }).success).toBe(true);
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, operation: 'PATCH', expectedRevisionId: 'not-v7', mutation }).success).toBe(false);
  });

  it('rejects a partial LUT mapping and mutation fields on SEARCH', () => {
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, registry: { ...base.registry, lutCode: null }, operation: 'GET' }).success).toBe(false);
    expect(AtlasCustomRpcPacketV1Schema.safeParse({ ...base, operation: 'SEARCH', search: { query: 'x', limit: 1 }, mutation: {} }).success).toBe(false);
  });

  it('keeps Torch analysis proposal-only and artifact-reference based', () => {
    const parsed = AtlasCustomRpcPacketV1Schema.parse({
      ...base,
      operation: 'ANALYZE',
      analysis: { algorithm: 'PCA_LOW_RANK', inputArtifactRef: 'artifact://matrix/1', inputManifestChecksum: 'e'.repeat(64), parametersChecksum: 'f'.repeat(64), writePolicy: 'PROPOSAL_ONLY' },
    });
    expect(parsed.operation).toBe('ANALYZE');
  });
});
