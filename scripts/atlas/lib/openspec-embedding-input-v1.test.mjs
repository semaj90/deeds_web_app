import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildSnapshot, diffSnapshots } from '../openspec-dirty-set-v1.mjs';
import { buildEmbeddingInputV1, buildTaskCardEmbeddingInputBatchV1, buildTaskCardEmbeddingInputV1, documentString, normalizeCardText } from './openspec-embedding-input-v1.mjs';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const card = (n, over = {}) => ({
  cardId: `id-${n}-a`,
  taskIdentity: { taskRef: `c/tasks.md#L${n}`, canonicalTaskRef: `ct:${n}`, changeId: 'c' },
  claim: `claim ${n}`,
  predicates: [{ status: 'CLAIM_ONLY', text: `claim ${n}` }],
  proofState: 'CLAIM_ONLY',
  blockers: [], contradictions: [], dependencyRefs: [], receiptRefs: [],
  revisions: { workspaceRevision: 'sha256:aaa', sourceRevision: 'sha256:bbb' },
  contextBlob: `TASK ct:${n} CLAIM claim ${n}. REVISION workspace=sha256:aaa source=sha256:bbb. RECEIPTS, not this card, establish proof.`,
  checksum: `chk-${n}-a`,
  ...over
});
const bumpRevision = (c, ws) => ({
  ...c,
  cardId: `${c.cardId}-${ws}`,
  checksum: `${c.checksum}-${ws}`,
  revisions: { ...c.revisions, workspaceRevision: ws },
  contextBlob: c.contextBlob.replace('workspace=sha256:aaa', `workspace=${ws}`)
});

const taskCardCorpus = (cards = []) => ({
  schema: 'atlas.openspec-task-card-corpus.v1',
  cardSchema: 'atlas.openspec-task-card.v1',
  source: {
    workspaceRevision: sha256('workspace'),
    sourcePopulationChecksum: sha256('source-population'),
    taskFileHashes: { 'openspec/changes/example/tasks.md': sha256('task-file') },
  },
  cards,
});

const taskCard = (overrides = {}) => ({
  stableKey: 'example#task-1',
  changeId: 'example',
  taskRevision: sha256('task-block'),
  claim: '  Add bounded semantic retrieval.\r\n',
  sourcePath: 'openspec/changes/example/tasks.md',
  sourceLine: 12,
  sourceCoordinateRole: 'LOCATOR_ONLY',
  retrievalState: 'CURRENT',
  evidenceState: 'CLAIM_ONLY',
  canonicalAuthority: false,
  ...overrides,
});

test('the revision decoration is stripped and the rest of the text is kept', () => {
  const t = normalizeCardText(card(1).contextBlob);
  assert.ok(!t.includes('REVISION'));
  assert.ok(!t.includes('sha256:'));
  assert.equal(t, 'TASK ct:1 CLAIM claim 1.RECEIPTS, not this card, establish proof.'.replace('1.RECEIPTS', '1. RECEIPTS'));
});

test('CONTRACT: workspace-revision-only change -> same text, same checksum, same cache key, dirty=false', () => {
  const a = card(1);
  const b = bumpRevision(a, 'sha256:newrevision');
  const ia = buildEmbeddingInputV1(a);
  const ib = buildEmbeddingInputV1(b);
  assert.equal(ib.normalizedText, ia.normalizedText);
  assert.equal(ib.normalizedTextChecksum, ia.normalizedTextChecksum);
  assert.equal(ib.embeddingCacheKey, ia.embeddingCacheKey);
  // The audit identity does move with the revision (the card is the audit artifact):
  assert.notEqual(ib.sourceCardChecksum, ia.sourceCardChecksum);
  assert.notEqual(ib.sourceCardRevision, ia.sourceCardRevision);
  // and the dirty-set agrees:
  const d = diffSnapshots(buildSnapshot([a]), buildSnapshot([b]));
  assert.equal(d.status, 'CLEAN');
  assert.equal(d.dirtyCards, 0);
});

