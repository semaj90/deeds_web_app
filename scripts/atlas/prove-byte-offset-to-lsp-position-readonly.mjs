#!/usr/bin/env node
/**
 * Read-only fixture proof for byteOffsetToPosition (CSGR-1). Proves UTF-8 byte offset →
 * UTF-16 LSP position conversion is correct for ASCII, multibyte-but-single-UTF-16-unit (BMP,
 * e.g. 'é' = 2 UTF-8 bytes / 1 UTF-16 code unit), and surrogate-pair (astral, e.g. an emoji =
 * 4 UTF-8 bytes / 2 UTF-16 code units) cases — required before this conversion touches any real
 * source file, per this proposal's design review.
 */
import { byteOffsetToPosition } from './lib/lsp-jsonrpc-client.mjs';

const cases = [
  {
    name: 'ASCII, single line',
    text: 'hello world',
    // byte offset of 'w' in "hello world" — 6 ASCII bytes precede it.
    byteOffset: 6,
    expected: { line: 0, character: 6 },
  },
  {
    name: 'ASCII, multi-line',
    text: 'line one\nline two\nline three',
    // 'l' of "line three" — after "line one\nline two\n" = 9 + 9 = 18 bytes.
    byteOffset: 18,
    expected: { line: 2, character: 0 },
  },
  {
    name: 'BMP multibyte (é = 2 UTF-8 bytes, 1 UTF-16 code unit)',
    text: 'café world',
    // 'w' — c,a,f (3 bytes) + é (2 bytes) + space (1 byte) = 6 bytes.
    // UTF-16 character index of 'w': "café ".length === 5 (NOT 6 — the naive byte==char bug).
    byteOffset: 6,
    expected: { line: 0, character: 5 },
  },
  {
    name: 'Surrogate pair (astral emoji = 4 UTF-8 bytes, 2 UTF-16 code units)',
    text: '\u{1F600} world', // U+1F600 GRINNING FACE
    // 'w' — emoji (4 bytes) + space (1 byte) = 5 bytes.
    // UTF-16 character index: the emoji is a surrogate pair (2 code units) + space (1) = 3.
    byteOffset: 5,
    expected: { line: 0, character: 3 },
  },
];

let failures = 0;
const results = [];
for (const testCase of cases) {
  const buffer = Buffer.from(testCase.text, 'utf8');
  let actual;
  let error = null;
  try {
    actual = byteOffsetToPosition(buffer, testCase.byteOffset);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const pass = !error && actual.line === testCase.expected.line && actual.character === testCase.expected.character;
  if (!pass) failures += 1;
  results.push({ name: testCase.name, expected: testCase.expected, actual: actual ?? null, error, pass });
}

const status = failures === 0 ? 'PROVEN_FIXTURE' : 'FAILED';
console.log(JSON.stringify({ schema: 'atlas.byte-offset-to-lsp-position-proof.v1', status, totalCases: cases.length, failures, results }, null, 2));
if (failures > 0) process.exitCode = 1;
