import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelationFact, decideRelationWrite, relationIdentity } from './canonical-relation-contract-v1.mjs';

const REPO = '11111111-1111-7111-8111-111111111111';
const SNAP = '22222222-2222-7222-8222-222222222222';
const SHA = (c) => `sha256:${c.repeat(64)}`;
const base = () => ({
  type: 'MATERIALIZES', source: { class: 'SourceFile', key: 'src/a.ts' }, target: { class: 'Packet', key: 'packet:x' },
  scope: { repositoryId: REPO, snapshotId: SNAP }, extractionRecipe: 'manifest@1', relationRevision: SHA('a'), origin: 'MANIFEST_MEMBERSHIP',
  evidence: [{ evidenceId: 'e1', evidenceRevision: SHA('b'), kind: 'GIT_BLOB' }],
});
const reasons = (f) => validateRelationFact(f).reasons;

test('a complete structural fact is admissible', () => {
  assert.equal(validateRelationFact(base()).verdict, 'ADMISSIBLE');
});

test('LLM and similarity origins are proposal-only whatever else is present', () => {
  for (const origin of ['LLM', 'EMBEDDING_SIMILARITY', 'KMEANS_CLUSTER', 'SOM_NEIGHBOR', 'HEURISTIC']) {
    const out = validateRelationFact({ ...base(), origin });
    assert.equal(out.verdict, 'PROPOSAL_ONLY');
    assert.equal(out.admissible, false);
  }
  assert.ok(reasons({ ...base(), origin: 'MADE_UP' }).includes('ORIGIN_UNKNOWN'));
});

test('endpoint class, direction and self relations are enforced', () => {
  assert.ok(reasons({ ...base(), source: { class: 'Concept', key: 'c' } }).includes('ENDPOINT_CLASS_PAIR_NOT_PERMITTED'));
  assert.ok(reasons({ ...base(), source: { class: 'Packet', key: 'p' }, target: { class: 'SourceFile', key: 's' } }).includes('DIRECTION_REVERSED'));
  assert.ok(reasons({ ...base(), type: 'CONTAINS', source: { class: 'Directory', key: 'd' }, target: { class: 'Directory', key: 'd' } }).includes('SELF_RELATION'));
  assert.ok(reasons({ ...base(), type: 'NOPE' }).includes('RELATION_TYPE_UNKNOWN'));
});

test('scope requires UUID repository and snapshot, or a valid cross-repository declaration', () => {
  assert.ok(reasons({ ...base(), scope: { repositoryId: 'repo:root', snapshotId: SNAP } }).includes('REPOSITORY_OR_SNAPSHOT_SCOPE_INVALID'));
  assert.ok(reasons({ ...base(), scope: undefined }).includes('SCOPE_MISSING'));
  assert.ok(reasons({ ...base(), scope: { crossRepository: true, repositoryIds: [REPO] } }).includes('CROSS_REPOSITORY_SCOPE_INVALID'));
  assert.equal(validateRelationFact({ ...base(), scope: { crossRepository: true, repositoryIds: [REPO, SNAP] } }).admissible, true);
});

test('evidence must exist, be complete, unique and independent of the extractor output', () => {
  assert.ok(reasons({ ...base(), evidence: [] }).includes('EVIDENCE_MISSING'));
  assert.ok(reasons({ ...base(), evidence: [{ evidenceId: 'e', kind: 'GIT_BLOB' }] }).includes('EVIDENCE_INCOMPLETE'));
  const dup = base().evidence[0];
  assert.ok(reasons({ ...base(), evidence: [dup, dup] }).includes('EVIDENCE_DUPLICATE'));
  assert.ok(reasons({ ...base(), evidence: [{ ...dup, kind: 'MANIFEST_MEMBERSHIP' }] }).includes('NO_INDEPENDENT_EVIDENCE'));
});

test('recipe and revision are mandatory', () => {
  assert.ok(reasons({ ...base(), extractionRecipe: '' }).includes('EXTRACTION_RECIPE_MISSING'));
  assert.ok(reasons({ ...base(), relationRevision: 'abc' }).includes('RELATION_REVISION_INVALID'));
});

test('insert-or-verify: insert, verify, and conflict without overwrite', () => {
  const f = base();
  assert.equal(decideRelationWrite(f, null).decision, 'INSERT');
  const existing = { identity: relationIdentity(f), relationRevision: f.relationRevision, extractionRecipe: f.extractionRecipe };
  assert.equal(decideRelationWrite(f, existing).decision, 'VERIFIED_EXISTING');
  assert.deepEqual(decideRelationWrite({ ...f, relationRevision: SHA('c') }, existing).reasons, ['RELATION_REVISION_DIFFERS']);
  assert.equal(decideRelationWrite(f, { ...existing, identity: 'other' }).decision, 'CONFLICT');
  assert.equal(decideRelationWrite({ ...f, origin: 'LLM' }, null).decision, 'REJECT');
});

test('logical identity ignores evidence and confidence so re-observation is not a new relation', () => {
  const a = base();
  const b = { ...base(), evidence: [{ evidenceId: 'zzz', evidenceRevision: SHA('d'), kind: 'GIT_BLOB' }], confidence: 0.1 };
  assert.equal(relationIdentity(a), relationIdentity(b));
});
