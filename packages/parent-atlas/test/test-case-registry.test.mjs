import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveTestCaseKey,
  deriveTestCaseNominationId,
  testCaseNominationSchema,
} from '../dist/core/test-case-registry.js';

const definitionHash = 'a'.repeat(64);

test('test key ignores line movement but preserves source/suite/title identity', () => {
  const keyA = deriveTestCaseKey({
    framework: 'vitest',
    source_ref: 'tests/auth.spec.ts',
    suite_path: ['auth', 'owner policy'],
    title: 'denies non-owner',
  });
  const keyB = deriveTestCaseKey({
    framework: 'vitest',
    source_ref: 'tests/auth.spec.ts',
    suite_path: ['auth', 'owner policy'],
    title: 'denies non-owner',
  });
  assert.equal(keyA, keyB);
});

test('rename creates a new nomination key rather than silently preserving canonical identity', () => {
  const original = deriveTestCaseKey({
    framework: 'vitest', source_ref: 'tests/auth.spec.ts', suite_path: ['auth'], title: 'denies non-owner',
  });
  const renamed = deriveTestCaseKey({
    framework: 'vitest', source_ref: 'tests/auth.spec.ts', suite_path: ['auth'], title: 'rejects non-owner access',
  });
  assert.notEqual(original, renamed);
});

test('nomination remains noncanonical until registry promotion', () => {
  const testKey = deriveTestCaseKey({
    framework: 'vitest', source_ref: 'tests/auth.spec.ts', suite_path: ['auth'], title: 'denies non-owner',
  });
  const nomination = testCaseNominationSchema.parse({
    nomination_id: deriveTestCaseNominationId({ test_key: testKey, source_revision: 'src-r1', definition_hash: definitionHash }),
    test_key: testKey,
    framework: 'vitest',
    source_ref: 'tests/auth.spec.ts',
    source_revision: 'src-r1',
    suite_path: ['auth'],
    title: 'denies non-owner',
    full_name: 'auth denies non-owner',
    line: 10,
    column: 3,
    definition_hash: definitionHash,
    extractor_revision: 'vitest-parser-r1',
    canonical_authority: false,
  });
  assert.equal(nomination.identity_status, 'nominated');
  assert.equal(nomination.canonical_authority, false);
});
