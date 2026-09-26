import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildClaudeInstructionSupersessionPlanV1 as buildPlan } from './document-governance-supersession-plan-v1.mjs';

const bytes = Buffer.from('current instruction');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const matchingSha = digest(bytes);
const record = (overrides = {}) => ({
  documentId: 'doc:a', path: 'CLAUDE.md', sha256: '1'.repeat(64), documentKind: 'CLAUDE_INSTRUCTIONS',
  status: 'CANONICAL_CURRENT', topicIds: [], canonicalForTopics: [], supersedes: [], supersededBy: [],
  supersessionStatus: 'UNASSESSED', validation: { contradictions: [] },
  instructionScope: { scopePath: '.', parentInstructionDocumentId: null, parentScopeStatus: 'ROOT' },
  ...overrides,
});
const input = (records, overrides = {}) => {
  const registryText = 'frozen-registry';
  return {
    registry: { records }, registryText,
    audit: { registryChecksum: digest(registryText), status: 'PROVEN_BOUNDED' },
    fileContents: new Map(records.map((item) => [item.path, bytes])),
    ...overrides,
  };
};

test('uses current file SHA and keeps scope distinct from supersession', () => {
  const item = record({ sha256: digest(bytes) });
  const { registry, registryText, audit } = input([item]);
  const plan = buildPlan({ registry, registryText, audit, fileContents: new Map([['CLAUDE.md', bytes]]) });
  assert.equal(plan.records[0].currentSha256, item.sha256);
  assert.equal(plan.records[0].proposedDisposition, 'CANONICAL_CURRENT');
  assert.deepEqual(plan.records[0].supersededBy, []);
  assert.equal(plan.recencyPolicy, 'IGNORED_NO_RECENCY_INFERENCE');
  assert.equal(plan.canonicalAuthority, false);
});

test('fails closed when source bytes drift from the registry digest', () => {
  const item = record();
  const { registry, registryText, audit } = input([item]);
  const plan = buildPlan({ registry, registryText, audit, fileContents: new Map([['CLAUDE.md', bytes]]) });
  assert.equal(plan.status, 'REVIEW_REQUIRED');
  assert.equal(plan.records[0].proposedDisposition, 'CONFLICT');
  assert.ok(plan.records[0].contradictions.includes('REGISTRY_SOURCE_DIGEST_MISMATCH'));
});

test('does not infer supersession from scope or newer modification metadata', () => {
  const parent = record({ sha256: matchingSha });
  const child = record({
    documentId: 'doc:b', path: 'nested/CLAUDE.md', sha256: matchingSha,
    modifiedAt: '2099-01-01T00:00:00.000Z',
    instructionScope: { scopePath: 'nested', parentInstructionDocumentId: 'doc:a', parentScopeStatus: 'RESOLVED' },
  });
  const { registry, registryText, audit } = input([parent, child]);
  const plan = buildPlan({ registry, registryText, audit, fileContents: new Map([['CLAUDE.md', bytes], ['nested/CLAUDE.md', bytes]]) });
  assert.equal(plan.records[1].proposedDisposition, 'SCOPED_SUPPORTING');
  assert.deepEqual(plan.records[1].supersedes, []);
  assert.deepEqual(plan.records[1].supersededBy, []);
  assert.equal(plan.summary.SUPERSEDED_CANDIDATE, 0);
});

test('rejects asymmetric explicit supersession declarations', () => {
  const old = record({ documentId: 'doc:old', path: 'old.md', sha256: '3'.repeat(64), supersededBy: ['doc:new'] });
  const current = record({ documentId: 'doc:new', path: 'new.md', sha256: '3'.repeat(64), supersedes: [] });
  const { registry, registryText, audit } = input([old, current]);
  const plan = buildPlan({ registry, registryText, audit, fileContents: new Map([['old.md', bytes], ['new.md', bytes]]) });
  assert.equal(plan.records[0].proposedDisposition, 'CONFLICT');
  assert.ok(plan.records[0].contradictions.some((item) => item.startsWith('SUPERSESSION_LINK_NOT_RECIPROCAL:')));
});
