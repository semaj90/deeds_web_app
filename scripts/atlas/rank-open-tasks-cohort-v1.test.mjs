import assert from 'node:assert/strict';
import test from 'node:test';
import { bindCohortToLedgerV1, buildTaskCardCohortV1, verifyCohortChecksumV1 } from './lib/task-card-cohort-v1.mjs';
import { rankOpenTasks } from './rank-open-tasks-v1.mjs';

const FILE_A = 'openspec/changes/a/tasks.md';
const FILE_B = 'openspec/changes/b/tasks.md';
const HASHES = { [FILE_A]: 'sha256:aaa', [FILE_B]: 'sha256:bbb' };

const card = (path, line, over = {}) => ({
  stableKey: `${path}#${line}`, sourcePath: path, sourceLine: line, taskRevision: `sha256:t${line}`,
  state: 'OPEN', retrievalState: 'CURRENT', ...over
});
const corpus = (cards, hashes = HASHES) => ({
  schema: 'atlas.openspec-task-card-corpus.v1',
  source: { workspaceHead: 'head1', workspaceRevision: 'sha256:ws', sourcePopulationChecksum: 'sha256:pop', taskFileHashes: hashes },
  cards
});

const row = (n, source, line, over = {}) => ({
  taskKey: `${source}:${line}`, stableKey: `sk-${n}`, change: source.split('/')[2], source, line,
  text: `task ${n} text`, executionState: 'ACTIONABLE', gateState: 'READY', controllerState: 'ACTIONABLE',
  mutationClass: 'CODE_ONLY', priority: 20, ...over
});
const ledger = (rows, hashes = HASHES) => ({ generatedAt: '2026-10-03T00:00:00Z', sourceFileHashes: hashes, taskInventory: rows });
const files = {
  [FILE_A]: ['# a', '- [ ] task 1 text', '- [ ] task 2 text', '- [ ] task 3 text'],
  [FILE_B]: ['# b', '- [ ] task 4 text']
};
const read = (s) => files[s] ?? null;

test('cohort contains exactly the admitted cards, sorted, with a verifiable checksum', () => {
  const c = buildTaskCardCohortV1(corpus([
    card(FILE_B, 1), card(FILE_A, 3), card(FILE_A, 2),
    card(FILE_A, 4, { retrievalState: 'REVIEW_REQUIRED' }), card(FILE_A, 5, { state: 'CHECKED' })
  ]));
  assert.deepEqual(c.locators.map((l) => `${l.sourcePath}#${l.sourceLine}`), [`${FILE_A}#2`, `${FILE_A}#3`, `${FILE_B}#1`]);
  assert.equal(c.count, 3);
  assert.equal(verifyCohortChecksumV1(c), true);
  assert.equal(c.canonicalAuthority, false);
  assert.deepEqual(c.selection, { retrievalStates: ['CURRENT'], states: ['OPEN'] });
});

test('a tampered cohort is rejected before use', () => {
  const c = buildTaskCardCohortV1(corpus([card(FILE_A, 2)]));
  const tampered = { ...c, locators: [...c.locators, { stableKey: 'x', sourcePath: FILE_A, sourceLine: 3, taskRevision: 't' }] };
  assert.equal(verifyCohortChecksumV1(tampered), false);
  assert.throws(() => bindCohortToLedgerV1(tampered, ledger([])), /COHORT_INVALID_OR_TAMPERED/);
});

test('the ranker takes lifecycle admission from the cohort, not from its own filter', () => {
  const rows = [row(1, FILE_A, 1), row(2, FILE_A, 2), row(3, FILE_A, 3), row(4, FILE_B, 1)];
  const legacy = rankOpenTasks(ledger(rows), read);
  assert.equal(legacy.ranked.length, 4);
  assert.equal(legacy.eligibilitySource, 'RAW_WORKBOARD_INVENTORY');
  // The selector admits tasks at lines 1 and 3 of file A only (line 2 is REVIEW_REQUIRED, B is checked).
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1), card(FILE_A, 2, { retrievalState: 'REVIEW_REQUIRED' }), card(FILE_A, 3), card(FILE_B, 1, { state: 'CHECKED' })]));
  const gated = rankOpenTasks(ledger(rows), read, { cohort });
  assert.deepEqual(gated.ranked.map((r) => r.stableKey).sort(), ['sk-1', 'sk-3']);
  assert.equal(gated.eligibilitySource, 'FROZEN_TASK_CARD_COHORT');
  assert.equal(gated.cohort.checksum, cohort.checksum);
  assert.equal(gated.funnel.cohortAdmitted, 2);
  assert.equal(gated.funnel.cohortExcluded, 2);
});

test('execution gating stays with the ranker: a cohort-admitted card still needs a ready, non-write-gated Workboard row', () => {
  const rows = [row(1, FILE_A, 1), row(2, FILE_A, 2, { mutationClass: 'DB_WRITE' }), row(3, FILE_A, 3, { gateState: 'BLOCKED' })];
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1), card(FILE_A, 2), card(FILE_A, 3)]));
  const r = rankOpenTasks(ledger(rows), read, { cohort });
  assert.deepEqual(r.ranked.map((x) => x.stableKey), ['sk-1']);
  assert.equal(r.funnel.cohortAdmitted, 3);
});

test('a source file whose bytes changed since the cohort was frozen fails closed for that whole file', () => {
  const rows = [row(1, FILE_A, 1), row(4, FILE_B, 1)];
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1), card(FILE_B, 1)]));
  const driftedLedger = ledger(rows, { ...HASHES, [FILE_A]: 'sha256:CHANGED' });
  const r = rankOpenTasks(driftedLedger, read, { cohort });
  assert.deepEqual(r.ranked.map((x) => x.stableKey), ['sk-4']);
  assert.deepEqual(r.cohort.staleFiles, [FILE_A]);
});

test('a file missing from the ledger hashes is excluded, not trusted', () => {
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1)]));
  const r = rankOpenTasks(ledger([row(1, FILE_A, 1)], {}), read, { cohort });
  assert.equal(r.ranked.length, 0);
  assert.deepEqual(r.cohort.missingFiles, [FILE_A]);
});

test('cohort mode is deterministic: same cohort and ledger give identical ordering checksums', () => {
  const rows = [row(1, FILE_A, 1), row(3, FILE_A, 3)];
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1), card(FILE_A, 3)]));
  assert.equal(rankOpenTasks(ledger(rows), read, { cohort }).orderingChecksum, rankOpenTasks(ledger([...rows].reverse()), read, { cohort }).orderingChecksum);
});

test('PARITY: every cohort-mode candidate is also a legacy candidate (cohort only narrows)', () => {
  const rows = [row(1, FILE_A, 1), row(2, FILE_A, 2), row(3, FILE_A, 3), row(4, FILE_B, 1)];
  const legacy = new Set(rankOpenTasks(ledger(rows), read).ranked.map((r) => r.stableKey));
  const cohort = buildTaskCardCohortV1(corpus([card(FILE_A, 1), card(FILE_A, 3)]));
  for (const r of rankOpenTasks(ledger(rows), read, { cohort }).ranked) assert.ok(legacy.has(r.stableKey));
});
