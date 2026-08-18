import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileVitestJsonReport,
  promoteVitestExecutionToTestEvidence,
} from '../dist/core/vitest-test-evidence-compiler.js';

const report = {
  numTotalTestSuites: 1,
  numPassedTestSuites: 0,
  numFailedTestSuites: 1,
  numPendingTestSuites: 0,
  numTotalTests: 2,
  numPassedTests: 1,
  numFailedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: 1000,
  success: false,
  testResults: [{
    name: 'C:/repo/deeds_web_app/sveltekit-frontend/tests/auth.spec.ts',
    startTime: 1000,
    endTime: 1015,
    status: 'failed',
    assertionResults: [
      {
        ancestorTitles: ['auth', 'owner policy'],
        fullName: 'auth owner policy allows owner',
        title: 'allows owner',
        status: 'passed',
        duration: 4,
        failureMessages: [],
        location: { line: 10, column: 3 },
      },
      {
        ancestorTitles: ['auth', 'owner policy'],
        fullName: 'auth owner policy denies non-owner',
        title: 'denies non-owner',
        status: 'failed',
        duration: 7,
        failureMessages: ['expected 403, received 200'],
        location: { line: 18, column: 3 },
      },
    ],
  }],
};

test('Vitest JSON produces nominations plus runner-owned execution receipts', () => {
  const compiled = compileVitestJsonReport({
    report,
    source_revision: 'src-r1',
    run_revision: 'vitest-run-r1',
    producer_revision: 'vitest-json-r1',
    repo_root: 'C:/repo/deeds_web_app',
  });

  assert.equal(compiled.nominations.length, 2);
  assert.equal(compiled.executions.length, 2);
  assert.equal(compiled.receipt.passed_count, 1);
  assert.equal(compiled.receipt.failed_count, 1);
  assert.equal(compiled.nominations[0].source_ref, 'sveltekit-frontend/tests/auth.spec.ts');
  assert.equal(compiled.nominations[0].canonical_authority, false);
  assert.equal(compiled.executions[1].status, 'failed');
  assert.match(compiled.executions[1].execution_receipt_id, /^test-receipt:/);
});

test('line movement changes definition version but not cross-revision test key', () => {
  const first = compileVitestJsonReport({ report, source_revision: 'src-r1', run_revision: 'run-r1', producer_revision: 'vitest-json-r1', repo_root: 'C:/repo/deeds_web_app' });
  const movedReport = structuredClone(report);
  movedReport.testResults[0].assertionResults[0].location.line = 40;
  const moved = compileVitestJsonReport({ report: movedReport, source_revision: 'src-r2', run_revision: 'run-r2', producer_revision: 'vitest-json-r1', repo_root: 'C:/repo/deeds_web_app' });

  assert.equal(first.nominations[0].test_key, moved.nominations[0].test_key);
  assert.notEqual(first.nominations[0].definition_hash, moved.nominations[0].definition_hash);
});

test('canonical test evidence cannot be emitted before registry resolution', () => {
  const compiled = compileVitestJsonReport({ report, source_revision: 'src-r1', run_revision: 'run-r1', producer_revision: 'vitest-json-r1', repo_root: 'C:/repo/deeds_web_app' });
  assert.throws(() => promoteVitestExecutionToTestEvidence({
    nomination: compiled.nominations[0],
    execution: compiled.executions[0],
    resolution: {
      schema: 'atlas.test-case-resolution.v1',
      nomination_id: compiled.nominations[0].nomination_id,
      test_key: compiled.nominations[0].test_key,
      status: 'unresolved',
      registry_revision: 'test-registry-r1',
      resolution_basis: 'unresolved',
      candidate_ids: [],
      evidence_refs: [],
    },
  }), /TEST_EVIDENCE_REQUIRES_CANONICAL_TEST/);
});

test('canonical registry resolution joins runtime receipt into atlas.test-evidence.v1', () => {
  const compiled = compileVitestJsonReport({ report, source_revision: 'src-r1', run_revision: 'run-r1', producer_revision: 'vitest-json-r1', repo_root: 'C:/repo/deeds_web_app' });
  const payload = promoteVitestExecutionToTestEvidence({
    nomination: compiled.nominations[0],
    execution: compiled.executions[0],
    resolution: {
      schema: 'atlas.test-case-resolution.v1',
      nomination_id: compiled.nominations[0].nomination_id,
      test_key: compiled.nominations[0].test_key,
      status: 'canonical',
      stable_test_id: 'test:owner-allows',
      registry_revision: 'test-registry-r1',
      resolution_basis: 'exact_test_key',
      candidate_ids: ['test:owner-allows'],
      evidence_refs: [],
    },
  });

  assert.equal(payload.test_id, 'test:owner-allows');
  assert.equal(payload.runtime_receipt.status, 'passed');
  assert.equal(payload.runtime_receipt.receipt_id, compiled.executions[0].execution_receipt_id);
});
