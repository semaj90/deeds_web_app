import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanFileForStubs,
  classifyProductionReachability,
  classifyStubPattern,
  SCHEMA_V1,
  GATE_NAME,
} from './scan-incomplete-code-stubs-v1.mjs';

describe('StubScannerV1 Evaluator', () => {
  test('classifies TEST_ONLY vs PROVEN reachability', () => {
    assert.equal(classifyProductionReachability('tests/fixtures/mock.ts'), 'TEST_ONLY');
    assert.equal(classifyProductionReachability('src/lib/server/features/ai/ace/context-assembler.ts'), 'UNKNOWN');
    assert.equal(classifyProductionReachability('sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts'), 'PROVEN');
  });

  test('identifies NOT_IMPLEMENTED error throws', () => {
    const code = `
export function compute() {
  throw new Error("Not implemented");
}
`;
    const findings = scanFileForStubs('sveltekit-frontend/src/lib/server/test.ts', code);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].category, 'NOT_IMPLEMENTED');
    assert.equal(findings[0].productionReachability, 'PROVEN');
    assert.equal(findings[0].mutationAllowed, false);
  });

  test('identifies TODO with owner', () => {
    const code = `// TODO: @user fix this memory leak`;
    const findings = scanFileForStubs('sveltekit-frontend/src/lib/server/test.ts', code);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].category, 'TODO_WITH_OWNER');
  });
});
