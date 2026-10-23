import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFileCapabilityV1, parserExclusionReasonV1 } from './current-file-capability-classification-v1.mjs';

test('keeps ambiguous C and C++ headers parser-unavailable absent a binding', () => {
  assert.deepEqual(classifyFileCapabilityV1({
    sourceRef: 'simd-bridge/cpp/gpu_error_codes.h',
    lineageClass: 'AST_EVIDENCE_ABSENT',
  }), {
    outcome: 'ELIGIBLE_PARSER_UNAVAILABLE',
    reason: 'NO_PROVIDER_FOR_h',
    language: null,
  });
});

test('excludes generated build-tree paths from parser eligibility', () => {
  const sourceRef = 'simd-bridge/cpp/build-clangd/CMakeFiles/ShowIncludes/foo.h';
  assert.equal(parserExclusionReasonV1(sourceRef), 'GENERATED_OR_DEPENDENCY_PATH');
  assert.deepEqual(classifyFileCapabilityV1({ sourceRef, lineageClass: 'AST_EVIDENCE_ABSENT' }), {
    outcome: 'NOT_AST_ELIGIBLE',
    reason: 'GENERATED_OR_DEPENDENCY_PATH',
    language: null,
  });
});

test('does not exclude ordinary first-party build-named source files', () => {
  assert.equal(parserExclusionReasonV1('scripts/build-index.ts'), null);
  assert.equal(parserExclusionReasonV1('simd-bridge/cpp/include/atlas.h'), null);
});
