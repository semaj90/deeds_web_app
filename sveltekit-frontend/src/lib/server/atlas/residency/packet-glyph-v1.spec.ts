import { describe, expect, it } from 'vitest';
import { PacketGlyphV1Schema, ResidencySortKeyV1Schema } from './packet-glyph-v1.js';

const validGlyph = {
  projectionOrdinal: 12345,
  featureBits: 42,
  lod: 3,
  residency: 1,
  pagerankQuantized: 900,
  recency: 60,
  somCell: 17,
  flags: 0,
};

describe('PacketGlyphV1Schema', () => {
  it('parses a valid glyph within all declared bit-width bounds', () => {
    expect(PacketGlyphV1Schema.parse(validGlyph)).toEqual(validGlyph);
  });

  it('rejects a field exceeding its declared bit-width ceiling', () => {
    expect(() => PacketGlyphV1Schema.parse({ ...validGlyph, featureBits: 65536 })).toThrow();
  });

  it('rejects an unknown field because the schema is strict', () => {
    expect(() =>
      PacketGlyphV1Schema.parse({ ...validGlyph, packetKey: 'ace:packet:should-not-exist' }),
    ).toThrow();
  });
});

describe('ResidencySortKeyV1Schema', () => {
  const validKey = {
    tier: 0,
    lod: 1,
    utilityBucket: 5,
    recencyBucket: 2,
    projectionOrdinal: 12345,
  };

  it('parses a valid sort key with no identity field present', () => {
    const parsed = ResidencySortKeyV1Schema.parse(validKey);
    expect(parsed).toEqual(validKey);
    expect('packetKey' in parsed).toBe(false);
  });

  it('rejects a sort key carrying a packetKey field', () => {
    expect(() =>
      ResidencySortKeyV1Schema.parse({ ...validKey, packetKey: 'ace:packet:should-not-exist' }),
    ).toThrow();
  });

  it('produces identical output for identical inputs (deterministic)', () => {
    const a = ResidencySortKeyV1Schema.parse(validKey);
    const b = ResidencySortKeyV1Schema.parse({ ...validKey });
    expect(a).toEqual(b);
  });
});
