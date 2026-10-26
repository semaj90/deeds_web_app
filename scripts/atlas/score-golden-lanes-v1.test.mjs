import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreGoldenLanes } from './score-golden-lanes-v1.mjs';

const cands = [{ queryId: 'Q1', candidates: [
  { chunkId: 'a', lanes: ['dense_raw'] }, { chunkId: 'b', lanes: ['fts'] }, { chunkId: 'c', lanes: ['dense_raw', 'fts'] }, { chunkId: 'd', lanes: ['dense_raw'] } ] },
  { queryId: 'Q2', candidates: [{ chunkId: 'e', lanes: ['fts'] }] }];

test('precision and pooled recall per lane (FIXTURE labels, not real)', () => {
  const labels = [['Q1', 'a', 2], ['Q1', 'b', 0], ['Q1', 'c', 1], ['Q1', 'd', 0]].map(([queryId, chunkId, label]) => ({ queryId, chunkId, label }));
  const r = scoreGoldenLanes(cands, labels);
  assert.equal(r.queries.labelled, 1);
  assert.deepEqual(r.queries.skipped, [{ queryId: 'Q2', unlabelled: 1 }]);
  assert.equal(r.lanes.dense_raw.candidates, 3);
  assert.equal(r.lanes.dense_raw.precision, +(2 / 3).toFixed(4));
  assert.equal(r.lanes.dense_raw.pooledRecall, 1);
  assert.equal(r.lanes.fts.precision, 0.5); // b (0) and c (1): one of two FTS candidates relevant; Q2's candidate is skipped
  assert.equal(r.lanes.fts.pooledRecall, 0.5);
});

test('--min=2 counts only fully relevant', () => {
  const labels = [['Q1', 'a', 2], ['Q1', 'b', 0], ['Q1', 'c', 1], ['Q1', 'd', 0]].map(([queryId, chunkId, label]) => ({ queryId, chunkId, label }));
  const r = scoreGoldenLanes(cands, labels, { min: 2 });
  assert.equal(r.lanes.dense_raw.relevant, 1);
  assert.equal(r.lanes.fts.pooledRecall, 0);
});

test('a query with any unlabelled candidate is skipped, never scored', () => {
  const r = scoreGoldenLanes(cands, [{ queryId: 'Q1', chunkId: 'a', label: 2 }]);
  assert.equal(r.queries.labelled, 0);
  assert.equal(r.queries.skipped.length, 2);
});
