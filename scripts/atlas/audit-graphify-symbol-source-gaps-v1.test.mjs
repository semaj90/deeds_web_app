import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGraphifySourceGapV1 } from './audit-graphify-symbol-source-gaps-v1.mjs';

test('classifies exact source presence separately from Graphify observation presence', () => {
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'READ', sourceRevisionMatches: true, graphifyRows: 0 }), 'EXACT_SOURCE_BYTES_NO_GRAPHIFY_ROW');
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'READ', sourceRevisionMatches: true, graphifyRows: 1 }), 'EXACT_SOURCE_BYTES_STALE_GRAPHIFY_REVISION_ONLY');
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'READ', sourceRevisionMatches: false, graphifyRows: 0 }), 'SOURCE_REVISION_MISMATCH_NO_GRAPHIFY_ROW');
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'MISSING', sourceRevisionMatches: false, graphifyRows: 0 }), 'SOURCE_AND_GRAPHIFY_ROW_ABSENT');
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'MISSING', sourceRevisionMatches: false, graphifyRows: 2 }), 'SOURCE_ABSENT_WITH_HISTORICAL_GRAPHIFY_ROWS');
  assert.equal(classifyGraphifySourceGapV1({ snapshotStatus: 'SYMLINK_OUTSIDE_SNAPSHOT', sourceRevisionMatches: false, graphifyRows: 0 }), 'SNAPSHOT_CHECK_UNVERIFIED_NO_GRAPHIFY_ROW');
});

test('rejects invalid Graphify row counts rather than inferring absence', () => {
  for (const graphifyRows of [-1, 0.5, Number.NaN]) {
    assert.throws(() => classifyGraphifySourceGapV1({ snapshotStatus: 'READ', sourceRevisionMatches: true, graphifyRows }), /ROW_COUNT_INVALID/);
  }
});
