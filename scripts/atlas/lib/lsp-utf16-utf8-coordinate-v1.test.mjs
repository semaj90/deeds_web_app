import test from 'node:test';
import assert from 'node:assert/strict';
import {
  utf16OffsetToUtf8Byte,
  utf8ByteToUtf16Offset,
  lspPositionToUtf8ByteOffset,
  utf8ByteOffsetToLspPosition,
  lspRangeToUtf8ByteSpan,
  utf8ByteSpanToLspRange,
  isSurrogateSplit,
} from './lsp-utf16-utf8-coordinate-v1.mjs';

test('LSP coordinate translation: pure ASCII round-trip', () => {
  const text = 'const x = 42;\nconst y = "hello";\nconsole.log(x, y);\n';
  // Check line 1, char 6 ("y")
  const byteOff = lspPositionToUtf8ByteOffset(text, { line: 1, character: 6 });
  assert.equal(byteOff, 14 + 6); // line 0 is 14 bytes: "const x = 42;\n"
  assert.equal(text.slice(byteOff, byteOff + 1), 'y');

  const lspPos = utf8ByteOffsetToLspPosition(text, byteOff);
  assert.deepEqual(lspPos, { line: 1, character: 6 });
});

test('LSP coordinate translation: multi-byte UTF-8 and emoji surrogate pairs', () => {
  // '⚖️' is 3-byte or 6-byte sequence, '🚀' is surrogate pair \uD83D\uDE80 (2 UTF-16 code units, 4 UTF-8 bytes)
  const text = 'Law: ⚖️\nRocket: 🚀\nEnd.';
  // 'Rocket: ' is 8 chars, 8 bytes. '🚀' starts at char 8 (line 1).
  const rocketStartByte = lspPositionToUtf8ByteOffset(text, { line: 1, character: 8 });
  assert.equal(typeof rocketStartByte, 'number');

  // Offset 9 splits the surrogate pair of '🚀' (\uD83D\uDE80)
  assert.equal(isSurrogateSplit(text, text.indexOf('🚀') + 1), true);
  const splitByte = lspPositionToUtf8ByteOffset(text, { line: 1, character: 9 });
  assert.equal(splitByte, null, 'Splitting surrogate pair must fail closed');

  // After the emoji (char 10)
  const afterRocketByte = lspPositionToUtf8ByteOffset(text, { line: 1, character: 10 });
  assert.equal(afterRocketByte, rocketStartByte + 4); // 4 UTF-8 bytes for 🚀

  // Round trip from byte offset back to LSP
  const lspAfter = utf8ByteOffsetToLspPosition(text, afterRocketByte);
  assert.deepEqual(lspAfter, { line: 1, character: 10 });
});

test('LSP coordinate translation: Range and Span conversion', () => {
  const text = 'function compute() {\n  return 100;\n}\n';
  const range = {
    start: { line: 1, character: 2 },
    end: { line: 1, character: 12 },
  };
  const span = lspRangeToUtf8ByteSpan(text, range);
  assert.ok(span);
  assert.equal(span.length, 10);
  assert.equal(text.slice(span.startByte, span.endByte), 'return 100');

  const roundTripRange = utf8ByteSpanToLspRange(text, span);
  assert.deepEqual(roundTripRange, range);
});

test('LSP coordinate translation: out of bounds and malformed inputs fail closed', () => {
  const text = 'abc\ndef\n';
  assert.equal(lspPositionToUtf8ByteOffset(text, { line: -1, character: 0 }), null);
  assert.equal(lspPositionToUtf8ByteOffset(text, { line: 10, character: 0 }), null);
  assert.equal(lspPositionToUtf8ByteOffset(text, null), null);
  assert.equal(utf8ByteOffsetToLspPosition(text, -5), null);
  assert.equal(utf8ByteOffsetToLspPosition(text, 1000), null);
  assert.equal(lspRangeToUtf8ByteSpan(text, { start: { line: 1, character: 2 }, end: { line: 0, character: 0 } }), null);
});
