import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectoryDomainCandidatesV1 } from './directory-domain-candidates-v1.mjs';

const digest = 'a'.repeat(64);
const groups = [
  { group_id: 'database', group_label: 'Database & Persistence', parent_group_id: null, description: 'Relational storage and ORM layers.' },
  { group_id: 'database.postgresql', group_label: 'PostgreSQL', parent_group_id: 'database', description: 'PostgreSQL and pgvector.' },
  { group_id: 'frontend', group_label: 'Frontend & UI', parent_group_id: null, description: 'Client-side application code.' },
];
const directories = [
  { relativePath: 'sveltekit-frontend/src/lib/server/postgresql', summarySha256: digest, inputDigest: digest, topDirectPackageCandidatesJson: '[]' },
  { relativePath: 'misc', summarySha256: digest, inputDigest: digest, topDirectPackageCandidatesJson: '[]' },
];

test('emits deterministic exact-token proposals and inherited parent candidates', () => {
  const first = buildDirectoryDomainCandidatesV1({ directories, groups, vocabularySha256: digest });
  const second = buildDirectoryDomainCandidatesV1({ directories: [...directories].reverse(), groups: [...groups].reverse(), vocabularySha256: digest });
  assert.deepEqual(first, second);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.rows.find(row => row.relativePath === 'misc').status, 'UNCLASSIFIED_NO_DOMAIN_SIGNAL');
  const child = first.rows.find(row => row.relativePath.includes('/postgresql') && row.candidateGroupId === 'database.postgresql');
  assert.equal(child.candidateKind, 'DIRECT_MATCH');
  assert.ok(first.rows.some(row => row.relativePath.includes('/postgresql') && row.candidateGroupId === 'database'
    && row.candidateKind === 'INHERITED_PARENT_CANDIDATE'));
  assert.equal(first.rows.find(row => row.relativePath.includes('/postgresql') && row.candidateGroupId === 'database')?.inheritedFromGroupId,
    'database.postgresql');
  assert.ok(first.rows.every(row => row.status === 'PROPOSAL_ONLY' || row.status === 'UNCLASSIFIED_NO_DOMAIN_SIGNAL'));
});

test('rejects duplicate directories, unresolved parents, malformed summaries, and malformed package evidence', () => {
  assert.throws(() => buildDirectoryDomainCandidatesV1({ directories: [...directories, directories[0]], groups, vocabularySha256: digest }), /DIRECTORY_SUMMARY_IDENTITY_INVALID/);
  assert.throws(() => buildDirectoryDomainCandidatesV1({ directories, groups: [...groups, { ...groups[0], group_id: 'orphan', parent_group_id: 'absent' }], vocabularySha256: digest }), /DOMAIN_PARENT_NOT_FOUND/);
  assert.throws(() => buildDirectoryDomainCandidatesV1({ directories: [{ ...directories[0], summarySha256: 'bad' }], groups, vocabularySha256: digest }), /DIRECTORY_SUMMARY_IDENTITY_INVALID/);
  assert.throws(() => buildDirectoryDomainCandidatesV1({ directories: [{ ...directories[0], topDirectPackageCandidatesJson: '{' }], groups, vocabularySha256: digest }), /DIRECTORY_PACKAGE_CANDIDATES_INVALID/);
});
