import assert from 'node:assert/strict';
import test from 'node:test';
import { UNTRACKED_REASONS, buildDirtySetReceipt, buildSnapshot, contentHash, diffSnapshots, embeddingText } from './openspec-dirty-set-v1.mjs';

const card = (n, over = {}) => ({
  taskIdentity: { taskRef: `c/tasks.md#L${n}`, canonicalTaskRef: `ct:${n}`, changeId: 'c' },
  claim: `claim ${n}`,
  predicates: [{ status: 'CLAIM_ONLY', text: `claim ${n}` }],
  proofState: 'CLAIM_ONLY',
  blockers: [], contradictions: [], dependencyRefs: [], receiptRefs: [],
  contextBlob: `TASK ct:${n} CLAIM claim ${n}. REVISION workspace=sha256:aaa source=sha256:bbb. RECEIPTS, not this card, establish proof.`,
  checksum: `card-${n}-rev-a`,
  ...over
});
const withRevision = (c, ws) => ({ ...c, contextBlob: c.contextBlob.replace('workspace=sha256:aaa', `workspace=${ws}`), checksum: `${c.checksum}-${ws}` });
const report = { source: { workspaceRevision: 'sha256:aaa' } };

test('embedding text drops the volatile revision suffix', () => {
  assert.ok(!embeddingText(card(1)).includes('REVISION'));
  assert.ok(embeddingText(card(1)).includes('RECEIPTS, not this card, establish proof.'));
});

test('content hash is independent of workspace/source revision', () => {
  assert.equal(contentHash(card(1)), contentHash(withRevision(card(1), 'sha256:zzz')));
});

test('content hash changes with claim, proof state, blockers and receipts', () => {
  const base = contentHash(card(1));
  for (const over of [{ claim: 'other' }, { proofState: 'PROVEN' }, { blockers: ['b'] }, { receiptRefs: ['r'] }, { dependencyRefs: ['d'] }]) {
    assert.notEqual(contentHash(card(1, over)), base, JSON.stringify(over));
  }
});

test('a workspace revision bump dirties nothing, while the card checksum changed for all', () => {
  const cards = [1, 2, 3].map((n) => card(n));
  const d = diffSnapshots(buildSnapshot(cards), buildSnapshot(cards.map((c) => withRevision(c, 'sha256:new'))));
  assert.equal(d.status, 'CLEAN');
  assert.equal(d.dirtyCards, 0);
  assert.equal(d.reasons.cardChecksumChanged, 3);
  assert.equal(d.reasons.taskRevisionChanged, 0);
});

test('dirty cards are attributed: task change vs receipt change', () => {
  const before = buildSnapshot([1, 2, 3].map((n) => card(n)));
  const after = buildSnapshot([card(1, { claim: 'new claim' }), card(2, { receiptRefs: ['r1'], proofState: 'PROVEN' }), card(3)]);
  const d = diffSnapshots(before, after);
  assert.equal(d.modified, 2);
  assert.equal(d.reasons.taskRevisionChanged, 1);
  assert.equal(d.reasons.receiptRevisionChanged, 1);
  assert.equal(d.unchanged, 1);
});

test('added, modified, removed and unchanged are counted; dirty representations scale', () => {
  const before = buildSnapshot([1, 2, 3].map((n) => card(n)));
  const after = buildSnapshot([card(1), card(2, { claim: 'changed' }), card(4)]);
  const d = diffSnapshots(before, after, { representations: 5 });
  assert.deepEqual({ a: d.added, r: d.removed, m: d.modified, u: d.unchanged }, { a: 1, r: 1, m: 1, u: 1 });
  assert.equal(d.dirtyCards, 2);
  assert.equal(d.dirtyRepresentations, 10);
});

test('no baseline means a full build; a recipe change dirties everything and says why', () => {
  const cur = buildSnapshot([1, 2].map((n) => card(n)));
  assert.equal(diffSnapshots(null, cur).status, 'NO_BASELINE_FULL_BUILD');
  const d = diffSnapshots({ ...cur, recipeRevision: 'old-recipe' }, cur);
  assert.equal(d.status, 'RECIPE_CHANGED_FULL_REBUILD');
  assert.equal(d.dirtyCards, 2);
  assert.equal(d.reasons.embeddingRecipeChanged, 2);
});

test('a baseline from an older hash format is re-baselined, not compared hash-to-hash', () => {
  const cur = buildSnapshot([card(1), card(2)]);
  const old = { ...buildSnapshot([card(1), card(2)]), hashFormat: 1 };
  const d = diffSnapshots(old, cur);
  assert.equal(d.status, 'BASELINE_FORMAT_CHANGED_REBASELINE');
  assert.equal(d.unchanged, 0);
  assert.equal(d.reasons.unattributed, 2);
  const none = { ...buildSnapshot([card(1)]) };
  delete none.hashFormat;
  assert.equal(diffSnapshots(none, buildSnapshot([card(1)])).status, 'BASELINE_FORMAT_CHANGED_REBASELINE');
});

test('reasons that have no input yet are null, never a fake zero', () => {
  const d = diffSnapshots(null, buildSnapshot([card(1)]));
  for (const r of UNTRACKED_REASONS) assert.equal(d.reasons[r], null, r);
});

test('duplicate keys are reported, not silently merged', () => {
  assert.deepEqual(buildSnapshot([card(1), card(1)]).duplicateKeys, ['c/tasks.md#L1|ct:1']);
});

test('receipt carries the phase block the runner merges, is read-only, and caps the key list', () => {
  const cards = Array.from({ length: 600 }, (_, i) => card(i));
  const cur = buildSnapshot(cards);
  const r = buildDirtySetReceipt({ previous: null, current: cur, diff: diffSnapshots(null, cur), report });
  assert.equal(r.schema, 'atlas.openspec-dirty-set-receipt.v1');
  assert.equal(r.writesPerformed, false);
  assert.equal(r.phaseReceipt.writesPerformed, false);
  assert.equal(r.phaseReceipt.dirtyCount, 600);
  assert.equal(r.phaseReceipt.skippedUnchangedCount, 0);
  assert.equal(r.dirtyKeys.length, 500);
  assert.equal(r.dirtyKeysTruncated, true);
  assert.equal(r.sourceRevision, 'sha256:aaa');
});
