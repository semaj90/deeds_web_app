import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAstGrepJsonOutputV1 } from './ast-grep-result-v1.mjs';

test('accepts a successful array result', () => {
  assert.deepEqual(parseAstGrepJsonOutputV1({ stdout: '[{"id":1}]', stderr: '', exitCode: 0, ruleId: 'r' }), [{ id: 1 }]);
});

test('accepts exit code one only for a clean empty result', () => {
  assert.deepEqual(parseAstGrepJsonOutputV1({ stdout: '[]\n', stderr: '', exitCode: 1, ruleId: 'r' }), []);
});

test('rejects non-empty results with nonzero exit codes', () => {
  assert.throws(() => parseAstGrepJsonOutputV1({ stdout: '[{"id":1}]', stderr: '', exitCode: 1, ruleId: 'r' }), /exited 1/);
});

test('rejects stderr on the no-match exit path', () => {
  assert.throws(() => parseAstGrepJsonOutputV1({ stdout: '[]', stderr: 'warning', exitCode: 1, ruleId: 'r' }), /exited 1/);
});

test('rejects malformed and non-array output', () => {
  assert.throws(() => parseAstGrepJsonOutputV1({ stdout: 'oops', stderr: '', exitCode: 0, ruleId: 'r' }), /non-JSON/);
  assert.throws(() => parseAstGrepJsonOutputV1({ stdout: '{}', stderr: '', exitCode: 0, ruleId: 'r' }), /non-array/);
});
