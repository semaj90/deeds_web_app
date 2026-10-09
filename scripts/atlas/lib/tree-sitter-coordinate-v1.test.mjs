import test from 'node:test';
import assert from 'node:assert/strict';
import { utf16OffsetToUtf8Byte } from './tree-sitter-coordinate-v1.mjs';

test('converts ASCII and multibyte BMP prefixes to UTF-8 byte offsets', () => {
  const source = 'abc café target';
  assert.equal(utf16OffsetToUtf8Byte(source, source.indexOf('target')), Buffer.byteLength('abc café ', 'utf8'));
});

test('converts astral Unicode prefixes without splitting surrogate pairs', () => {
  const source = 'a😀target';
  assert.equal(utf16OffsetToUtf8Byte(source, source.indexOf('target')), Buffer.byteLength('a😀', 'utf8'));
  assert.equal(utf16OffsetToUtf8Byte(source, 2), null);
});

test('rejects invalid coordinate ranges', () => {
  assert.equal(utf16OffsetToUtf8Byte('abc', -1), null);
  assert.equal(utf16OffsetToUtf8Byte('abc', 4), null);
  assert.equal(utf16OffsetToUtf8Byte('abc', 1.5), null);
});
