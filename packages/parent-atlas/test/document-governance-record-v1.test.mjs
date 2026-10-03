import test from 'node:test';
import assert from 'node:assert/strict';
import { documentGovernanceRecordV1Schema, documentGovernanceRegistryV1Schema } from '../dist/core/document-governance-record-v1.js';

const record = {
  schema: 'atlas.document-governance-record.v1',
  documentId: `doc:sha256:${'a'.repeat(64)}`,
  path: 'openspec/changes/sample/tasks.md',
  sha256: 'b'.repeat(64),
  bytes: 12,
  title: null,
  documentKind: 'OPENSPEC_TASKS',
  status: 'ACTIVE_SUPPORTING',
  topicIds: [],
  canonicalForTopics: [],
  topicOwnershipStatus: 'UNASSIGNED',
  instructionScope: null,
  supersedes: [],
  supersededBy: [],
  supersessionStatus: 'UNASSESSED',
  supersessionReason: null,
  openspec: { change: 'sample', taskRefs: [], completedTasks: 1, totalTasks: 2, progressFraction: 0.5 },
  validation: {
    status: 'NOT_CHECKED', linksChecked: false, referencesChecked: false,
    smokePassed: false, testsPassed: false, contradictions: [], receiptRefs: [],
  },
  workflow: null,
  archive: { eligible: false, blockedReasons: ['NO_EXPLICIT_SUPERSESSION_RECEIPT'], archivedPath: null },
};

test('accepts an explicit, non-promotional governance record', () => {
  assert.equal(documentGovernanceRecordV1Schema.parse(record).workflow, null);
});

test('rejects fabricated topic ownership and progress without task counts', () => {
  assert.equal(documentGovernanceRecordV1Schema.safeParse({ ...record, topicIds: ['atlas.topic'] }).success, false);
  assert.equal(documentGovernanceRecordV1Schema.safeParse({
    ...record,
    openspec: { ...record.openspec, completedTasks: null, totalTasks: null },
  }).success, false);
});

test('rejects archive eligibility when blockers remain and unknown fields', () => {
  assert.equal(documentGovernanceRecordV1Schema.safeParse({
    ...record,
    archive: { ...record.archive, eligible: true },
  }).success, false);
  assert.equal(documentGovernanceRecordV1Schema.safeParse({ ...record, canonicalAuthority: true }).success, false);
});

test('validates the registry envelope and every nested record', () => {
  const registry = {
    schema: 'atlas.document.governance.registry.v1',
    generatedBy: 'test',
    generatedAt: 'DETERMINISTIC',
    canonicalAuthority: 'DOCUMENT_STATUS_ONLY',
    supersessionPolicy: 'EXPLICIT_LINK_AND_RECEIPT_ONLY',
    records: [record],
  };
  assert.equal(documentGovernanceRegistryV1Schema.safeParse(registry).success, true);
  assert.equal(documentGovernanceRegistryV1Schema.safeParse({ ...registry, records: [{ ...record, path: '../escape.md' }] }).success, false);
});
