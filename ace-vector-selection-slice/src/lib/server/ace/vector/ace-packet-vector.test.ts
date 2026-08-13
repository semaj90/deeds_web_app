import { describe, expect, it } from 'vitest';
import {
  ACE_LATENT_DIM,
  buildAcePacketVector,
} from './ace-packet-vector';

function vector(fill: number): Float32Array {
  return new Float32Array(ACE_LATENT_DIM).fill(fill);
}

describe('ace-packet-vector', () => {
  it('builds a bounded vector without mutating canonical packet identity', () => {
    const packet = Object.freeze({
      packetKey: 'ace:cluster:0:source-r1',
      representationId: 'cluster:0',
      cluster: { id: 0 },
    });

    const latent64 = vector(0.25);
    const centroid64 = vector(0.5);

    const result = buildAcePacketVector(
      packet,
      latent64,
      centroid64,
    );

    expect(result.packetKey).toBe(packet.packetKey);
    expect(result.representationId).toBe(packet.representationId);
    expect(result.clusterId).toBe(0);
    expect(result.latent64).not.toBe(latent64);
    expect(result.centroid64).not.toBe(centroid64);
  });

  it('rejects non-64-dimensional latent vectors', () => {
    expect(() =>
      buildAcePacketVector(
        { packetKey: 'ace:cluster:0:r1' },
        new Float32Array(63),
      ),
    ).toThrow(/exactly 64/i);
  });
});
