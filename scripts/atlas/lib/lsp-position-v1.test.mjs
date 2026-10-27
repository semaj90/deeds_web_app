import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLineIndex, positionToByteOffset, byteOffsetToPosition, rangeToVerifiedByteSpan, LspPositionError } from './lsp-position-v1.mjs';

const idx = (text, bom = false) => buildLineIndex(Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, 'utf8')]));
const code = (fn) => { try { fn(); } catch (e) { return e instanceof LspPositionError ? e.code : `OTHER:${e.message}`; } return null; };

test('ASCII: character equals byte column in every encoding', () => {
  const i = idx('const a = 1;\nfoo();\n');
  for (const enc of ['utf-8', 'utf-16', 'utf-32']) assert.equal(positionToByteOffset(i, { line: 1, character: 2 }, enc), 13 + 2);
});

test('emoji example: UTF-16 column 16 maps to byte column 18, and back', () => {
  const i = idx('const x = "🚀"; foo();');
  assert.equal(positionToByteOffset(i, { line: 0, character: 16 }, 'utf-16'), 18);
  assert.equal(positionToByteOffset(i, { line: 0, character: 15 }, 'utf-32'), 18);
  assert.deepEqual(byteOffsetToPosition(i, 18, 'utf-16'), { line: 0, character: 16 });
  assert.deepEqual(byteOffsetToPosition(i, 18, 'utf-32'), { line: 0, character: 15 });
  assert.deepEqual(byteOffsetToPosition(i, 18, 'utf-8'), { line: 0, character: 18 });
});

test('a position inside a surrogate pair or inside a UTF-8 sequence is rejected, not rounded', () => {
  const i = idx('a🚀b');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: 2 }, 'utf-16')), 'SPLIT_CODE_POINT');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: 3 }, 'utf-8')), 'SPLIT_CODE_POINT');
  assert.equal(code(() => byteOffsetToPosition(i, 3, 'utf-16')), 'SPLIT_CODE_POINT');
});

test('BMP and combining marks: counted per code point, not per grapheme', () => {
  const i = idx('éx'); // e + combining acute: 2 code points, 3 bytes, then x
  assert.equal(positionToByteOffset(i, { line: 0, character: 2 }, 'utf-16'), 3);
  const bmp = idx('日本語x');
  assert.equal(positionToByteOffset(bmp, { line: 0, character: 3 }, 'utf-16'), 9);
  assert.equal(positionToByteOffset(bmp, { line: 0, character: 3 }, 'utf-8'), 3);
});

test('CRLF, LF and lone CR are line terminators; offsets are absolute file offsets', () => {
  const i = idx('ab\r\ncd\nef\rgh');
  assert.equal(i.lines.length, 4);
  assert.equal(positionToByteOffset(i, { line: 1, character: 1 }), 5);
  assert.equal(positionToByteOffset(i, { line: 2, character: 0 }), 7);
  assert.equal(positionToByteOffset(i, { line: 3, character: 2 }), 12);
  assert.equal(code(() => byteOffsetToPosition(i, 2)), null);
  assert.equal(code(() => byteOffsetToPosition(i, 3)), 'OFFSET_IN_LINE_TERMINATOR');
});

test('BOM is excluded from the document text but counted in byte offsets', () => {
  const i = idx('foo();', true);
  assert.equal(i.bomLength, 3);
  assert.equal(positionToByteOffset(i, { line: 0, character: 0 }), 3);
  assert.equal(positionToByteOffset(i, { line: 0, character: 3 }), 6);
  assert.deepEqual(byteOffsetToPosition(i, 6), { line: 0, character: 3 });
  assert.equal(code(() => byteOffsetToPosition(i, 1)), 'OFFSET_OUT_OF_RANGE');
});

test('invalid coordinates and encodings fail explicitly', () => {
  const i = idx('abc\ndef');
  assert.equal(code(() => positionToByteOffset(i, { line: 5, character: 0 })), 'LINE_OUT_OF_RANGE');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: 4 })), 'COLUMN_OUT_OF_RANGE');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: -1 })), 'COLUMN_INVALID');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: 1.5 })), 'COLUMN_INVALID');
  assert.equal(code(() => positionToByteOffset(i, { line: 0, character: 1 }, 'utf-7')), 'ENCODING_UNSUPPORTED');
  assert.equal(code(() => buildLineIndex('not bytes')), 'BYTES_REQUIRED');
  const bad = buildLineIndex(Buffer.from([0x61, 0xff, 0x62]));
  assert.equal(code(() => positionToByteOffset(bad, { line: 0, character: 1 }, 'utf-16')), 'INVALID_UTF8');
});

test('multiline range readback: matched, mismatched and stale document version', () => {
  const i = idx('import {\n  a,\n  b,\n} from "x";');
  const range = { start: { line: 0, character: 0 }, end: { line: 3, character: 1 } };
  assert.equal(rangeToVerifiedByteSpan(i, range, { expectedText: 'import {\n  a,\n  b,\n}' }).readbackVerified, true);
  assert.equal(code(() => rangeToVerifiedByteSpan(i, range, { expectedText: 'import {' })), 'SPAN_READBACK_MISMATCH');
  assert.equal(code(() => rangeToVerifiedByteSpan(i, range, { documentVersion: 3, snapshotVersion: 4 })), 'STALE_DOCUMENT_VERSION');
  assert.equal(code(() => rangeToVerifiedByteSpan(i, { start: range.end, end: range.start })), 'RANGE_INVERTED');
});

test('round trip over every valid boundary of a mixed string in each encoding', () => {
  const i = idx('a🚀é日b');
  for (const enc of ['utf-8', 'utf-16', 'utf-32']) {
    let ok = 0;
    for (let off = 0; off <= i.bytes.length; off++) {
      try { const pos = byteOffsetToPosition(i, off, enc); assert.equal(positionToByteOffset(i, pos, enc), off); ok++; } catch (e) { assert.equal(e.code, 'SPLIT_CODE_POINT'); }
    }
    assert.equal(ok, 6, enc); // 5 code points => 6 boundaries
  }
});

test('CRLF source with LF-folded evidence text: rejected by default, accepted and flagged only when normalization is requested', () => {
  const i = idx('import {\r\n  a,\r\n  b,\r\n} from "x";');
  const range = { start: { line: 0, character: 0 }, end: { line: 3, character: 1 } };
  const folded = 'import {\n  a,\n  b,\n}';
  assert.equal(code(() => rangeToVerifiedByteSpan(i, range, { expectedText: folded })), 'SPAN_READBACK_MISMATCH');
  const out = rangeToVerifiedByteSpan(i, range, { expectedText: folded, normalizeLineEndings: true });
  assert.equal(out.lineEndingNormalized, true);
  assert.equal(out.readbackVerified, true);
  assert.equal(out.startByte, 0);
  assert.equal(out.endByte, 'import {\r\n  a,\r\n  b,\r\n}'.length);
  assert.equal(code(() => rangeToVerifiedByteSpan(i, range, { expectedText: 'something else', normalizeLineEndings: true })), 'SPAN_READBACK_MISMATCH');
  const lf = rangeToVerifiedByteSpan(idx('a\nb'), { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } }, { expectedText: 'a\nb', normalizeLineEndings: true });
  assert.equal(lf.lineEndingNormalized, false);
});
