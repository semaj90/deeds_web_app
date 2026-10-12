import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAstSymbolNominationShapeV1 } from './ast-symbol-nomination-shape-v1.mjs';

const valid = { symbol_name: 'run', language: 'typescript', start_byte: 2, end_byte: 12 };

test('accepts an explicitly typed declaration with a valid non-empty byte span', () => {
  assert.deepEqual(validateAstSymbolNominationShapeV1(valid), {
    valid: true, name: 'run', language: 'typescript', startByte: 2, endByte: 12,
  });
});

test('accepts the alternate byte_start/byte_end field names used by structural nomination packets', () => {
  assert.equal(validateAstSymbolNominationShapeV1({ name: 'run', language: 'typescript', byte_start: '2', byte_end: '12' }).valid, true);
});

test('rejects import snippets even when upstream labels them as functions', () => {
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, symbol_name: "import { x } from 'x'" }).reason, 'DECLARATION_NAME_INVALID');
});

test('rejects unknown languages, empty names, and null or empty spans', () => {
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, language: 'unknown' }).reason, 'LANGUAGE_UNAVAILABLE');
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, symbol_name: '' }).reason, 'DECLARATION_NAME_INVALID');
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, start_byte: null }).reason, 'BYTE_SPAN_INVALID');
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, end_byte: '' }).reason, 'BYTE_SPAN_INVALID');
  assert.equal(validateAstSymbolNominationShapeV1({ ...valid, end_byte: 2 }).reason, 'BYTE_SPAN_INVALID');
});
