import { describe, expect, it } from 'vitest';
import {
  buildPacketClassLutV1,
  lutEncode,
  lutDecode,
  isLutRevisionCurrent,
} from './packet-class-lut-v1.js';

describe('LUT-REGISTRY-ALIGN-01: Compressed Packets & LUT Presentation Verification', () => {
  it('integrates PacketClassLutV1 as a presentation projection over index lanes', () => {
    const laneLabels = ['source', 'dependency', 'config', 'test', 'generated', 'doc'];
    const laneLut = buildPacketClassLutV1(laneLabels);

    expect(laneLut.canonicalAuthority).toBe(false);
    expect(laneLut.entries).toHaveLength(6);

    // Encode and decode round-trip
    for (const lane of laneLabels) {
      const code = lutEncode(laneLut, lane);
      expect(code).not.toBeNull();
      const decoded = lutDecode(laneLut, code!);
      expect(decoded).toBe(lane);
    }

    // Proves drift detection if vocabulary changes
    expect(isLutRevisionCurrent(laneLut, laneLabels)).toBe(true);
    expect(isLutRevisionCurrent(laneLut, [...laneLabels, 'benchmark'])).toBe(false);
  });

  it('proves compressed packet integer codes are projection addresses, not canonical IDs', () => {
    const canonicalEntities = [
      { sourceRef: 'src/lib/server/auth.ts', featureId: 'auth:session' },
      { sourceRef: 'src/lib/server/db/client.ts', featureId: 'db:pool' },
    ];

    const featureLut = buildPacketClassLutV1(canonicalEntities.map((e) => e.featureId));

    // Simulated compressed packet
    const compressedPacket = {
      s: 4182, // integer dictionary address
      f: lutEncode(featureLut, 'db:pool'),
    };

    expect(compressedPacket.f).not.toBeNull();
    // Decodes back to canonical featureId
    expect(lutDecode(featureLut, compressedPacket.f!)).toBe('db:pool');
    // LUT asserts non-canonical authority
    expect(featureLut.canonicalAuthority).toBe(false);
  });
});
