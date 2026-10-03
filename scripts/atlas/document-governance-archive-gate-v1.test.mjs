import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditDocumentArchiveCandidatesV1 as auditCandidates,
  evaluateDocumentArchiveCandidateV1 as evaluate,
} from './document-governance-archive-gate-v1.mjs';

const completeRecord = () => {
  const old = {
    documentId: 'doc:old', path: 'docs/old.md', status: 'SUPERSEDED', supersessionStatus: 'VALIDATED',
    supersededBy: ['doc:new'], supersedes: [],
    openspec: { change: 'finished-change', completedTasks: 4, totalTasks: 4 },
    validation: { status: 'PASSED', linksChecked: true, referencesChecked: true, smokePassed: true, testsPassed: true, contradictions: [] },
  };
  const replacement = { documentId: 'doc:new', supersedes: ['doc:old'] };
  return { old, replacement, recordsById: new Map([[old.documentId, old], [replacement.documentId, replacement]]) };
};

test('admits only a fully validated, reciprocal, unreferenced archive candidate', () => {
  const { old, recordsById } = completeRecord();
  const result = evaluate(old, { recordsById, referenceAuditComplete: true });
  assert.equal(result.candidate, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.archiveApplied, false);
  assert.equal(result.canonicalAuthority, false);
});

test('blocks archive when an active instruction or OpenSpec spec still references the source', () => {
  const { old, recordsById } = completeRecord();
  const result = evaluate(old, { recordsById, referenceAuditComplete: true, activeReferences: [old.path] });
  assert.equal(result.candidate, false);
  assert.ok(result.blockers.includes('ACTIVE_DOCUMENT_REFERENCE_EXISTS'));
});

test('blocks incomplete OpenSpec tasks, missing replacement links, and unproven references', () => {
  const { old } = completeRecord();
  old.openspec.completedTasks = 3;
  old.supersededBy = ['doc:missing'];
  old.validation.referencesChecked = false;
  const result = evaluate(old, { recordsById: new Map([[old.documentId, old]]), referenceAuditComplete: false });
  assert.ok(result.blockers.includes('OPENSPEC_CHANGE_INCOMPLETE'));
  assert.ok(result.blockers.includes('REPLACEMENT_LINK_UNRESOLVED:doc:missing'));
  assert.ok(result.blockers.includes('ACTIVE_REFERENCE_AUDIT_NOT_PROVEN'));
});

test('requires an explicit exemption when no OpenSpec change is bound', () => {
  const { old, recordsById } = completeRecord();
  old.openspec = { change: null, completedTasks: null, totalTasks: null };
  assert.ok(evaluate(old, { recordsById, referenceAuditComplete: true }).blockers.includes('OPENSPEC_BINDING_OR_EXEMPTION_MISSING'));
  assert.equal(evaluate(old, { recordsById, referenceAuditComplete: true, archiveExemptionRef: 'receipt:approved-exemption' }).candidate, true);
});

test('never sends OpenSpec-owned paths or task artifacts through the documentation archive gate', () => {
  const { old, recordsById } = completeRecord();
  old.path = 'openspec/changes/archive/sample/tasks.md';
  old.documentKind = 'OPENSPEC_TASKS';
  const result = evaluate(old, { recordsById, referenceAuditComplete: true });
  assert.equal(result.candidate, false);
  assert.ok(result.blockers.includes('OPENSPEC_OWNED_ARCHIVE_LIFECYCLE'));
  assert.equal(result.archiveApplied, false);
});

test('registry audit never treats a record flag as proof of active-reference scan', () => {
  const { old, replacement } = completeRecord();
  const result = auditCandidates([old, replacement]);
  assert.equal(result.reviewedDocuments, 1);
  assert.equal(result.eligibleCandidates, 0);
  assert.ok(result.results[0].blockers.includes('ACTIVE_REFERENCE_AUDIT_NOT_PROVEN'));
  assert.equal(result.writesPerformed, false);
});

test('reports why the archive review has no candidates without treating absence as eligibility', () => {
  const result = auditCandidates([{ documentId: 'doc:current', path: 'docs/current.md', status: 'CANONICAL_CURRENT', supersededBy: [] }]);
  assert.equal(result.reviewedDocuments, 0);
  assert.equal(result.noCandidateReason, 'NO_SUPERSESSION_OR_ARCHIVE_CANDIDATES');
  assert.equal(result.eligibleCandidates, 0);
  assert.equal(result.writesPerformed, false);
});
