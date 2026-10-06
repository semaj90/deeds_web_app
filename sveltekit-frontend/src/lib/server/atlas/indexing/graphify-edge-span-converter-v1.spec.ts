// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSourceLineIndexV1, convertChunkerSpanToByteRowV1 } from './graphify-edge-span-converter-v1.js';

const span = (startLine: number, startColumn: number, endLine: number, endColumn: number) => ({ startLine, startColumn, endLine, endColumn });
const bytes = (s: string) => Buffer.from(s, 'utf8');

describe('convertChunkerSpanToByteRowV1', () => {
  it('converts ASCII spans and the byte slice equals the source slice', () => {
    const src = 'const a = 1;\nexport type T = { x: string };\n';
    const r = convertChunkerSpanToByteRowV1(buildSourceLineIndexV1(src), span(2, 7, 2, 30));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(bytes(src).subarray(r.span.startByte, r.span.endByte).toString('utf8')).toBe('type T = { x: string };');
      expect(r.span.startRow).toBe(1);
      expect(r.span.endRow).toBe(1);
    }
  });

  it('treats columns as code points: emoji line matches the live chunker observation (8 -> byte 11, end 40 -> byte 43)', () => {
    const src = '/* \u{1F600} */ export type Tee = { a: string };\n';
    const r = convertChunkerSpanToByteRowV1(buildSourceLineIndexV1(src), span(1, 8, 1, 40));
    expect(r).toEqual({ ok: true, span: { startByte: 11, endByte: 43, startRow: 0, endRow: 0 } });
    if (r.ok) expect(bytes(src).subarray(r.span.startByte, r.span.endByte).toString('utf8')).toBe('export type Tee = { a: string };');
  });

  it('handles BMP multibyte characters and offsets across earlier lines', () => {
    const src = '// é→\nexport const z = 1;\n';
    const idx = buildSourceLineIndexV1(src);
    const r = convertChunkerSpanToByteRowV1(idx, span(2, 0, 2, 19));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(bytes(src).subarray(r.span.startByte, r.span.endByte).toString('utf8')).toBe('export const z = 1;');
      expect(r.span.startByte).toBe(Buffer.byteLength('// é→\n'));
    }
  });

  it('spans multiple lines, keeps CR inside its line, and allows end-of-line columns', () => {
    const src = 'type A = {\r\n  b: string;\r\n};\r\n';
    const r = convertChunkerSpanToByteRowV1(buildSourceLineIndexV1(src), span(1, 0, 3, 2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(bytes(src).subarray(r.span.startByte, r.span.endByte).toString('utf8')).toBe('type A = {\r\n  b: string;\r\n};');
      expect([r.span.startRow, r.span.endRow]).toEqual([0, 2]);
    }
  });

  it('fails closed with named reasons instead of guessing', () => {
    const idx = buildSourceLineIndexV1('abc\n');
    expect(convertChunkerSpanToByteRowV1(idx, span(0, 0, 1, 1))).toEqual({ ok: false, reason: 'LINE_OUT_OF_RANGE' });
    expect(convertChunkerSpanToByteRowV1(idx, span(1, 0, 9, 0))).toEqual({ ok: false, reason: 'LINE_OUT_OF_RANGE' });
    expect(convertChunkerSpanToByteRowV1(idx, span(1, 0, 1, 99))).toEqual({ ok: false, reason: 'COLUMN_OUT_OF_RANGE' });
    expect(convertChunkerSpanToByteRowV1(idx, span(1, 2, 1, 1))).toEqual({ ok: false, reason: 'END_BEFORE_START' });
    expect(convertChunkerSpanToByteRowV1(idx, span(1, -1, 1, 1))).toEqual({ ok: false, reason: 'INVALID_SPAN_NUMBERS' });
    expect(convertChunkerSpanToByteRowV1(idx, span(1, 0.5, 1, 1))).toEqual({ ok: false, reason: 'INVALID_SPAN_NUMBERS' });
  });

  it('is deterministic and the index total equals the UTF-8 length', () => {
    const src = 'a\u{1F600}\né\n';
    const i1 = buildSourceLineIndexV1(src);
    expect(i1.totalBytes).toBe(Buffer.byteLength(src));
    expect(convertChunkerSpanToByteRowV1(i1, span(1, 0, 2, 1))).toEqual(convertChunkerSpanToByteRowV1(buildSourceLineIndexV1(src), span(1, 0, 2, 1)));
  });
});
