import { describe, expect, it } from 'vitest';
import {
  buildPacketClassLutV1,
  lutEncode,
  lutDecode,
  isLutRevisionCurrent,
  DuplicateLutLabelError,
  LutOverflowError,
  EmptyLutLabelSetError,
  PacketClassLutV1Schema,
} from './packet-class-lut-v1.js';

describe('PACKET-CLASS-LUT-01', () => {
  it('builds a valid LUT that passes its own strict schema', () => {
    const lut = buildPacketClassLutV1(['alpha', 'beta', 'gamma']);
    expect(PacketClassLutV1Schema.safeParse(lut).success).toBe(true);
    expect(lut.canonicalAuthority).toBe(false);
    expect(lut.entries).toHaveLength(3);
  });

  it('is deterministic regardless of input order', () => {
    const a = buildPacketClassLutV1(['zeta', 'alpha', 'mu']);
    const b = buildPacketClassLutV1(['mu', 'zeta', 'alpha']);
    expect(a.encodingRevision).toBe(b.encodingRevision);
    expect(a.sourceLabelSetChecksum).toBe(b.sourceLabelSetChecksum);
    expect(a.entries).toEqual(b.entries);
  });

  it('assigns codes 0..N-1 in lexicographic order', () => {
    const lut = buildPacketClassLutV1(['zebra', 'apple', 'mango']);
    expect(lut.entries).toEqual([
      { label: 'apple', code: 0 },
      { label: 'mango', code: 1 },
      { label: 'zebra', code: 2 },
    ]);
  });

  it('round-trips encode -> decode for every entry', () => {
    const labels = ['error-handling', 'compiler', 'machine-learning', 'retrieval'];
    const lut = buildPacketClassLutV1(labels);
    for (const label of labels) {
      const code = lutEncode(lut, label);
      expect(code).not.toBeNull();
      expect(lutDecode(lut, code as number)).toBe(label);
    }
  });

  it('returns null for a label or code not present in the LUT', () => {
    const lut = buildPacketClassLutV1(['a', 'b']);
    expect(lutEncode(lut, 'not-in-lut')).toBeNull();
    expect(lutDecode(lut, 250)).toBeNull();
  });

  it('rejects an empty label set', () => {
    expect(() => buildPacketClassLutV1([])).toThrow(EmptyLutLabelSetError);
  });

  it('rejects duplicate labels rather than silently deduping', () => {
    expect(() => buildPacketClassLutV1(['a', 'b', 'a'])).toThrow(DuplicateLutLabelError);
  });

  it('rejects a label set exceeding one-byte capacity (256)', () => {
    const tooMany = Array.from({ length: 257 }, (_, i) => `label-${i}`);
    expect(() => buildPacketClassLutV1(tooMany)).toThrow(LutOverflowError);
  });

  it('accepts exactly 256 labels (the one-byte ceiling)', () => {
    const exactly256 = Array.from({ length: 256 }, (_, i) => `label-${i}`);
    const lut = buildPacketClassLutV1(exactly256);
    expect(lut.entries).toHaveLength(256);
    expect(lut.entries[255].code).toBe(255);
  });

  it('isLutRevisionCurrent detects a matching label set', () => {
    const labels = ['x', 'y', 'z'];
    const lut = buildPacketClassLutV1(labels);
    expect(isLutRevisionCurrent(lut, labels)).toBe(true);
    expect(isLutRevisionCurrent(lut, [...labels].reverse())).toBe(true);
  });

  it('isLutRevisionCurrent detects drift when the label set changes', () => {
    const lut = buildPacketClassLutV1(['x', 'y', 'z']);
    expect(isLutRevisionCurrent(lut, ['x', 'y', 'z', 'w'])).toBe(false); // added
    expect(isLutRevisionCurrent(lut, ['x', 'y'])).toBe(false); // removed
    expect(isLutRevisionCurrent(lut, ['x', 'y', 'w'])).toBe(false); // renamed
  });

  it('isLutRevisionCurrent returns false (not throws) for an invalid comparison set', () => {
    const lut = buildPacketClassLutV1(['x', 'y']);
    expect(isLutRevisionCurrent(lut, [])).toBe(false);
    expect(isLutRevisionCurrent(lut, ['x', 'x'])).toBe(false);
  });
});
