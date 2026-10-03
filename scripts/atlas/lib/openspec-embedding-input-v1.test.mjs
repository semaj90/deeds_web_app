import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshot, diffSnapshots } from '../openspec-dirty-set-v1.mjs';
import { buildEmbeddingInputV1, documentString, normalizeCardText } from './openspec-embedding-input-v1.mjs';

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
