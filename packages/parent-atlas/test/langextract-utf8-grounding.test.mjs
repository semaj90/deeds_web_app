import test from 'node:test';
import assert from 'node:assert/strict';
import { groundLangExtractUtf8SpansV1 } from '../dist/core/langextract-grounding-adapter.js';

const base = { source_ref: 'a.md', source_revision: 'rev1', expected_source_revision: 'rev1', workspace_revision: 'ws1' };
const ex = (text, s, e) => ({ extraction_class: 'k', extraction_text: text, char_interval: { start_pos: s, end_pos: e }, attributes: {}, confidence: 1 });
const run = (str, extractions, offset_basis = 'PYTHON_CODEPOINT') =>
  groundLangExtractUtf8SpansV1({ ...base, parser_buffer: Buffer.from(str, 'utf8'), offset_basis, extractions });

test('ASCII: byte offset equals char offset', () => {
  const r = run('hello world', [ex('world', 6, 11)]);
  assert.equal(r.spans[0].utf8_start_byte, 6);
  assert.equal(r.spans[0].text_matches_extraction, true);
});

test('non-ASCII before the span shifts bytes, not chars', () => {
  const r = run('café x', [ex('x', 5, 6)]);
  assert.equal(r.spans[0].utf8_start_byte, 6);
  assert.equal(r.spans[0].text_matches_extraction, true);
});

test('BOM-stripped parser buffer: offsets are relative to the buffer', () => {
  assert.equal(run('abc', [ex('b', 1, 2)]).spans[0].utf8_start_byte, 1);
});

test('CRLF counts as 2 chars and 2 bytes', () => {
  const r = run('a\r\nb', [ex('b', 3, 4)]);
  assert.equal(r.spans[0].utf8_start_byte, 3);
  assert.equal(r.spans[0].text_matches_extraction, true);
});

test('astral character: codepoint and UTF-16 bases reach the same bytes but distinct identity', () => {
  const s = 'x\u{1F600}y'; // codepoints x=0 emoji=1 y=2; UTF-16 units x=0 emoji=1..2 y=3
  const cp = run(s, [ex('y', 2, 3)], 'PYTHON_CODEPOINT');
  const u16 = run(s, [ex('y', 3, 4)], 'UTF16_CODE_UNIT');
  assert.equal(cp.spans[0].utf8_start_byte, 5);
  assert.equal(u16.spans[0].utf8_start_byte, 5);
  assert.notEqual(cp.spans[0].evidence_checksum, u16.spans[0].evidence_checksum);
  assert.equal(cp.spans[0].text_matches_extraction, true);
});

test('UTF-16 index inside a surrogate pair fails closed', () => {
  assert.equal(run('x\u{1F600}y', [ex('?', 2, 3)], 'UTF16_CODE_UNIT').rejections[0].code, 'SPLITS_SURROGATE_PAIR');
});

test('multi-line span', () => {
  assert.equal(run('l1\nl2\nl3', [ex('l2\nl3', 3, 8)]).spans[0].text_matches_extraction, true);
});

test('invalid intervals fail closed', () => {
  const r = run('abc', [ex('a', 2, 2), ex('a', 0, 99), { extraction_class: 'k', extraction_text: 'a', attributes: {}, confidence: 1 }]);
  assert.deepEqual(r.rejections.map((x) => x.code), ['INTERVAL_NOT_INCREASING', 'INTERVAL_OUT_OF_RANGE', 'NO_INTERVAL']);
  assert.equal(r.spans.length, 0);
});

test('source revision mismatch rejects the whole batch', () => {
  assert.throws(
    () => groundLangExtractUtf8SpansV1({ ...base, source_revision: 'rev2', parser_buffer: Buffer.from('a'), offset_basis: 'PYTHON_CODEPOINT', extractions: [ex('a', 0, 1)] }),
    /SOURCE_REVISION_MISMATCH/,
  );
});

test('invalid UTF-8 parser buffer is a contract violation', () => {
  assert.throws(() => groundLangExtractUtf8SpansV1({ ...base, parser_buffer: Buffer.from([0xff, 0xfe, 0x41]), offset_basis: 'PYTHON_CODEPOINT', extractions: [] }));
});

test('extraction text that does not match the slice is flagged', () => {
  assert.equal(run('hello', [ex('WRONG', 0, 5)]).spans[0].text_matches_extraction, false);
});
