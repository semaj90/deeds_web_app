import assert from 'node:assert/strict';
import test from 'node:test';
import { pageRanking, rankOpenTasks, rankOpenTasksLegacyV1, rankSelectedOpenSpecTaskCardsV1, resolveCurrentLine } from './rank-open-tasks-v1.mjs';
import { selectOpenSpecTaskCardsV1 } from './lib/openspec-report-manifest-v1.mjs';

const task = (over) => ({
  taskKey: `c:${over.line}`, stableKey: `sk-${over.n}`, change: 'c1', source: 'c1/tasks.md', line: over.line,
  text: `task number ${over.n} text`, executionState: 'ACTIONABLE', gateState: 'READY', controllerState: 'ACTIONABLE',
  mutationClass: 'CODE_ONLY', priority: 20, lane: 'L', ...over
});
const files = {
  'c1/tasks.md': ['# t', '- [ ] task number 1 text', '- [ ] task number 2 text', '- [x] task number 3 text', '- [ ] task number 4 text', '- [ ] task number 5 text']
};
const ledger = (tasks) => ({ generatedAt: '2026-10-03T00:00:00Z', sourceFileHashes: {}, taskInventory: tasks });
const read = (s) => files[s] ?? null;

test('same input gives same order and checksum', () => {
  const l = ledger([task({ n: 1, line: 2 }), task({ n: 2, line: 3, priority: 10 })]);
  const a = rankOpenTasks(l, read);
  const b = rankOpenTasks(l, read);
  assert.deepEqual(a, b);
  assert.equal(a.ranked[0].stableKey, 'sk-2');
});

test('closed task is excluded', () => {
  const r = rankOpenTasks(ledger([task({ n: 3, line: 4 })]), read);
  assert.equal(r.ranked.length, 0);
  assert.equal(r.rejected.length, 1);
});

test('moved task is re-resolved when unique, rejected when the line is gone', () => {
  const moved = rankOpenTasks(ledger([task({ n: 4, line: 2 })]), read);
  assert.equal(moved.ranked[0].line, 5);
  assert.equal(moved.ranked[0].lineMoved, true);
  const gone = rankOpenTasks(ledger([task({ n: 9, line: 2, text: 'no such task anywhere in file' })]), read);
  assert.equal(gone.ranked.length, 0);
});

test('ambiguous text match is rejected, not guessed', () => {
  const lines = ['- [ ] same text here', '- [ ] same text here'];
  assert.equal(resolveCurrentLine({ text: 'same text here', line: 9 }, lines), null);
});

test('waiting tasks excluded unless requested; write-gated excluded by default', () => {
  const l = ledger([
    task({ n: 1, line: 2, executionState: 'WAITING_ON_DEPENDENCY', controllerState: 'WAITING' }),
    task({ n: 2, line: 3, mutationClass: 'DB_WRITE' })
  ]);
  assert.equal(rankOpenTasks(l, read).ranked.length, 0);
  assert.equal(rankOpenTasks(l, read, { includeWaiting: true }).ranked.length, 1);
  assert.equal(rankOpenTasks(l, read, { includeWriteGated: true }).ranked.length, 1);
});

test('ties break by stableKey', () => {
  const l = ledger([task({ n: 5, line: 6 }), task({ n: 1, line: 2 }), task({ n: 2, line: 3 })]);
  assert.deepEqual(rankOpenTasks(l, read).ranked.map((r) => r.stableKey), ['sk-1', 'sk-2', 'sk-5']);
});

test('diversify-by-change is optional and not the canonical order', () => {
  const l = ledger([task({ n: 1, line: 2, priority: 10 }), task({ n: 2, line: 3, priority: 10 }), task({ n: 5, line: 6, change: 'c2', priority: 20, source: 'c2/tasks.md', text: 'other' })]);
  const files2 = { ...files, 'c2/tasks.md': ['- [ ] other'] };
  const rd = (s) => files2[s] ?? null;
  assert.deepEqual(rankOpenTasks(l, rd).ranked.map((r) => r.stableKey), ['sk-1', 'sk-2', 'sk-5']);
  assert.deepEqual(rankOpenTasks(l, rd, { diversifyByChange: true }).ranked.map((r) => r.stableKey), ['sk-1', 'sk-5', 'sk-2']);
});