test('CONTRACT: semantic change at the same workspace revision -> different text/checksum/cache key, dirty=true', () => {
  const a = card(1);
  const b = card(1, { contextBlob: a.contextBlob.replace('CLAIM claim 1', 'CLAIM a different claim') });
  const ia = buildEmbeddingInputV1(a);
  const ib = buildEmbeddingInputV1(b);
  assert.notEqual(ib.normalizedTextChecksum, ia.normalizedTextChecksum);
  assert.notEqual(ib.embeddingCacheKey, ia.embeddingCacheKey);
  assert.equal(ib.sourceCardRevision, ia.sourceCardRevision);
  const d = diffSnapshots(buildSnapshot([a]), buildSnapshot([b]));
  assert.equal(d.dirtyCards, 1);
  assert.equal(d.reasons.embeddingTextChanged, 1);
});

test('the cache key moves with the model artifact and with the recipe revision', () => {
  const c = card(1);
  const base = buildEmbeddingInputV1(c, { modelArtifactRevision: 'm1' });
  assert.notEqual(buildEmbeddingInputV1(c, { modelArtifactRevision: 'm2' }).embeddingCacheKey, base.embeddingCacheKey);
  assert.notEqual(buildEmbeddingInputV1(c, { modelArtifactRevision: 'm1', recipeRevision: 'other' }).embeddingCacheKey, base.embeddingCacheKey);
  assert.equal(buildEmbeddingInputV1(c, { modelArtifactRevision: 'm1' }).embeddingCacheKey, base.embeddingCacheKey);
});

test('normalization is stable across CRLF and whitespace padding', () => {
  assert.equal(normalizeCardText('  a\r\nb  '), 'a\nb');
  assert.equal(normalizeCardText(undefined), '');
});

test('the document string composes title and normalized text exactly once', () => {
  const i = buildEmbeddingInputV1(card(2));
  assert.equal(documentString(i), `title: c | text: ${i.normalizedText}`);
  assert.ok(!documentString(i).includes('REVISION workspace='));
});

test('a suffix truncated by the token budget is still stripped (real shapes from the corpus)', () => {
  for (const tail of ['REVISION workspace=sha256:b45a8aca0bd7b', 'REVISION workspace=sha256:b45a8aca0bd7b source=', 'REVISION workspace=sha256:b45a8aca0bd7b source=sha2', 'REVISION workspace=sha256:aaa source=sha256:bbb.']) {
    const t = normalizeCardText(`RECEIPTS none ${tail}`);
    assert.equal(t, 'RECEIPTS none', tail);
  }
});

test('a card whose blob was cut before the suffix is unchanged', () => {
  assert.equal(normalizeCardText('CLAIM something long that was truncated mid-sen'), 'CLAIM something long that was truncated mid-sen');
});

test('a suffix cut inside the word REVISION is stripped, but a trailing RE is left alone', () => {
  for (const w of ['REVISI', 'REVISIO', 'REVISION']) assert.equal(normalizeCardText(`RECEIPTS none ${w}`), 'RECEIPTS none', w);
  assert.equal(normalizeCardText('RECEIPTS none ARE'), 'RECEIPTS none ARE');
  assert.equal(normalizeCardText('the REVISION of the plan was approved'), 'the REVISION of the plan was approved');
});

test('TaskCard embedding input binds task, source-file, and workspace revisions separately', () => {
  const corpus = taskCardCorpus([taskCard()]);
  const input = buildTaskCardEmbeddingInputV1(corpus.cards[0], corpus);
  assert.equal(input.schema, 'atlas.openspec-task-card-embedding-input.v1');
  assert.equal(input.taskKey, 'example#task-1');
  assert.equal(input.taskRevision, sha256('task-block'));
  assert.equal(input.sourceRef.sourceRevision, sha256('task-file'));
  assert.equal(input.sourceRef.workspaceRevision, sha256('workspace'));
  assert.equal(input.sourceRef.role, 'LOCATOR_ONLY');
  assert.equal(input.normalizedText, 'Add bounded semantic retrieval.');
  assert.equal(documentString(input), 'title: example | text: Add bounded semantic retrieval.');
  assert.equal(input.canonicalAuthority, false);
  assert.equal(input.cacheKeyBound, false);
  assert.equal(input.embeddingCacheKey, null);
});

