import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectoryMetadataSummariesV1 } from './directory-metadata-summaries-v1.mjs';

const directories = [
  { directoryPath: '.', parentPath: '', depth: 0, directFileCount: 4, directDirectoryCount: 1,
    directLinkCount: 0, directFileBytes: '100', subtreeFileCount: 8, subtreeDirectoryCount: 2,
    subtreeLinkCount: 0, subtreeFileBytes: '300' },
];
const input = { directories, featuresByDirectory: new Map([['.', [
  { featureKey: 'language-profile:typescript', evidenceKind: 'PROFILE_INVENTORY_COUNT', value: 3 },
  { featureKey: 'path-role:WORKTREE_FILE', evidenceKind: 'PATH_INVENTORY_COUNT', value: 4 },
]]]), directPackageRows: [{ directoryPath: '.', ecosystem: 'npm', packageName: 'zod', directReferenceCount: 2,
  evidenceStatus: 'ADVISORY_REGEX_CANDIDATE_AGGREGATE' }], inputBindings: { inventorySha256: 'a'.repeat(64) } };

test('emits deterministic, lineage-bound summaries with explicit evidence limits', () => {
  const first = buildDirectoryMetadataSummariesV1(input).summaries;
  const second = buildDirectoryMetadataSummariesV1({ ...input, directories: [...directories],
    directPackageRows: [...input.directPackageRows] }).summaries;
  assert.deepEqual(first, second);
  assert.match(first[0].summaryText, /typescript=3/);
  assert.match(first[0].summaryText, /npm:zod=2/);
  assert.equal(first[0].coverageStatus, 'INVENTORY_PROFILE_ROLE_AND_PACKAGE_CANDIDATES_ONLY');
  assert.equal(first[0].unavailableEvidence.includes('RESOLVED_SYMBOL_RELATIONS'), true);
});

test('rejects duplicate directory paths, features, and package rows', () => {
  assert.throws(() => buildDirectoryMetadataSummariesV1({ ...input, directories: [...directories, ...directories] }), /DIRECTORY_PATH_INVALID_OR_DUPLICATE/);
  assert.throws(() => buildDirectoryMetadataSummariesV1({ ...input, featuresByDirectory: new Map([['.', [
    ...input.featuresByDirectory.get('.'), input.featuresByDirectory.get('.')[0],
  ]]]) }), /DIRECTORY_FEATURE_INVALID_OR_DUPLICATE/);
  assert.throws(() => buildDirectoryMetadataSummariesV1({ ...input, directPackageRows: [...input.directPackageRows, ...input.directPackageRows] }), /DUPLICATE_DIRECT_PACKAGE_ROW/);
});
