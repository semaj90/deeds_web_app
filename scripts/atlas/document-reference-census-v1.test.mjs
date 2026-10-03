import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentReferenceCensusV1 as build, collectSupersededReferenceTargetsV1 as collect } from './document-reference-census-v1.mjs';

const superseded = {
  documentId: 'doc:old-123', path: 'docs/old-guide.md', title: 'Old Retrieval Guide',
  topicIds: ['search.fabric', 'semantic-768'], status: 'SUPERSEDED', supersededBy: ['doc:new-456'],
};

test('collects old path, title, explicit topics, document ID, and replacement ID only for superseded targets', () => {
  const targets = collect([superseded, { documentId: 'doc:current', path: 'docs/current.md', status: 'CANONICAL_CURRENT' }]);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].identifiers.map((item) => item.kind), ['OLD_PATH', 'TITLE', 'TOPIC_ID', 'TOPIC_ID', 'DOCUMENT_ID', 'SUPERSESSION_ID']);
});

test('uses exact injected rg results and excludes self-reference', () => {
  const calls = [];
  const report = build([superseded], (term, sourcePath) => {
    calls.push({ term, sourcePath });
    return { ok: true, files: [sourcePath, 'docs/architecture.md'] };
  });
  assert.equal(report.status, 'PROVEN_BOUNDED');
  assert.equal(calls.length, 6);
  assert.ok(report.targets[0].references.every((ref) => ref.files.length === 1 && ref.files[0] === 'docs/architecture.md'));
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
});

test('reports no targets without pretending that a repository scan occurred', () => {
  let called = false;
  const report = build([{ documentId: 'doc:current', path: 'docs/current.md', status: 'CANONICAL_CURRENT', supersededBy: [] }], () => { called = true; return { ok: true, files: [] }; });
  assert.equal(report.status, 'NO_SUPERSESSION_TARGETS');
  assert.equal(report.searchedIdentifierCount, 0);
  assert.equal(called, false);
});

test('fails closed when an exact-string search fails', () => {
  const report = build([superseded], () => ({ ok: false, files: [] }));
  assert.equal(report.status, 'BLOCKED_SEARCH_FAILURE');
  assert.equal(report.searchFailures, 6);
});
