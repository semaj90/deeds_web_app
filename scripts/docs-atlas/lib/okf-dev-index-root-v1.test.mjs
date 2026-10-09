import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveOkfDevIndexRootV1 } from './okf-dev-index-root-v1.mjs';

const repoRoot = path.resolve('C:/repo');

test('defaults to the canonical OKF dev corpus root', () => {
  assert.equal(
    resolveOkfDevIndexRootV1({ repoRoot }),
    path.join(repoRoot, 'docs/.okf/dev'),
  );
});

test('allows isolated scratch corpora under .tmp/atlas', () => {
  assert.equal(
    resolveOkfDevIndexRootV1({ repoRoot, requestedRoot: '.tmp/atlas/okf-index-fixture' }),
    path.join(repoRoot, '.tmp/atlas/okf-index-fixture'),
  );
});

test('rejects writing indexes to arbitrary repository paths', () => {
  assert.throws(
    () => resolveOkfDevIndexRootV1({ repoRoot, requestedRoot: 'docs/reports' }),
    /CORPUS_ROOT_MUST_BE_DEFAULT_OKF_OR_TMP_ATLAS/,
  );
});

test('rejects traversal outside the repository scratch root', () => {
  assert.throws(
    () => resolveOkfDevIndexRootV1({ repoRoot, requestedRoot: '.tmp/atlas/../../outside' }),
    /CORPUS_ROOT_MUST_BE_DEFAULT_OKF_OR_TMP_ATLAS/,
  );
});
