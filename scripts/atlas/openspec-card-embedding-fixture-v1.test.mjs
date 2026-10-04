import assert from 'node:assert/strict';
import test from 'node:test';
import { cosine, documentInput, exactTopK, selectCohort, weakLabelRecall } from './openspec-card-embedding-fixture-v1.mjs';

const card = (change, n, over = {}) => ({
  cardId: `sha256:${change}-${String(n).padStart(2, '0')}`,
  taskIdentity: { changeId: change, identityState: 'DECLARED_ID' },
  contextBlob: `  text ${change} ${n}  `,
  tokenEstimate: 100,
  ...over
});
const cards = [...[0, 1, 2, 3, 4, 5].map((n) => card('b-change', n)), ...[0, 1, 2, 3, 4].map((n) => card('a-change', n)), card('c-few', 0)];

test('cohort is deterministic, sorted by change, and skips small or ambiguous groups', () => {
  const a = selectCohort(cards, 10);
  const b = selectCohort([...cards].reverse(), 10);
  assert.deepEqual(a.map((c) => c.cardId), b.map((c) => c.cardId));
  assert.equal(a.length, 10);
  assert.ok(a.every((c) => c.taskIdentity.changeId !== 'c-few'));
  assert.equal(a[0].taskIdentity.changeId, 'a-change');
  const amb = selectCohort([...cards.map((c) => (c.taskIdentity.changeId === 'a-change' ? { ...c, taskIdentity: { ...c.taskIdentity, identityState: 'AMBIGUOUS' } } : c))], 5);
  assert.ok(amb.every((c) => c.taskIdentity.changeId === 'b-change'));
});

test('document recipe is title + trimmed text', () => {
  assert.equal(documentInput(card('x', 1)), 'title: x | text: text x 1');
});

test('exact top-k excludes the query, orders by score then id', () => {
  const v = [[1, 0], [1, 0], [0, 1], [0.9, 0.1]];
  const top = exactTopK(v, ['d', 'a', 'c', 'b'], 0, 3);
  assert.deepEqual(top.map((t) => t.id), ['a', 'b', 'c']);
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-12);
});

test('weak-label recall is bounded by possible same-change neighbours', () => {
  const cs = [card('a', 0), card('a', 1), card('b', 0), card('b', 1)];
  const vs = [[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]];
  const r = weakLabelRecall(cs, vs, 1);
  assert.equal(r.recall, 1);
  assert.equal(r.possible, 4);
  const bad = weakLabelRecall(cs, [[1, 0], [0, 1], [0.95, 0.05], [0, 1]], 1);
  assert.ok(bad.recall < 1);
});
