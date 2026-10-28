import test from 'node:test';
import assert from 'node:assert/strict';
import { assertJsonObjectKeysUniqueV1, DuplicateJsonObjectKeyErrorV1 } from '../dist/core/json-duplicate-key-guard-v1.js';

test('allows unique nested keys and scalar JSON values', () => {
  assert.doesNotThrow(() => assertJsonObjectKeysUniqueV1('{"sourceRef":"a","meta":{"revision":"r1"},"items":[1,true,null]}'));
});

test('rejects duplicate and escaped-equivalent nested object keys', () => {
  assert.throws(() => assertJsonObjectKeysUniqueV1('{"meta":{"name":"a","na\\u006de":"b"}}'), DuplicateJsonObjectKeyErrorV1);
  assert.throws(() => assertJsonObjectKeysUniqueV1('{"x":1,"x":2}'), /Duplicate object key: x/);
});

test('rejects invalid JSON and excessive nesting', () => {
  assert.throws(() => assertJsonObjectKeysUniqueV1('{"x":}'), SyntaxError);
  assert.throws(() => assertJsonObjectKeysUniqueV1('{"a":{"b":1}}', 1), /JSON_NESTING_DEPTH/);
});
