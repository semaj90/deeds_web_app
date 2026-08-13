import { describe, expect, it } from 'vitest';

import { buildAcePacketVector } from './ace-packet-vector.js';

describe('ace-packet-vector', () => {
  it('builds a deterministic packet vector', () => {
    const latent64 = new Float32Array(Array.from({ length: 64 }, (_, i) => i + 1));
    const centroid64 = new Float32Array(Array.from({ length: 64 }, (_, i) => 64 - i));

    const a = buildAcePacketVector(
      { packetKey: 'packet:1', representationId: 'semantic_768', cluster_id: 42 },
      latent64,
      centroid64,
    );
    const b = buildAcePacketVector(
      { packet_key: 'packet:1', representation_id: 'semantic_768', cluster: { id: 42 } },
      latent64,
      centroid64,
    );

    expect(a).toEqual(b);
    expect(a.packetKey).toBe('packet:1');
    expect(a.latent64).toHaveLength(64);
    expect(a.centroid64).toHaveLength(64);
  });
});
