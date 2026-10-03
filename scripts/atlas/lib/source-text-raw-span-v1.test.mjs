import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSourceTextEnvelope, decodedOffsetToRawByte } from './source-text-envelope.mjs';
import { extractSymbolsFromSource } from '../../graphify/lib/ts-ast-extractor.mjs';
import { extractMarkdownSymbols, extractMarkdownFences } from './markdown-symbol-extractor.mjs';

test('Unicode compiler offsets map to the exact raw source span for UTF-8, BOM and UTF-16', () => {
  const text = '// é🧭\r\nexport function owner() { return 1; }';
  const utf16be = Buffer.from(text, 'utf16le');
  utf16be.swap16();
  for (const raw of [Buffer.from(text), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    Buffer.concat([Buffer.from([0xfe, 0xff]), utf16be])]) {
    const envelope = decodeSourceTextEnvelope(raw, 'src/test.ts');
    const symbol = extractSymbolsFromSource(envelope.text, 'test.ts').find(row => row.kind === 'function');
    const start = decodedOffsetToRawByte(envelope, symbol.start_byte);
    const end = decodedOffsetToRawByte(envelope, symbol.end_byte);
    const span = Buffer.from(raw.subarray(start, end));
    if (envelope.sourceEncoding === 'utf-16be') span.swap16();
    assert.equal(span.toString(envelope.sourceEncoding === 'utf-8' ? 'utf8' : 'utf16le'), symbol.signature_text);
    assert.equal(decodedOffsetToRawByte(envelope, text.length), raw.length);
  }
});

test('raw span conversion rejects invalid boundaries and surrogate splits', () => {
  const envelope = decodeSourceTextEnvelope(Buffer.from('a🧭z'), 'src/test.ts');
  for (const offset of [-1, 9, 1.2, 2]) assert.throws(() => decodedOffsetToRawByte(envelope, offset), /OFFSET/);
});

test('Markdown CRLF headings and embedded code preserve source positions', () => {
  const text = '# 🧭 Owner\r\nparagraph\r\n## Evidence\r\n```ts\r\nexport function proof() {}\r\n```\r\n';
  const headings = extractMarkdownSymbols(text, 'proof.md');
  assert.deepEqual(headings.map(h => h.start_line), [1, 3]);
  for (const heading of headings) assert.equal(text.slice(heading.start_byte, heading.end_byte), heading.signature_text);
  const [fence] = extractMarkdownFences(text);
  assert.equal(fence.contentStartLine, 5);
  assert.equal(text.slice(fence.contentStartByte, fence.contentEndByte), 'export function proof() {}\r\n');
});
