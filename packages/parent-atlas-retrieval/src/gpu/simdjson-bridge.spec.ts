import { describe, expect, it } from 'vitest';
import {
  clearSimdjsonCache,
  fastJsonParse,
  getSimdStats,
  utf8ByteLength,
} from './simdjson-bridge.js';

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
});
