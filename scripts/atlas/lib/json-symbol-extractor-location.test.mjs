import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonSymbols } from './json-symbol-extractor.mjs';

test('JSON locations distinguish property keys from identical strings inside values', () => {
  const text = '{\n  "description": "key",\n  "key": { "é": 7 },\n  "list": [1, {"x": 2}]\n}';
  const symbols = extractJsonSymbols(text, 'fixture.json');
  const key = symbols.find(row => row.name === 'key');
  assert.equal(text.slice(key.start_byte, key.end_byte), '"key": { "é": 7 }');
  assert.equal(key.start_line, 3);
  const list = symbols.find(row => row.name === 'list');
  assert.equal(text.slice(list.start_byte, list.end_byte), '"list": [1, {"x": 2}]');
  assert.equal(symbols.some(row => row.name === '1'), false);
});

test('duplicate JSON keys retain both locations for identity-conflict classification', () => {
  const symbols = extractJsonSymbols('{"key":1,"key":2}', 'duplicate.json');
  assert.equal(symbols.length, 2);
  assert.notEqual(symbols[0].start_byte, symbols[1].start_byte);
});

test('array members remain opaque; byte and object-observation limits defer explicitly', () => {
  assert.deepEqual(extractJsonSymbols(JSON.stringify(Array.from({length: 10000}, (_, i) => i)), 'large.json'), []);
  const wideObject = JSON.stringify(Object.fromEntries(Array.from({ length: 2_001 }, (_, i) => [`k${i}`, i])));
  assert.throws(() => extractJsonSymbols(wideObject, 'wide.json'), /STRUCTURAL_RESOURCE_LIMIT_DEFERRED:OBSERVATIONS_EXCEED_LIMIT/);
  assert.throws(() => extractJsonSymbols('{"x":1}', 'bytes.json', { maxSourceBytes: 4 }),
    /STRUCTURAL_RESOURCE_LIMIT_DEFERRED:SOURCE_BYTES_EXCEED_LIMIT/);
  assert.throws(() => extractJsonSymbols('{"x":1,}', 'malformed.json', {maxSymbols: 2000}), /JSON_PARSE_FAILED/);
  assert.deepEqual(extractJsonSymbols('null', 'empty.json'), []);
});

test('bounded extraction preserves every observation below the configured ceiling', () => {
  const count = 1_500;
  const text = JSON.stringify(Object.fromEntries(Array.from({ length: count }, (_, i) => [`key_${i}`, i])));
  const symbols = extractJsonSymbols(text, 'complete-bounded.json', { maxSymbols: 2_000 });
  assert.equal(symbols.length, count);
  assert.equal(symbols[0].name, 'key_0');
  assert.equal(symbols.at(-1).name, `key_${count - 1}`);
});
