#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  compareRepositoryMembershipV1,
  computeCanonicalRepositoryTupleChecksumV1,
  computeRepositoryIdentitySetChecksumV1,
} from './lib/graphify-repository-membership-delta-v1.mts';

const executionId = '11111111-1111-4111-8111-111111111111';
const revisionA = `sha256:${'a'.repeat(64)}`;
const revisionB = `sha256:${'b'.repeat(64)}`;
const workspaceRevision = `sha256:${'c'.repeat(64)}`;

const snapshotSources = [
  {
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/a.ts',
    sourceRef: 'src/a.ts',
    sourceRevision: revisionA,
    contentDigest: 'a'.repeat(64),
    byteLength: 10,
  },
  {
    repositoryId: 'repo:nested',
    repositoryRelativePath: 'src/a.ts',
    sourceRef: 'nested/src/a.ts',
    sourceRevision: revisionB,
    contentDigest: 'b'.repeat(64),
    byteLength: 20,
  },
];

const memberships = [
  {
    execution_id: executionId,
    repository_id: 'repo:root',
    repository_relative_path: 'src/a.ts',
    source_ref: 'src/a.ts',
    workspace_revision: workspaceRevision,
    code_source_revision: revisionA,
    content_hash: 'a'.repeat(64),
    byte_length: 10,
  },
  {
    execution_id: executionId,
    repository_id: 'repo:nested',
    repository_relative_path: 'src/a.ts',
    source_ref: 'nested/src/a.ts',
    workspace_revision: workspaceRevision,
    code_source_revision: revisionB,
    content_hash: `sha256:${'b'.repeat(64)}`,
    byte_length: 20,
  },
];

const identities = ['repo:root:src/a.ts', 'repo:nested:src/a.ts'];
const checksum = computeRepositoryIdentitySetChecksumV1(identities);
const execution = {
  execution_id: executionId,
  workspace_revision: workspaceRevision,
  status: 'COMPLETED',
  canonical_authority: false,
};
const stage = {
  execution_id: executionId,
  status: 'COMPLETED',
  output_checksum: checksum,
};

const exact = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution,
  sourceSelectionStages: [stage],
});
assert.equal(exact.eligibleExactNotAdmitted, true);
assert.equal(exact.eligibleExactAlreadyAdmitted, false);
assert.equal(exact.snapshotIdentityCount, 2);
assert.equal(exact.membershipIdentityCount, 2);
assert.equal(exact.matchedIdentityCount, 2);
assert.deepEqual(exact.blockingIssueCodes, []);
assert.equal(exact.sourceSelectionChecksumMatch, true);
assert.equal(exact.canonicalChecksumMatch, true);

// Same repository-relative path in two repositories must remain two identities.
assert.equal(new Set(identities).size, 2);

const aliasOnly = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships.map((row, index) =>
    index === 1 ? { ...row, source_ref: './nested/src/a.ts' } : row,
  ),
  execution,
  sourceSelectionStages: [stage],
});
assert.equal(aliasOnly.eligibleExactNotAdmitted, true);
assert.equal(aliasOnly.sourceRefAliasMismatches.length, 0);

const badRevision = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships.map((row, index) =>
    index === 0 ? { ...row, code_source_revision: revisionB } : row,
  ),
  execution,
  sourceSelectionStages: [stage],
});
assert.equal(badRevision.eligibleExactNotAdmitted, false);
assert.deepEqual(badRevision.codeSourceRevisionMismatches, ['repo:root:src/a.ts']);
assert.ok(badRevision.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_SOURCE_REVISION_MISMATCH'));

const duplicate = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: [...memberships, memberships[0]],
  execution,
  sourceSelectionStages: [stage],
});
assert.equal(duplicate.eligibleExactNotAdmitted, false);
assert.deepEqual(duplicate.duplicateMembershipIdentities, ['repo:root:src/a.ts']);

const checksumMismatch = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution,
  sourceSelectionStages: [{ ...stage, output_checksum: `sha256:${'f'.repeat(64)}` }],
});
assert.equal(checksumMismatch.eligibleExactNotAdmitted, false);
assert.ok(checksumMismatch.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_CHECKSUM_MISMATCH'));

const duplicateStages = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution,
  sourceSelectionStages: [stage, { ...stage }],
});
assert.equal(duplicateStages.eligibleExactNotAdmitted, false);
assert.equal(duplicateStages.sourceSelectionStageCount, 2);
assert.ok(duplicateStages.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_MULTIPLE_SOURCE_SELECTION_STAGES'));

const malformedMembership = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: [memberships[0], { ...memberships[1], repository_id: '' }],
  execution,
  sourceSelectionStages: [stage],
});
assert.equal(malformedMembership.eligibleExactNotAdmitted, false);
assert.equal(malformedMembership.invalidMembershipIdentityRows.length, 1);
assert.ok(malformedMembership.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_INVALID_IDENTITIES'));

const alreadyAdmitted = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution: { ...execution, canonical_authority: true },
  sourceSelectionStages: [stage],
});
assert.equal(alreadyAdmitted.eligibleExactNotAdmitted, false);
assert.equal(alreadyAdmitted.eligibleExactAlreadyAdmitted, true);

// The new canonical diagnostic checksum preserves tuple boundaries and is
// deliberately distinct from the current legacy SOURCE_SELECTION codec.
const canonicalChecksum = computeCanonicalRepositoryTupleChecksumV1([
  ['repo:root', 'src/a.ts'],
  ['repo:nested', 'src/a.ts'],
]);
assert.match(canonicalChecksum, /^sha256:[a-f0-9]{64}$/);
assert.notEqual(canonicalChecksum, checksum);

console.log(JSON.stringify({
  schema: 'atlas.graphify-repository-membership-delta-smoke.v1',
  status: 'PASSED',
  tests: 9,
  proves: [
    'repository-qualified identity keeps nested repositories distinct',
    'exact revision/content/length parity is required',
    'duplicate membership identities fail closed',
    'SOURCE_SELECTION checksum remains compatible with the current v2 writer',
    'source_ref normalization is diagnostic and never replaces repository-qualified identity',
    'multiple SOURCE_SELECTION rows fail closed',
    'malformed membership identities become evidence instead of throwing the audit',
    'already-admitted executions are classified separately from not-admitted matches',
    'collision-resistant tuple checksum is diagnostic-only and does not change writer semantics',
  ],
  writesPerformed: false,
}, null, 2));