test('pagination has no duplicates or skips and rejects a drifted ordering', () => {
  const l = ledger([1, 2, 4, 5].map((n, i) => task({ n, line: [2, 3, 5, 6][i] })));
  const result = rankOpenTasks(l, read);
  const seen = [];
  let offset = 0;
  for (;;) {
    const p = pageRanking(result, { offset, limit: 2, orderingChecksum: result.orderingChecksum });
    seen.push(...p.items.map((i) => i.stableKey));
    if (p.nextOffset === null) break;
    offset = p.nextOffset;
  }
  assert.equal(seen.length, 4);
  assert.equal(new Set(seen).size, 4);
  assert.throws(() => pageRanking(result, { offset: 2, limit: 2, orderingChecksum: 'sha256:other' }), /ORDERING_CHANGED/);
});

test('result is advisory and performs no writes', () => {
  const r = rankOpenTasks(ledger([]), read);
  assert.equal(r.advisory, true);
  assert.equal(r.writesPerformed, false);
});

test('task-card ranker preserves the selector candidate set and revision binding', () => {
  const cards = [
    { stableKey: 'zeta', taskRevision: 'rev-z', changeId: 'other', claim: 'plain work', retrievalState: 'CURRENT' },
    { stableKey: 'alpha', taskRevision: 'rev-a', changeId: 'graph', claim: 'PageRank graph work', retrievalState: 'REVIEW_REQUIRED' },
    { stableKey: 'waiting', taskRevision: 'rev-w', changeId: 'wait', claim: 'plain waiting', retrievalState: 'WAITING' },
    { stableKey: 'history', taskRevision: 'rev-h', changeId: 'old', claim: 'plain history', retrievalState: 'HISTORICAL' },
  ];
  const retrievalResult = selectOpenSpecTaskCardsV1({
    corpus: {
      schema: 'atlas.openspec-task-triage-corpus.v1',
      workspaceHead: 'head-1',
      taskPopulationRevision: 'sha256:task-population-1',
      retrievalPolicy: { defaultStates: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'], historyOnlyStates: ['HISTORICAL'] },
      taskCardCorpus: { cards },
    },
  });
  const ranked = rankSelectedOpenSpecTaskCardsV1(retrievalResult);
  assert.deepEqual(ranked.ranked.map((item) => item.taskCard).sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
    retrievalResult.cards.slice().sort((a, b) => a.stableKey.localeCompare(b.stableKey)));
  assert.equal(ranked.ranked.length, retrievalResult.returnedCount);
  assert.equal(ranked.candidateChecksum, retrievalResult.candidateChecksum);
  assert.equal(ranked.workspaceHead, retrievalResult.workspaceHead);
  assert.equal(ranked.taskPopulationRevision, retrievalResult.taskPopulationRevision);
  assert.equal(ranked.ranked[0].stableKey, 'alpha');
  assert.equal(ranked.rankingMode, 'NEUTRAL_IDENTITY_ORDER');
  assert.equal(ranked.rankingFeatureBlocker, 'NO_REVISION_BOUND_TASKCARD_RANK_FEATURES');
  assert.ok(ranked.ranked.every((item) => Object.keys(item.score).length === 0));
  assert.ok(ranked.ranked.every((item) => item.selected === false && item.canonicalAuthority === false));
  assert.equal(ranked.selected, false);
  assert.equal(ranked.canonicalAuthority, false);
  assert.equal(ranked.writesPerformed, false);
});

test('task-card ranking rejects altered selector candidates and keeps legacy raw-ledger API explicit', () => {
  const retrievalResult = selectOpenSpecTaskCardsV1({
    corpus: {
      schema: 'atlas.openspec-task-triage-corpus.v1',
      workspaceHead: 'head-1',
      taskPopulationRevision: 'sha256:task-population-1',
      retrievalPolicy: { defaultStates: ['CURRENT'], historyOnlyStates: [] },
      taskCardCorpus: { cards: [{ stableKey: 'one', taskRevision: 'rev-1', retrievalState: 'CURRENT', claim: 'plain' }] },
    },
  });
  assert.throws(() => rankSelectedOpenSpecTaskCardsV1({ ...retrievalResult, cards: [] }), /TASK_CARD_RETRIEVAL_COUNT_MISMATCH/);
  assert.throws(() => rankSelectedOpenSpecTaskCardsV1({
    ...retrievalResult,
    cards: [{ ...retrievalResult.cards[0], claim: 'tampered' }],
  }), /TASK_CARD_CANDIDATE_CHECKSUM_MISMATCH/);
  assert.equal(rankOpenTasks, rankOpenTasksLegacyV1);
  assert.equal(rankOpenTasksLegacyV1(ledger([]), read).eligibilitySource, 'RAW_WORKBOARD_INVENTORY');
});
