import { describe, expect, it } from 'vitest';
import { resolveCanonicalHyperRagPacketIdentity } from './hyperrag-packet-rpc.js';

describe('HyperRAG canonical packet identity boundary', () => {
  it('accepts only packet_key plus source_ref owned by the canonical row', () => {
    expect(resolveCanonicalHyperRagPacketIdentity({
      packet_key: 'packet:nes:001',
      source_ref: 'repo:main:src/nes/001.json',
      id: 'qdrant-point-1',
    })).toEqual({
      packetKey: 'packet:nes:001',
      sourceRef: 'repo:main:src/nes/001.json',
    });
  });

  it('rejects a Qdrant or transport ID when canonical packet identity is absent', () => {
    expect(resolveCanonicalHyperRagPacketIdentity({
      id: 'qdrant-point-1',
      source_ref: 'repo:main:src/nes/001.json',
    })).toBeNull();
  });

  it('rejects a source path or array-only result without packet identity', () => {
    expect(resolveCanonicalHyperRagPacketIdentity({
      file_path: 'src/nes/001.json',
      rowIndex: 0,
    })).toBeNull();
  });
});
