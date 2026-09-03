#!/usr/bin/env node
/**
 * Read-only fixture proof for byteOffsetToPosition (CSGR-1, extended by
 * LSP-UTF8-BOUNDARY-GUARD-01). Proves UTF-8 byte offset → UTF-16 LSP position conversion is
 * correct for ASCII, multibyte-but-single-UTF-16-unit (BMP, e.g. 'é' = 2 UTF-8 bytes / 1 UTF-16
 * code unit), and surrogate-pair (astral, e.g. an emoji = 4 UTF-8 bytes / 2 UTF-16 code units)
 * cases — required before this conversion touches any real source file, per this proposal's
 * design review. Also proves the function fails closed (rejects, does not silently substitute
 * U+FFFD) when a byte offset splits a multibyte code point, or when the source itself contains
 * invalid UTF-8 anywhere — the specific hole `byteOffsetToPosition()` had before
 * LSP-UTF8-BOUNDARY-GUARD-01 (it decoded an arbitrary byte prefix with Buffer.toString('utf8'),
 * which Node documents as silently replacing invalid sequences rather than rejecting them).
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
  {
    name: 'REJECT: offset splits a 2-byte BMP code point (é, 1 byte in)',
    text: 'café world',
    // é is bytes [0xc3, 0xa9] starting at byte offset 3 — offset 4 lands between them.
    byteOffset: 4,
    expectErrorPrefix: 'LSP_BYTE_OFFSET_SPLITS_UTF8_CODE_POINT',
  },
  {
    name: 'REJECT: offset splits a 4-byte astral code point, 1 byte in',
    text: '\u{1F600} world',
    byteOffset: 1,
    expectErrorPrefix: 'LSP_BYTE_OFFSET_SPLITS_UTF8_CODE_POINT',
  },
  {
    name: 'REJECT: offset splits a 4-byte astral code point, 2 bytes in',
    text: '\u{1F600} world',
    byteOffset: 2,
    expectErrorPrefix: 'LSP_BYTE_OFFSET_SPLITS_UTF8_CODE_POINT',
  },
  {
    name: 'REJECT: offset splits a 4-byte astral code point, 3 bytes in',
    text: '\u{1F600} world',
    byteOffset: 3,
    expectErrorPrefix: 'LSP_BYTE_OFFSET_SPLITS_UTF8_CODE_POINT',
  },
  {
    name: 'REJECT: source itself contains invalid UTF-8 after byteOffset ' +
      '(prefix-only decode would miss this)',
    // Valid ASCII prefix, offset lands cleanly at the end of it, but a lone continuation byte
    // (0x80) later in the buffer makes the WHOLE source invalid UTF-8.
    rawBytes: Buffer.concat([Buffer.from('hello ', 'utf8'), Buffer.from([0x80]), Buffer.from('world', 'utf8')]),
    byteOffset: 6,
    expectErrorPrefix: 'LSP_SOURCE_INVALID_UTF8',
  },
  {
    name: 'REJECT: source contains an isolated invalid byte at the very start',
    rawBytes: Buffer.from([0xff, 0xfe, 0x61, 0x62]),
    byteOffset: 1,
    expectErrorPrefix: 'LSP_SOURCE_INVALID_UTF8',
  },
];

let failures = 0;
const results = [];
for (const testCase of cases) {
  const buffer = testCase.rawBytes ?? Buffer.from(testCase.text, 'utf8');
  let actual;
  let error = null;
  try {
    actual = byteOffsetToPosition(buffer, testCase.byteOffset);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  let pass;
  if (testCase.expectErrorPrefix) {
    pass = !!error && error.startsWith(testCase.expectErrorPrefix);
  } else {
    pass = !error && actual.line === testCase.expected.line && actual.character === testCase.expected.character;
  }
  if (!pass) failures += 1;
  results.push({
    name: testCase.name,
    expected: testCase.expected ?? null,
    expectErrorPrefix: testCase.expectErrorPrefix ?? null,
    actual: actual ?? null,
    error,
    pass,
  });
}

const status = failures === 0 ? 'PROVEN_FIXTURE' : 'FAILED';
console.log(JSON.stringify({ schema: 'atlas.byte-offset-to-lsp-position-proof.v1', status, totalCases: cases.length, failures, results }, null, 2));
if (failures > 0) process.exitCode = 1;
