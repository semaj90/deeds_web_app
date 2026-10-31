import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, rankRecommendations, summarizeRowEstimates } from './build-production-hardening-topk-v1.mjs';

test('parseCsv preserves quoted commas, quotes, and embedded newlines', () => {
  const rows = parseCsv('name,detail\r\nalpha,"one, two"\r\nbeta,"a ""quoted"" value\ncontinued"\r\n');
  assert.deepEqual(rows, [
    { name: 'alpha', detail: 'one, two' },
    { name: 'beta', detail: 'a "quoted" value\ncontinued' }
  ]);
});

test('summarizeRowEstimates distinguishes positive, literal zero, and unknown estimates', () => {
  assert.deepEqual(summarizeRowEstimates([
    { estimated_rows: '12' },
    { estimated_rows: '0' },
    { estimated_rows: '-1' },
    { estimated_rows: 'not-a-number' }
  ]), { positive: 1, zero: 1, unknown: 2 });
});

test('rankRecommendations sorts deterministically and applies Top-K', () => {
  const ranked = rankRecommendations([
    { id: 'b', title: 'B', list: 'x', score: 50, evidence: [] },
    { id: 'a', title: 'A', list: 'x', score: 50, evidence: [] },
    { id: 'c', title: 'C', list: 'x', score: 20, evidence: [] }
  ], 2);
  assert.deepEqual(ranked.map((item) => item.id), ['a', 'b']);
});

test('rankRecommendations collapses duplicate recommendations while retaining distinct evidence', () => {
  const ranked = rankRecommendations([
    { id: 'one', title: 'Repeated task', list: 'x', score: 40, evidence: [['a.ts', 1, 'first']] },
    { id: 'two', title: 'Repeated task!', list: 'x', score: 60, evidence: [['b.ts', 2, 'second']] }
  ], 10);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 60);
  assert.deepEqual(ranked[0].evidence.map(([file]) => file), ['a.ts', 'b.ts']);
});
