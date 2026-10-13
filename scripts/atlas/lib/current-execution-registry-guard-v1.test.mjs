import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCurrentExecutionRegistryCoverageV1 } from './current-execution-registry-guard-v1.mjs';

const member = (sourceRef, contentHash = 'a'.repeat(64)) => ({
  repository_relative_path: sourceRef,
  content_hash: contentHash,
});

const registry = (sourceRef, contentHash = 'a'.repeat(64), extra = {}) => ({
  source_ref_key: sourceRef,
  relative_path: sourceRef,
  source_type: 'code',
  content_hash: contentHash,
  qualified_symbol: null,
  start_byte: null,
  end_byte: null,
  ...extra,
});

test('allows only exact whole-file registry digest matches', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts', `sha256:${'a'.repeat(64)}`)],
  );
  assert.equal(result.safeToApply, true);
  assert.deepEqual(result.eligibleSourceRefs, ['src/a.ts']);
});

test('blocks missing references and normalized aliases', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/missing.ts'), member('src/case.ts')],
    [registry('different.ts', 'a'.repeat(64), { relative_path: 'src/case.ts' })],
  );
  assert.equal(result.safeToApply, false);
  assert.deepEqual(result.missingSourceRefs, ['src/missing.ts']);
  assert.deepEqual(result.pathMismatches, ['src/case.ts']);
});

test('blocks ambiguous normalized registry identities', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts'), registry('./src/a.ts')],
  );
  assert.equal(result.safeToApply, false);
  assert.deepEqual(result.ambiguousSourceRefs, ['src/a.ts']);
});

test('does not let unrelated relative-path aliases shadow an exact source key', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts'), registry('other.ts', 'b'.repeat(64), { relative_path: 'src/a.ts' })],
  );
  assert.equal(result.safeToApply, true);
  assert.deepEqual(result.eligibleSourceRefs, ['src/a.ts']);
});

test('blocks exact-path registry digest mismatches', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts', 'b'.repeat(64))],
  );
  assert.equal(result.safeToApply, false);
  assert.deepEqual(result.digestMismatches, ['src/a.ts']);
});

test('blocks symbol/span registry rows from whole-file binding', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts', 'a'.repeat(64), { qualified_symbol: 'A.run', start_byte: 12, end_byte: 34 })],
  );
  assert.equal(result.safeToApply, false);
  assert.deepEqual(result.unqualifiedSourceRefs, ['src/a.ts']);
});

test('blocks registry rows without an explicit source type', () => {
  const result = classifyCurrentExecutionRegistryCoverageV1(
    [member('src/a.ts')],
    [registry('src/a.ts', 'a'.repeat(64), { source_type: null })],
  );
  assert.equal(result.safeToApply, false);
  assert.deepEqual(result.sourceTypeMissing, ['src/a.ts']);
});
