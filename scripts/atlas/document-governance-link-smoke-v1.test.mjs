import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyDocumentLinksV1 as verify } from './document-governance-link-smoke-v1.mjs';

const bytes = new Map([['docs/current.md', Buffer.from('current')], ['docs/old.md', Buffer.from('old')], ['docs/new.md', Buffer.from('new')]]);
const digest = (path) => createHash('sha256').update(bytes.get(path)).digest('hex');
const current = { documentId: 'doc:current', path: 'docs/current.md', status: 'CANONICAL_CURRENT', sha256: digest('docs/current.md'), supersededBy: [], supersedes: [] };
const old = { documentId: 'doc:old', path: 'docs/old.md', status: 'SUPERSEDED', sha256: digest('docs/old.md'), supersededBy: ['doc:new'], supersedes: [] };
const replacement = { documentId: 'doc:new', path: 'docs/new.md', status: 'SCOPED_SUPPORTING', sha256: digest('docs/new.md'), supersededBy: [], supersedes: ['doc:old'] };

test('verifies canonical and reciprocal replacement document links and checksums', () => {
  const result = verify([current, old, replacement], (path) => bytes.get(path));
  assert.equal(result.status, 'PROVEN_BOUNDED');
  assert.equal(result.canonicalDocumentsChecked, 1);
  assert.equal(result.replacementDocumentsChecked, 1);
  assert.equal(result.replacementLinksChecked, 1);
});

test('fails closed for missing or nonreciprocal replacement links', () => {
  const broken = { ...replacement, supersedes: [] };
  const result = verify([current, old, broken], (path) => bytes.get(path));
  assert.ok(result.failures.includes('REPLACEMENT_LINK_NOT_RECIPROCAL:doc:old:doc:new'));
});

test('fails closed when a canonical or replacement file is missing or stale', () => {
  const result = verify([current, old, replacement], (path) => path === 'docs/new.md' ? Buffer.from('drift') : null);
  assert.equal(result.status, 'BLOCKED_LINK_OR_SOURCE_FAILURE');
  assert.ok(result.failures.some((failure) => failure.startsWith('DOCUMENT_SOURCE_MISSING:')));
  assert.ok(result.failures.includes('DOCUMENT_CHECKSUM_MISMATCH:doc:new'));
});
