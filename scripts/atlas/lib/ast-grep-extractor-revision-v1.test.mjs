import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAstGrepExtractorRevisionV1 } from './ast-grep-extractor-revision-v1.mjs';

test('binds the exact AST-grep package name and semantic version', () => {
  assert.equal(resolveAstGrepExtractorRevisionV1({ name: '@ast-grep/napi', version: '0.45.3' }), '@ast-grep/napi@0.45.3');
});

test('rejects missing or mismatched extractor package metadata', () => {
  assert.throws(() => resolveAstGrepExtractorRevisionV1({ name: 'ast-grep', version: '0.45.3' }), /AST_GREP_PACKAGE_IDENTITY_OR_VERSION_INVALID/);
  assert.throws(() => resolveAstGrepExtractorRevisionV1({ name: '@ast-grep/napi', version: '' }), /AST_GREP_PACKAGE_IDENTITY_OR_VERSION_INVALID/);
});
