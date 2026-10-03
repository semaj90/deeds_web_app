import test from 'node:test';
import assert from 'node:assert/strict';
import { bm25ExecutionCounts, coverageMetric } from './graphify-dry-run-metrics-v1.mjs';

test('dry-run reports candidates and planned rows, never written rows', () => {
  assert.deepEqual(bm25ExecutionCounts(500, 0, false), {
    bm25Candidates: 500, bm25WouldBackfill: 500, bm25RowsWritten: 0,
  });
});

test('apply reports actual affected rows separately from selected candidates', () => {
  assert.deepEqual(bm25ExecutionCounts(500, 497, true), {
    bm25Candidates: 500, bm25WouldBackfill: 0, bm25RowsWritten: 497,
  });
});

test('coverage refuses a point-count numerator larger than the packet denominator', () => {
  assert.deepEqual(coverageMetric(328348, 61718), {
    status: 'IDENTITY_DEDUP_REQUIRED', numerator: 328348, denominator: 61718, percent: null,
  });
});

test('coverage has explicit no-denominator and valid bounded cases', () => {
  assert.equal(coverageMetric(0, 0).status, 'NO_DENOMINATOR');
  assert.deepEqual(coverageMetric(7, 10), { status: 'MEASURED', numerator: 7, denominator: 10, percent: 70 });
});
