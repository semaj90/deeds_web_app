import test from 'node:test';
import assert from 'node:assert/strict';
import { isSha256SourceRevisionV1, sourceByteRevisionV1, sourceBytesMatchRevisionV1 } from './source-byte-revision-v1.mjs';

test('computes an exact SHA-256 revision over UTF-8 source bytes', () => {
  const bytes = Buffer.from('const café = 1;\r\n', 'utf8');
  const revision = sourceByteRevisionV1(bytes);
  assert.match(revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(sourceBytesMatchRevisionV1(bytes, revision), true);
});

test('rejects stale, malformed, and absent source revisions', () => {
  const bytes = Buffer.from('export const value = 1;\n', 'utf8');
  const other = Buffer.from('export const value = 2;\n', 'utf8');
  assert.equal(sourceBytesMatchRevisionV1(bytes, sourceByteRevisionV1(other)), false);
  assert.equal(isSha256SourceRevisionV1('sha256:workspace'), false);
  assert.equal(sourceBytesMatchRevisionV1(bytes, 'workspace:0'), false);
  assert.equal(sourceBytesMatchRevisionV1(bytes, null), false);
});

test('hashes raw bytes rather than normalized line endings', () => {
  const lf = Buffer.from('line\n', 'utf8');
  const crlf = Buffer.from('line\r\n', 'utf8');
  assert.notEqual(sourceByteRevisionV1(lf), sourceByteRevisionV1(crlf));
});