test('TaskCard cache identity requires a model artifact revision but lineage changes do not rewrite text identity', () => {
  const modelArtifactRevision = sha256('model');
  const corpus = taskCardCorpus([taskCard()]);
  const base = buildTaskCardEmbeddingInputV1(corpus.cards[0], corpus, { modelArtifactRevision });
  const nextWorkspace = { ...corpus, source: { ...corpus.source, workspaceRevision: sha256('next-workspace') } };
  const moved = buildTaskCardEmbeddingInputV1(nextWorkspace.cards[0], nextWorkspace, { modelArtifactRevision });
  assert.equal(base.cacheKeyBound, true);
  assert.equal(base.embeddingCacheKey, moved.embeddingCacheKey);
  assert.notEqual(base.sourceRef.workspaceRevision, moved.sourceRef.workspaceRevision);
  assert.throws(() => buildTaskCardEmbeddingInputV1(corpus.cards[0], corpus, { modelArtifactRevision: 'unverified-model' }), /TASK_CARD_MODEL_ARTIFACT_REVISION_INVALID/);
});

test('TaskCard input batches sort by stable task key and checksum their row bindings deterministically', () => {
  const first = taskCard({ stableKey: 'example#b', claim: 'second' });
  const second = taskCard({ stableKey: 'example#a', claim: 'first' });
  const left = buildTaskCardEmbeddingInputBatchV1(taskCardCorpus([first, second]));
  const right = buildTaskCardEmbeddingInputBatchV1(taskCardCorpus([second, first]));
  assert.deepEqual(left.rowBindings.map((row) => row.taskKey), ['example#a', 'example#b']);
  assert.equal(left.inputSetChecksum, right.inputSetChecksum);
  assert.equal(left.rowBindingChecksum, right.rowBindingChecksum);
  assert.equal('normalizedText' in left.rowBindings[0], false);
  assert.equal('sourceRevision' in left.rowBindings[0], false);
  assert.equal(left.sourceFileHashes['openspec/changes/example/tasks.md'], sha256('task-file'));
  assert.equal(left.indexPromotionAllowed, false);
  assert.equal(left.vectorWritesPerformed, false);
  assert.equal(left.canonicalAuthority, false);
});

test('TaskCard row-binding checksum changes when either source or workspace revision changes', () => {
  const corpus = taskCardCorpus([taskCard()]);
  const base = buildTaskCardEmbeddingInputBatchV1(corpus);
  const sourceChanged = {
    ...corpus,
    source: {
      ...corpus.source,
      taskFileHashes: { ...corpus.source.taskFileHashes, 'openspec/changes/example/tasks.md': sha256('changed-task-file') },
    },
  };
  const workspaceChanged = { ...corpus, source: { ...corpus.source, workspaceRevision: sha256('changed-workspace') } };
  assert.notEqual(buildTaskCardEmbeddingInputBatchV1(sourceChanged).rowBindingChecksum, base.rowBindingChecksum);
  assert.notEqual(buildTaskCardEmbeddingInputBatchV1(workspaceChanged).rowBindingChecksum, base.rowBindingChecksum);
});

test('TaskCard embedding input rejects missing or mismatched lineage and duplicate keys', () => {
  const corpus = taskCardCorpus([taskCard()]);
  assert.throws(() => buildTaskCardEmbeddingInputV1(taskCard(), { ...corpus, source: { ...corpus.source, taskFileHashes: {} } }), /TASK_CARD_SOURCE_REVISION_UNBOUND/);
  assert.throws(() => buildTaskCardEmbeddingInputV1(taskCard({ workspaceRevision: sha256('wrong') }), corpus), /TASK_CARD_WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => buildTaskCardEmbeddingInputV1(taskCard({ canonicalAuthority: true }), corpus), /TASK_CARD_NONCANONICAL_PROJECTION_REQUIRED/);
  assert.throws(() => buildTaskCardEmbeddingInputBatchV1(taskCardCorpus([taskCard(), taskCard()])), /TASK_CARD_KEY_DUPLICATE/);
});
