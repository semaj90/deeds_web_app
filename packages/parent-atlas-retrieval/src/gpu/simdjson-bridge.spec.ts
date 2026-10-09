import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import {
  clearSimdjsonCache,
  fastJsonParse,
  getSimdStats,
  utf8ByteLength,
} from './simdjson-bridge.js';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

describe('simdjson UTF-8 byte accounting', () => {
  it('counts transport bytes rather than JavaScript UTF-16 code units', () => {
    expect('😀'.length).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('π')).toBe(2);
    expect(utf8ByteLength('NES\r\nCHR')).toBe(8);
  });

  it('records parsed payload size in UTF-8 bytes', () => {
    clearSimdjsonCache();
    const before = getSimdStats().totalBytesParsed;
    const payload = JSON.stringify({ glyph: '😀', text: 'π' });

    expect(fastJsonParse(payload)).toEqual({ glyph: '😀', text: 'π' });
    expect(getSimdStats().totalBytesParsed - before).toBe(utf8ByteLength(payload));
  });

  it('preserves typed JSON semantics for a payload above the native threshold', () => {
    clearSimdjsonCache();
    const before = getSimdStats();
    const expected = {
      glyph: '😀π',
      records: Array.from({ length: 48 }, (_, index) => ({
        index,
        enabled: index % 2 === 0,
        nullable: index % 3 === 0 ? null : `value-${index}`,
        roles: ['SOURCE', 'OUTPUT'],
      })),
    };
    const payload = JSON.stringify(expected);
    expect(utf8ByteLength(payload)).toBeGreaterThan(1024);

    expect(fastJsonParse(payload)).toEqual(JSON.parse(payload));

    const after = getSimdStats();
    if (process.env.SIMDJSON_REQUIRE_NATIVE === '1') {
      expect(after.nativeParses).toBe(before.nativeParses + 1);
    } else {
      expect(after.nativeParses + after.fallbackParses).toBeGreaterThan(
        before.nativeParses + before.fallbackParses,
      );
    }
  });

  it('rejects malformed JSON instead of accepting a parser-specific result', () => {
    expect(() => fastJsonParse('{"records":[1,]}')).toThrow();
  });

  it('produces the same canonical checksum as the standard parser', () => {
    clearSimdjsonCache();
    const before = getSimdStats();
    const expected = {
      z: [null, true, 9],
      a: { text: 'π😀' },
      records: Array.from({ length: 48 }, (_, index) => ({
        index,
        enabled: index % 2 === 0,
        nullable: index % 3 === 0 ? null : `value-${index}`,
      })),
    };
    const payload = JSON.stringify(expected);
    expect(utf8ByteLength(payload)).toBeGreaterThan(1024);
    const standard = JSON.parse(payload);
    const native = fastJsonParse(payload);
    const checksum = (value: unknown) =>
      createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

    expect(checksum(native)).toBe(checksum(standard));
    const after = getSimdStats();
    if (process.env.SIMDJSON_REQUIRE_NATIVE === '1') {
      expect(after.nativeParses).toBe(before.nativeParses + 1);
    } else {
      expect(after.nativeParses + after.fallbackParses).toBeGreaterThan(
        before.nativeParses + before.fallbackParses,
      );
    }
  });
});
